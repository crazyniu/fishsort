class_name WinPanel
extends Control
## 过关结算页（docs/01 第 3.3、3.4 节）：同一屏里依次是横幅砸下、三颗星逐个点亮、
## 金币数字滚动、宝箱晃动发光后弹开亮出奖品、按钮出现。动画期间点任意处直接跳到最终状态。
## 金币和宝箱在打开本页之前已经由 Settle / LevelChest 入账，这里只负责演出和三个追加动作：
## 金币翻倍（广告）、再开一个宝箱（广告，每关一次）、分享炫耀。

const W := 750.0
const CHEST_AT := Vector2(375, 640)

var _info: Dictionary
var _result: Dictionary
var _chest: Dictionary
## 宝箱下面的小字：连击送的图鉴、上一个宝箱开出的东西
var _extras: Array[String] = []
var _on_next: Callable
var _on_home: Callable
var _box: Control
var _chest_box: Control
var _coins: int = 0
var _doubled: bool = false
var _ad_chest: bool = false
var _shared: bool = false
var _animating: bool = false


## info: { result（Settle.win 的返回值）, chest（LevelChest.open 的返回值，没有则为空）,
##         combo_card（连击送的图鉴卡，没有则为空）, best, level, challenge }
static func open(host: Control, info: Dictionary, on_next: Callable, on_home: Callable) -> WinPanel:
	var p := WinPanel.new()
	p.size = host.size
	p.z_index = 100
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	p._info = info
	p._result = info["result"]
	p._chest = info["chest"]
	p._coins = int(p._result["coins"])
	p._on_next = on_next
	p._on_home = on_home
	var combo_card: Dictionary = info["combo_card"]
	if not combo_card.is_empty():
		p._extras.append(p.tr("UI_COMBO_CARD") + " " + p._card_text(combo_card))
	host.add_child(p)
	p._build(true, true)
	return p


func _cfg(key: String) -> float:
	return GameCfg.num("win", key)


func _put(node: Control, pos: Vector2, area: Vector2 = Vector2.ZERO) -> Control:
	node.position = pos
	if area != Vector2.ZERO:
		node.size = area
		node.pivot_offset = area / 2.0
	_box.add_child(node)
	return node


## 动画还没播完时，点任意位置直接跳到最终状态
func _gui_input(event: InputEvent) -> void:
	var pressed: bool = (
		(event is InputEventMouseButton and (event as InputEventMouseButton).pressed)
		or (event is InputEventScreenTouch and (event as InputEventScreenTouch).pressed)
	)
	if pressed and _animating:
		_build(false, false)


## animate：整页的入场动画；chest_anim：宝箱从晃动到弹开的那一段；
## coins_from ≥ 0 时金币数字从这个数滚到当前值（翻倍之后）
func _build(animate: bool, chest_anim: bool, coins_from: int = -1) -> void:
	for c: Node in get_children():
		c.queue_free()
	_animating = animate
	var shade := ColorRect.new()
	shade.color = Color(0.01, 0.06, 0.18, 0.86)
	shade.size = size
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	_box = Control.new()
	_box.size = Vector2(W, size.y)
	_box.position = Vector2((size.x - W) / 2.0, maxf(0.0, (size.y - 1240.0) / 2.0))
	_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_box)
	if animate:
		shade.modulate.a = 0.0
		shade.create_tween().tween_property(shade, "modulate:a", 1.0, 0.2)
		Anim.confetti(self, size.x, 60)
		var done: Tween = create_tween()
		done.tween_interval(_cfg("buttonsAt") + 0.35)
		done.tween_callback(func() -> void: _animating = false)
	_banner(animate)
	_coin_row(animate, coins_from)
	_chest_box = Control.new()
	_chest_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_box.add_child(_chest_box)
	if _chest.is_empty():
		if not _result["rewarded"]:
			_put(
				UiKit.label(tr("UI_REPLAY_NO_REWARD"), 30, Color("BFE6FF")),
				Vector2(0, CHEST_AT.y - 30),
				Vector2(W, 60)
			)
	elif chest_anim:
		_chest_intro(_cfg("chestAt") if animate else 0.0)
	else:
		_reveal(false)
	for i: int in _extras.size():
		_put(UiKit.label(_extras[i], 24, Color("BFE6FF")), Vector2(0, 776 + i * 30), Vector2(W, 30))
	_buttons(animate)


# ---------- 横幅、星星、金币 ----------


## 横幅「过关！」砸下来，三颗星依次点亮、各响一声
func _banner(animate: bool) -> void:
	var ribbon := UiKit.piece("ribbon")
	_put(ribbon, Vector2(55, 120), Vector2(640, 134))
	var title := UiKit.label(tr("UI_FINISH_TITLE"), 72)
	_put(title, Vector2(55, 116), Vector2(640, 120))
	if animate:
		for n: Control in [ribbon, title]:
			n.scale = Vector2(2.2, 2.2)
			n.modulate.a = 0.0
			var tw: Tween = n.create_tween().set_parallel()
			tw.tween_property(n, "scale", Vector2.ONE, 0.2).set_ease(Tween.EASE_IN)
			tw.tween_property(n, "modulate:a", 1.0, 0.1)
			tw.chain().tween_property(n, "scale", Vector2(1.08, 0.92), 0.05)
			tw.chain().tween_property(n, "scale", Vector2.ONE, 0.15).set_trans(Tween.TRANS_BACK)
		Audio.sfx(&"land", 0.8)
	for i: int in 3:
		var side: float = 104.0 if i == 1 else 84.0
		var star := UiKit.icon("res://assets/ui/star.png", side)
		_put(
			star,
			Vector2(W / 2.0 + (i - 1) * 118 - side / 2.0, 40 - (22 if i == 1 else 0)),
			Vector2(side, side)
		)
		if not animate:
			continue
		star.scale = Vector2.ZERO
		star.rotation = -0.8
		var st: Tween = star.create_tween()
		st.tween_interval(_cfg("starAt") + i * _cfg("starGap"))
		st.tween_callback(Audio.sfx.bind(&"star", 1.0 + i * 0.12))
		st.tween_callback(_star_flash.bind(star.position + star.size / 2.0))
		st.tween_property(star, "scale", Vector2(1.4, 1.4), 0.1)
		st.parallel().tween_property(star, "rotation", 0.0, 0.2)
		st.tween_property(star, "scale", Vector2.ONE, 0.16).set_trans(Tween.TRANS_BACK).set_ease(
			Tween.EASE_OUT
		)


func _star_flash(at: Vector2) -> void:
	var ring := UiKit.badge("fx_ring", 120)
	ring.modulate = Color("FFF3A0")
	_put(ring, at - Vector2(60, 60))
	ring.scale = Vector2(0.3, 0.3)
	var tw: Tween = ring.create_tween().set_parallel()
	tw.tween_property(ring, "scale", Vector2(1.6, 1.6), 0.3).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, 0.3)
	tw.chain().tween_callback(ring.queue_free)


## 金币总数（过关 + 连击 + 最高连击奖，翻倍后更多）滚动着涨上去，下面一行小字是明细
func _coin_row(animate: bool, coins_from: int) -> void:
	var cap: Dictionary = UiKit.capsule("res://assets/ui/coin.png", 300, 68)
	var box: Control = cap["box"]
	_put(box, Vector2((W - 300) / 2.0, 278), Vector2(300, 68))
	var num: Label = cap["label"]
	num.text = "+%d" % _coins
	var from: int = 0 if animate else coins_from
	if from >= 0 and from != _coins:
		num.text = "+%d" % from
		var tw: Tween = num.create_tween()
		tw.tween_interval(_cfg("coinsAt") if animate else 0.0)
		tw.tween_callback(Audio.sfx.bind(&"coins"))
		tw.tween_method(
			func(v: float) -> void: num.text = "+%d" % int(round(v)),
			float(from),
			float(_coins),
			_cfg("coinsRoll")
		)
		tw.tween_callback(Anim.bounce.bind(box, 1.15, 0.25))
	if animate:
		Anim.pop_in(box, _cfg("coinsAt") - 0.15, 0.2)
	# 明细不用一行小字，改成「图标 + 数字」一排，下面是很短的说明
	var stats: Array = []
	if int(_result["coins_base"]) > 0:
		stats.append(
			["res://assets/ui/tank.png", "+%d" % int(_result["coins_base"]), tr("UI_STAT_CLEAR")]
		)
	if int(_result["coins_combo"]) > 0:
		stats.append(["fx_spark", "+%d" % int(_result["coins_combo"]), tr("UI_STAT_COMBO")])
	if int(_result["coins_best"]) > 0:
		stats.append(
			[
				"res://assets/ui/star.png",
				"+%d" % int(_result["coins_best"]),
				tr("UI_STAT_BEST") % int(_info["best"])
			]
		)
	if _doubled:
		stats.append(
			[
				"res://assets/ui/coin.png",
				"×%d" % int(Config.eco["adCoinMultiplier"]),
				tr("UI_STAT_AD")
			]
		)
	_stat_row(stats, 352, Color.WHITE)
	if _result["first_win"]:
		var mins: int = int(_result["unlimited"]) / 60
		_stat_row(
			[
				["res://assets/ui/tab_wheel.png", "+1", tr("UI_STAT_FIRST")],
				["res://assets/ui/heart_inf.png", tr("UI_MINUTES") % mins, tr("UI_STAT_FIRST")]
			],
			436,
			UiKit.GOLD
		)


## 一排居中的小项：每项是图标 + 数字，下面一行短说明。items: [图标路径或部件名, 数字, 说明]
func _stat_row(items: Array, y: float, color: Color) -> void:
	if items.is_empty():
		return
	var cell: float = minf(190.0, (W - 60.0) / float(items.size()))
	var x0: float = (W - cell * float(items.size())) / 2.0
	for i: int in items.size():
		var it: Array = items[i]
		var x: float = x0 + cell * float(i)
		var src: String = it[0]
		var pic: Control
		if src.begins_with("res://"):
			pic = UiKit.icon(src, 40)
		else:
			pic = UiKit.badge(src, 40)
			pic.modulate = UiKit.GOLD
		pic.custom_minimum_size = Vector2(40, 40)
		var row := HBoxContainer.new()
		row.alignment = BoxContainer.ALIGNMENT_CENTER
		row.add_theme_constant_override("separation", 6)
		row.mouse_filter = Control.MOUSE_FILTER_IGNORE
		row.add_child(pic)
		row.add_child(UiKit.label(it[1], 30, color))
		_put(row, Vector2(x, y), Vector2(cell, 40))
		_put(UiKit.label(it[2], 20, Color("BFE6FF")), Vector2(x, y + 40), Vector2(cell, 28))


# ---------- 宝箱 ----------


## 宝箱弹出来 → 左右晃动、光越来越亮 → 弹开
func _chest_intro(delay: float) -> void:
	var glow := UiKit.badge("fx_glow", 420)
	glow.position = CHEST_AT - Vector2(210, 210)
	glow.modulate = Color(_chest_tint(), 0.0)
	_chest_box.add_child(glow)
	var chest := UiKit.icon("res://assets/ui/chest_closed.png", 230)
	chest.position = CHEST_AT - Vector2(115, 115)
	_chest_box.add_child(chest)
	Anim.pop_in(chest, delay, 0.2)
	var shake: float = _cfg("chestShake")
	var tw: Tween = chest.create_tween()
	tw.tween_interval(delay + 0.2)
	tw.tween_callback(Audio.sfx.bind(&"swell"))
	var steps: int = maxi(2, int(shake / 0.08))
	for i: int in steps:
		var side: float = 1.0 if i % 2 == 0 else -1.0
		var amp: float = 0.08 + 0.1 * i / steps
		tw.tween_property(chest, "rotation", amp * side, 0.04)
		tw.tween_property(chest, "rotation", 0.0, 0.04)
	tw.tween_property(chest, "scale", Vector2(1.2, 0.85), 0.06)
	tw.tween_callback(_reveal.bind(true))
	var gt: Tween = glow.create_tween()
	gt.tween_interval(delay + 0.2)
	gt.tween_property(glow, "modulate:a", 0.9, shake)


## 宝箱里是图鉴卡时，光的颜色跟稀有度走
func _chest_tint() -> Color:
	if _chest["kind"] == "card":
		return CardReveal.GLOW.get(_chest["card"]["rarity"], Color.WHITE)
	return Color("FFD75A")


## 亮出奖品。animated 为 false 时直接摆出最终状态
func _reveal(animated: bool) -> void:
	for c: Node in _chest_box.get_children():
		c.queue_free()
	if animated:
		Audio.sfx(&"chest")
		var flash := UiKit.badge("fx_glow", 520)
		flash.position = CHEST_AT - Vector2(260, 260)
		_chest_box.add_child(flash)
		var ft: Tween = flash.create_tween().set_parallel()
		ft.tween_property(flash, "scale", Vector2(1.6, 1.6), 0.3).from(Vector2(0.4, 0.4))
		ft.tween_property(flash, "modulate:a", 0.0, 0.3)
		ft.chain().tween_callback(flash.queue_free)
	if _chest["kind"] == "card":
		var card: Dictionary = _chest["card"]
		CardReveal.show_card(_chest_box, CHEST_AT - Vector2(0, 20), card, 0.6)
		if animated:
			_rarity_fx(card["rarity"])
		return
	var open_box := UiKit.icon("res://assets/ui/chest_open.png", 230)
	open_box.position = CHEST_AT - Vector2(115, 85)
	_chest_box.add_child(open_box)
	var is_coins: bool = _chest["kind"] == "coins"
	var art: String = (
		"res://assets/ui/coin.png" if is_coins else "res://assets/ui/tool_%s.png" % _chest["skill"]
	)
	var prize := UiKit.icon(art, 120)
	prize.position = CHEST_AT - Vector2(60, 178)
	_chest_box.add_child(prize)
	var text := UiKit.label(_prize_text(_chest), 38, UiKit.GOLD)
	text.position = Vector2(0, CHEST_AT.y + 112)
	text.size = Vector2(W, 52)
	text.pivot_offset = text.size / 2.0
	_chest_box.add_child(text)
	if not animated:
		return
	Anim.squash(open_box, 0.2)
	# 奖品从箱子里跳出来
	prize.position.y += 110
	prize.scale = Vector2(0.3, 0.3)
	var tw: Tween = prize.create_tween().set_parallel()
	(
		tw
		. tween_property(prize, "position:y", prize.position.y - 110, 0.3)
		. set_trans(Tween.TRANS_BACK)
		. set_ease(Tween.EASE_OUT)
	)
	tw.tween_property(prize, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)
	Anim.pop_in(text, 0.15, 0.25)
	if is_coins:
		Audio.sfx(&"coins")
		Anim.burst(
			_chest_box, CHEST_AT, 10, "res://assets/ui/coin.png", 420.0, 900.0, Vector2(26, 40), 0.7
		)
	else:
		Audio.sfx(&"unlock")
		Anim.burst(
			_chest_box, CHEST_AT, 8, "res://assets/ui/star.png", 380.0, 600.0, Vector2(22, 36), 0.6
		)


## 稀有度越高越华丽：星星更多；稀有起多一圈光环；史诗和传说全屏闪光加彩纸
func _rarity_fx(rarity: String) -> void:
	var rank: int = Cards.rank(Config.eco, rarity)
	var tint: Color = CardReveal.GLOW.get(rarity, Color.WHITE)
	Anim.burst(
		_chest_box,
		CHEST_AT,
		8 + rank * 6,
		"res://assets/ui/star.png",
		420.0 + rank * 90.0,
		700.0,
		Vector2(24, 44),
		0.8
	)
	if rank >= Cards.rank(Config.eco, "rare"):
		Audio.sfx(&"tier")
		for i: int in 2:
			var ring := UiKit.badge("fx_ring", 300)
			ring.position = CHEST_AT - Vector2(150, 150)
			ring.modulate = tint
			ring.scale = Vector2(0.3, 0.3)
			_chest_box.add_child(ring)
			var rt: Tween = ring.create_tween()
			rt.tween_interval(i * 0.12)
			rt.tween_property(ring, "scale", Vector2(2.6, 2.6), 0.5).set_ease(Tween.EASE_OUT)
			rt.parallel().tween_property(ring, "modulate:a", 0.0, 0.5)
			rt.tween_callback(ring.queue_free)
	if rank >= Cards.rank(Config.eco, str(GameCfg.d()["win"]["flashFromRarity"])):
		Audio.sfx(&"firework")
		var flash := ColorRect.new()
		flash.color = Color(tint.lightened(0.4), 0.85)
		flash.size = size
		flash.z_index = 5
		flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(flash)
		Anim.fade_out_free(flash, 0.55)
		Anim.confetti(self, size.x, 90)


func _card_text(card: Dictionary) -> String:
	var name: String = Config.species_by_id[card["id"]]["name"]
	if card["is_new"]:
		return tr("UI_CARD_GET") % name
	return tr("UI_CARD_AGAIN") % [name, int(card["coins"])]


## 一个宝箱开出了什么（一句话）
func _prize_text(chest: Dictionary) -> String:
	match chest["kind"]:
		"coins":
			return tr("UI_COINS_GAIN") % int(chest["coins"])
		"skill":
			return tr("UI_SKILL_GAIN") % tr(GameHud.TOOL_NAMES[chest["skill"]])
	return _card_text(chest["card"])


# ---------- 按钮 ----------


func _buttons(animate: bool) -> void:
	var made: Array[Button] = []
	var ads: Array = []
	if Ads.available():
		if not _doubled and _coins > 0:
			ads.append([tr("UI_DOUBLE_COINS"), UiKit.PURPLE, _double_coins])
		if not _chest.is_empty() and not _ad_chest:
			ads.append([tr("UI_CHEST_AGAIN"), UiKit.ORANGE, _more_chest])
	var y: float = 846.0
	if not ads.is_empty():
		var bw: float = 520.0 if ads.size() == 1 else 330.0
		var x0: float = (W - ads.size() * bw - (ads.size() - 1) * 20) / 2.0
		for i: int in ads.size():
			var pos := Vector2(x0 + i * (bw + 20), y)
			made.append(_button(ads[i][0], ads[i][1], pos, Vector2(bw, 88), ads[i][2], 28))
		y += 106
	var next := _button(
		tr("UI_NEXT_LEVEL"), UiKit.GREEN, Vector2(115, y), Vector2(520, 104), _next, 40
	)
	made.append(next)
	y += 122
	if _can_share():
		made.append(
			_button(tr("UI_HOME"), UiKit.BLUE, Vector2(115, y), Vector2(250, 76), _home, 28)
		)
		made.append(
			_button(
				tr("UI_SHARE_SHOW"), UiKit.PURPLE, Vector2(385, y), Vector2(250, 76), _share, 28
			)
		)
	else:
		made.append(
			_button(tr("UI_HOME"), UiKit.BLUE, Vector2(245, y), Vector2(260, 76), _home, 28)
		)
	var at: float = _cfg("buttonsAt") if animate else 0.0
	if animate:
		for i: int in made.size():
			Anim.pop_in(made[i], at + i * 0.04, 0.2)
	# 「下一关」出现后一直呼吸
	var tw: Tween = next.create_tween()
	tw.tween_interval(at + 0.3)
	tw.tween_callback(Anim.pulse.bind(next, 1.05, 1.0))


func _button(
	text: String, color: Color, pos: Vector2, area: Vector2, action: Callable, font: int = 30
) -> Button:
	var b := UiKit.button(text, color, font)
	b.pressed.connect(action)
	Anim.press_fx(b)
	_put(b, pos, area)
	return b


## 开出稀有以上的卡（宝箱或连击送的）才有「分享炫耀」
func _can_share() -> bool:
	if _shared:
		return false
	var least: int = Cards.rank(Config.eco, str(GameCfg.d()["win"]["shareFromRarity"]))
	var cards: Array = [_info["combo_card"]]
	if not _chest.is_empty():
		cards.append(_chest["card"])
	for card: Dictionary in cards:
		if not card.is_empty() and Cards.rank(Config.eco, card["rarity"]) >= least:
			return true
	return false


func _double_coins() -> void:
	if not await Ads.rewarded(&"rv_double_coin") or not is_inside_tree():
		return
	var before: int = _coins
	_coins += Settle.double_coins(Save.data, Config.eco, _result)
	Save.save()
	_doubled = true
	_build(false, false, before)


## 看广告再开一个宝箱，每关一次；前一个宝箱开出的东西缩成下面的一行小字
func _more_chest() -> void:
	if not await Ads.rewarded(&"rv_chest") or not is_inside_tree():
		return
	var again: Dictionary = LevelChest.open_ad(
		Save.data,
		Config.eco,
		Config.species,
		int(_info["level"]),
		bool(_info["challenge"]),
		Rng.new(Time.get_ticks_usec())
	)
	_ad_chest = true
	if again.is_empty():
		_build(false, false)
		return
	Save.save()
	_extras.append(_prize_text(_chest))
	_chest = again
	_build(false, true)


## 分享成功才发分享奖励（每天有次数）
func _share() -> void:
	if not Platform.impl.share({"kind": "card", "level": int(_info["level"])}):
		return
	_shared = true
	var got: Dictionary = Share.claim(
		Save.data, Config.eco, "card", Save.today(), Save.now(), Rng.new(Time.get_ticks_usec())
	)
	if int(got.get("coins", 0)) > 0:
		Save.save()
		Audio.sfx(&"coins")
		_extras.append(tr("UI_COINS_GAIN") % int(got["coins"]))
	_build(false, false)


func _next() -> void:
	_on_next.call()


func _home() -> void:
	_on_home.call()
