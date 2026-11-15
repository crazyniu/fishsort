class_name WheelPage
extends HomePage
## 抽奖页（docs/01 §5.5）：一只宝箱 + 剩余次数 + 开箱按钮（免费、分享、广告、金币、十连）。
## 页面只留这些：不放顶栏，也不展示概率。
## 开箱：宝箱左右晃动、越晃越大 → 盖子弹开冒星光 → 弹出开奖。

const CHEST_SIDE := 260.0
const SHAKE_TIME := 0.9
const TEN_SHAKE_TIME := 1.3
const SHAKE_STEPS := 8

var _model: HomeModel
var _controls: Control
var _chest: Control
var _closed: TextureRect
var _open: TextureRect
var _busy: bool = false
var _controls_top: float = 0.0


func build() -> void:
	_model = host.model
	# 抽奖是主页的子页面，左上角糖果风返回键
	btn(self, tr("H_BACK"), UiKit.BLUE, Vector2(24, 24), Vector2(150, 70), _on_back, 30)
	# 整组内容在页面里垂直居中
	var top: float = maxf(120.0, (size.y - 700.0) / 2.0 - 20.0)
	_chest = Control.new()
	_chest.size = Vector2(CHEST_SIDE, CHEST_SIDE)
	_chest.pivot_offset = _chest.size / 2.0
	add(_chest, Vector2((W - CHEST_SIDE) / 2.0, top))
	_closed = UiKit.icon("res://assets/ui/chest_closed.png", CHEST_SIDE)
	_chest.add_child(_closed)
	_open = UiKit.icon("res://assets/ui/chest_open.png", CHEST_SIDE)
	_open.visible = false
	_chest.add_child(_open)
	Anim.pop_in(_chest, 0.05, 0.4)
	Anim.bob(_chest, 8.0, 2.4)
	_build_controls(top + CHEST_SIDE + 16.0)


func _on_back() -> void:
	if not _busy:
		host.go_tab(HomeScreen.TAB_MAIN)


## y 是「剩余次数」文字的位置，按钮顺着往下排
func _build_controls(y: float = -1.0) -> void:
	if y >= 0.0:
		_controls_top = y
	if _controls != null:
		_controls.queue_free()
	_controls = Control.new()
	_controls.size = size
	_controls.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_controls)
	var left: int = _model.spins_left()
	var count := UiKit.label(tr("H_SPINS_LEFT") % left, 32, UiKit.GOLD if left > 0 else Color.WHITE)
	add_to(_controls, count, Vector2(0, _controls_top), Vector2(W, 44))
	var row_y: float = _controls_top + 64.0
	var main: KitButton
	if left > 0:
		main = btn(
			_controls, tr("H_SPIN"), UiKit.GREEN, Vector2(155, row_y), Vector2(440, 96), spin, 42
		)
		Anim.pulse(main, 1.04, 1.1)
	else:
		main = btn(
			_controls,
			tr("H_SPIN_ONE"),
			UiKit.GREEN,
			Vector2(155, row_y),
			Vector2(440, 96),
			spin,
			34
		)
		coin_price(main, _model.price("spin"))
	main.disabled = _busy
	row_y += 116.0
	var share := btn(
		_controls,
		tr("H_SHARE_PLUS") + "  %d/%d" % [_model.spin_share_left(), _model.spin_share_cap()],
		UiKit.BLUE,
		Vector2(70, row_y),
		Vector2(290, 72),
		_on_share,
		26
	)
	share.disabled = _model.spin_share_left() <= 0 or _busy
	if Ads.available():
		var ad := btn(
			_controls,
			tr("H_AD_PLUS") + "  %d/%d" % [_model.spin_ad_left(), _model.spin_ad_cap()],
			UiKit.PURPLE,
			Vector2(390, row_y),
			Vector2(290, 72),
			_on_ad,
			26
		)
		ad_badge(ad)
		ad.disabled = _model.spin_ad_left() <= 0 or _busy
	row_y += 92.0
	var ten := btn(
		_controls,
		tr("H_TEN_PULL"),
		UiKit.ORANGE,
		Vector2(155, row_y),
		Vector2(440, 80),
		_on_ten,
		32
	)
	coin_price(ten, _model.price("ten"))
	ten.disabled = _busy


func _on_share() -> void:
	if _model.share_spin():
		Audio.sfx(&"coin")
		_build_controls()


func _on_ad() -> void:
	if await Ads.rewarded(&"rv_wheel") and is_inside_tree() and _model.ad_spin():
		Audio.sfx(&"coin")
		_build_controls()


## 开一次。没有存下的次数时用金币买；金币不够弹金币不足
func spin() -> void:
	if _busy:
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
	_busy = true
	_build_controls()
	_open_chest(SHAKE_TIME, _show_prize.bind(result))


func _after_coins() -> void:
	host.refresh_top()
	_build_controls()


func _on_ten() -> void:
	if _busy:
		return
	if not _model.can_afford(_model.price("ten")):
		Audio.sfx(&"error")
		HomePopups.coin_shortage(host, _model.price("ten"), _after_coins)
		return
	var prizes: Array = _model.ten_pull()
	if prizes.is_empty():
		return
	host.refresh_top()
	_busy = true
	_build_controls()
	_open_chest(TEN_SHAKE_TIME, _show_ten.bind(prizes))


## 晃动越来越大 → 盖子弹开 → 停一下再开奖
func _open_chest(time: float, done: Callable) -> void:
	var tw: Tween = create_tween()
	for i: int in SHAKE_STEPS:
		var deg: float = lerpf(3.0, 12.0, float(i) / (SHAKE_STEPS - 1.0))
		deg *= 1.0 if i % 2 == 0 else -1.0
		tw.tween_callback(Audio.sfx.bind(&"click", 0.9 + i * 0.06))
		tw.tween_property(_chest, "rotation_degrees", deg, time / SHAKE_STEPS).set_trans(
			Tween.TRANS_SINE
		)
	tw.tween_property(_chest, "rotation_degrees", 0.0, 0.08)
	tw.tween_callback(_pop_open)
	tw.tween_interval(0.5)
	tw.tween_callback(done)


func _pop_open() -> void:
	_closed.visible = false
	_open.visible = true
	Audio.sfx(&"coin")
	Anim.squash(_chest, 0.16)
	var center: Vector2 = _chest.position + _chest.size / 2.0 - Vector2(0, 40)
	Anim.burst(
		self, center, 16, "res://assets/ui/star.png", 460, 900, Vector2(26, 46), 0.9, 44, true
	)


func _finish() -> void:
	_busy = false
	_closed.visible = true
	_open.visible = false
	host.refresh_top()
	_build_controls()


func _show_prize(prize: Dictionary) -> void:
	_finish()
	MetaPopups.prize_reveal(host, [prize], tr("H_CONGRATS"))


func _show_ten(prizes: Array) -> void:
	_finish()
	MetaPopups.prize_reveal(host, prizes, tr("H_TEN_TITLE"))
