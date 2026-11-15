class_name WheelPage
extends HomePage
## 抽奖页（docs/01 §5.5）：转盘 + 剩余次数 + 抽奖按钮（免费、分享、广告、金币、十连）+ 概率表。
## 旋转先快后慢缓停在结果扇区，沿途滴答；停下后弹开奖。

const RADIUS := 250.0
const SPIN_TIME := 4.2
const TURNS := 5

var wheel: WheelView

var _model: HomeModel
var _controls: Control
var _spinning: bool = false
var _tick_pitch: float = 1.0


func build() -> void:
	_model = host.model
	title(tr("H_TAB_WHEEL"))
	# 抽奖是主页的子页面，左上角返回
	btn(self, tr("H_BACK"), UiKit.BLUE, Vector2(30, 22), Vector2(130, 56), _on_back, 26)
	var odds := btn(
		self,
		tr("H_ODDS"),
		UiKit.BLUE,
		Vector2(W - 30.0 - 130.0, 22),
		Vector2(130, 56),
		_on_odds,
		26
	)
	odds.tooltip_text = tr("H_ODDS")
	wheel = WheelView.new().setup(_model.wheel(), RADIUS)
	add(wheel, Vector2((W - wheel.size.x) / 2.0, 80))
	wheel.ticked.connect(_on_tick)
	Anim.pop_in(wheel, 0.05, 0.4)
	_build_controls()


func _on_back() -> void:
	if not _spinning:
		host.go_tab(HomeScreen.TAB_MAIN)


func _build_controls() -> void:
	if _controls != null:
		_controls.queue_free()
	_controls = Control.new()
	_controls.size = size
	_controls.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_controls)
	var left: int = _model.spins_left()
	var count := UiKit.label(tr("H_SPINS_LEFT") % left, 32, UiKit.GOLD if left > 0 else Color.WHITE)
	add_to(_controls, count, Vector2(0, 664), Vector2(W, 44))
	var main: KitButton
	if left > 0:
		main = btn(
			_controls, tr("H_SPIN"), UiKit.GREEN, Vector2(135, 716), Vector2(480, 100), spin, 44
		)
		Anim.pulse(main, 1.04, 1.1)
	else:
		main = btn(
			_controls, tr("H_SPIN_ONE"), UiKit.GREEN, Vector2(135, 716), Vector2(480, 100), spin, 36
		)
		coin_price(main, _model.price("spin"))
	main.disabled = _spinning
	var share := btn(
		_controls,
		tr("H_SHARE_PLUS") + "  %d/%d" % [_model.spin_share_left(), _model.spin_share_cap()],
		UiKit.BLUE,
		Vector2(30, 838),
		Vector2(335, 84),
		_on_share,
		28
	)
	share.disabled = _model.spin_share_left() <= 0
	if Ads.available():
		var ad := btn(
			_controls,
			tr("H_AD_PLUS") + "  %d/%d" % [_model.spin_ad_left(), _model.spin_ad_cap()],
			UiKit.PURPLE,
			Vector2(385, 838),
			Vector2(335, 84),
			_on_ad,
			28
		)
		ad_badge(ad)
		ad.disabled = _model.spin_ad_left() <= 0
	var ten := btn(
		_controls, tr("H_TEN_PULL"), UiKit.ORANGE, Vector2(30, 944), Vector2(690, 84), _on_ten, 34
	)
	coin_price(ten, _model.price("ten"))


func _on_odds() -> void:
	MetaPopups.odds(host)


func _on_share() -> void:
	if _model.share_spin():
		Audio.sfx(&"coin")
		_build_controls()


func _on_ad() -> void:
	if await Ads.rewarded(&"rv_wheel") and is_inside_tree() and _model.ad_spin():
		Audio.sfx(&"coin")
		_build_controls()


## 抽一次。没有存下的次数时用金币买；金币不够弹金币不足
func spin() -> void:
	if _spinning:
		return
	var pay_coins: bool = _model.spins_left() <= 0
	if pay_coins and not _model.can_afford(_model.price("spin")):
		Audio.sfx(&"error")
		HomePopups.coin_shortage(host, _model.price("spin"), _after_coins)
		return
	var result: Dictionary = _model.spin_wheel(pay_coins)
	if result.is_empty():
		return
	host.refresh_top()
	_spinning = true
	_build_controls()
	_rotate_to(int(result["index"]), SPIN_TIME, TURNS, _show_prize.bind(result))


func _after_coins() -> void:
	host.refresh_top()
	_build_controls()


func _on_ten() -> void:
	if _spinning:
		return
	if not _model.can_afford(_model.price("ten")):
		Audio.sfx(&"error")
		HomePopups.coin_shortage(host, _model.price("ten"), _after_coins)
		return
	var prizes: Array = _model.ten_pull()
	if prizes.is_empty():
		return
	host.refresh_top()
	_spinning = true
	_build_controls()
	_rotate_to(
		int((prizes[prizes.size() - 1] as Dictionary)["index"]), 1.8, 2, _show_ten.bind(prizes)
	)


## 转到 index 号扇区正对指针：先快后慢缓停，沿途滴答
func _rotate_to(index: int, time: float, turns: int, done: Callable) -> void:
	var seg: float = TAU / _model.wheel().size()
	var want: float = fposmod(-index * seg - wheel.rot, TAU)
	var jitter: float = randf_range(-0.3, 0.3) * seg
	var target: float = wheel.rot + TAU * turns + want + jitter
	_tick_pitch = 1.0
	var tw: Tween = create_tween()
	tw.tween_property(wheel, "rot", target, time).set_trans(Tween.TRANS_QUART).set_ease(
		Tween.EASE_OUT
	)
	tw.tween_callback(done)


func _on_tick() -> void:
	Audio.sfx(&"click", _tick_pitch)
	_tick_pitch = minf(1.5, _tick_pitch + 0.004)


func _finish_spin() -> void:
	_spinning = false
	Anim.bounce(wheel, 1.04, 0.25)
	host.refresh_top()
	_build_controls()


func _show_prize(prize: Dictionary) -> void:
	_finish_spin()
	MetaPopups.prize_reveal(host, [prize], tr("H_CONGRATS"))


func _show_ten(prizes: Array) -> void:
	_finish_spin()
	MetaPopups.prize_reveal(host, prizes, tr("H_TEN_TITLE"))
