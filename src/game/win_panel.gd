class_name WinPanel
extends Control
## 过关结算页：横幅、图鉴卡、奖励、按钮都在同一屏，过关演出后只出现这一次。

const W := 750.0

var _reward: Dictionary
var _cards: Array[Dictionary]
var _on_next: Callable
var _on_home: Callable
var _on_changed: Callable
var _box: Control
var _doubled: bool = false


## reward 来自 Meta.finish_level 并补上 combo_coins / best / best_bonus；cards 是本关得到的图鉴卡
static func open(
	host: Control,
	reward: Dictionary,
	cards: Array[Dictionary],
	on_next: Callable,
	on_home: Callable,
	on_changed: Callable
) -> WinPanel:
	var p := WinPanel.new()
	p.size = host.size
	p.z_index = 100
	p.mouse_filter = Control.MOUSE_FILTER_STOP
	p._reward = reward
	p._cards = cards
	p._on_next = on_next
	p._on_home = on_home
	p._on_changed = on_changed
	host.add_child(p)
	p._build(true)
	return p


func _put(node: Control, pos: Vector2, area: Vector2 = Vector2.ZERO) -> Control:
	node.position = pos
	if area != Vector2.ZERO:
		node.size = area
		node.pivot_offset = area / 2.0
	_box.add_child(node)
	return node


func _build(first: bool) -> void:
	for c: Node in get_children():
		c.queue_free()
	var shade := ColorRect.new()
	shade.color = Color(0.01, 0.06, 0.18, 0.84)
	shade.size = size
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	_box = Control.new()
	_box.size = Vector2(W, size.y)
	_box.position = Vector2((size.x - W) / 2.0, maxf(0.0, (size.y - 1240.0) / 2.0))
	_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_box)
	if first:
		shade.modulate.a = 0.0
		shade.create_tween().tween_property(shade, "modulate:a", 1.0, 0.2)
		Anim.confetti(self, size.x, 80)
	# 图鉴卡先放，光芒压在横幅下面；一张居中，两张并排
	var n: int = _cards.size()
	for i: int in n:
		var x: float = W / 2.0 if n == 1 else W / 2.0 + (i * 2 - 1) * 180.0
		CardReveal.show_card(_box, Vector2(x, 470), _cards[i], 0.86 if n == 1 else 0.62)
	# 横幅 + 三颗星
	var ribbon := UiKit.piece("ribbon")
	_put(ribbon, Vector2(55, 120), Vector2(640, 134))
	var title := UiKit.label(tr("UI_FINISH_TITLE"), 72)
	_put(title, Vector2(55, 116), Vector2(640, 120))
	for i: int in 3:
		var side: float = 104.0 if i == 1 else 84.0
		var star := UiKit.icon("res://assets/ui/star.png", side)
		_put(
			star,
			Vector2(W / 2.0 + (i - 1) * 118 - side / 2.0, 40 - (22 if i == 1 else 0)),
			Vector2(side, side)
		)
		if first:
			star.scale = Vector2.ZERO
			star.rotation = -0.8
			var st: Tween = star.create_tween()
			st.tween_interval(0.25 + i * 0.14)
			st.tween_callback(Audio.sfx.bind(&"star", 1.0 + i * 0.12))
			(
				st
				. tween_property(star, "scale", Vector2.ONE, 0.28)
				. set_trans(Tween.TRANS_BACK)
				. set_ease(Tween.EASE_OUT)
			)
			st.parallel().tween_property(star, "rotation", 0.0, 0.28)
	if first:
		Anim.pop_in(ribbon, 0.0, 0.3)
		Anim.pop_in(title, 0.08, 0.3)
	_rewards(first)
	_buttons()


## 奖励一行：金币、星星、鱼票三个胶囊，下面一行小字交代连击加成
func _rewards(first: bool) -> void:
	var mult: int = int(Config.eco["adCoinMultiplier"]) if _doubled else 1
	var coins: int = (
		int(_reward["coins"]) * mult + int(_reward["combo_coins"]) + int(_reward["best_bonus"])
	)
	var items: Array = [["coin", coins], ["star", int(_reward["stars"])]]
	if int(_reward["tickets"]) > 0:
		items.append(["ticket", int(_reward["tickets"])])
	var cap_w: float = 190.0
	var x0: float = (W - items.size() * cap_w - (items.size() - 1) * 24) / 2.0
	for i: int in items.size():
		var cap: Dictionary = UiKit.capsule("res://assets/ui/%s.png" % items[i][0], cap_w, 60)
		var box: Control = cap["box"]
		_put(box, Vector2(x0 + i * (cap_w + 24), 730), Vector2(cap_w, 60))
		var num: Label = cap["label"]
		num.text = "+%d" % int(items[i][1])
		if first:
			Anim.pop_in(box, 0.7 + i * 0.1, 0.25)
	var notes: PackedStringArray = []
	if int(_reward["combo_coins"]) > 0:
		notes.append(tr("UI_COMBO_COINS") % int(_reward["combo_coins"]))
	if int(_reward["best_bonus"]) > 0:
		notes.append(tr("UI_BEST_COMBO") % [int(_reward["best"]), int(_reward["best_bonus"])])
	if not notes.is_empty():
		_put(UiKit.label(" · ".join(notes), 24, Color("BFE6FF")), Vector2(0, 800), Vector2(W, 36))


func _buttons() -> void:
	var y: float = 856.0
	var ads: Array = []
	if not _doubled and Ads.available():
		ads.append([tr("UI_DOUBLE_COINS"), UiKit.PURPLE, _double_coins])
	if _reward["first_win"] and not _reward.has("tickets_doubled") and Ads.available():
		ads.append([tr("UI_DOUBLE_TICKETS"), UiKit.ORANGE, _double_tickets])
	if not ads.is_empty():
		var bw: float = 520.0 if ads.size() == 1 else 330.0
		var x0: float = (W - ads.size() * bw - (ads.size() - 1) * 20) / 2.0
		for i: int in ads.size():
			_button(
				ads[i][0], ads[i][1], Vector2(x0 + i * (bw + 20), y), Vector2(bw, 88), ads[i][2]
			)
		y += 108
	var next := _button(
		tr("UI_NEXT_LEVEL"), UiKit.GREEN, Vector2(115, y), Vector2(520, 104), _next, 40
	)
	Anim.pulse(next, 1.04, 1.0)
	_button(tr("UI_HOME"), UiKit.BLUE, Vector2(245, y + 124), Vector2(260, 76), _home, 28)


func _button(
	text: String, color: Color, pos: Vector2, area: Vector2, action: Callable, font: int = 30
) -> Button:
	var b := UiKit.button(text, color, font)
	b.pressed.connect(action)
	Anim.press_fx(b)
	_put(b, pos, area)
	return b


func _double_coins() -> void:
	if await Ads.rewarded(&"rv_double_coin") and is_inside_tree():
		Meta.double_coins(Save.data, Config.eco, _reward)
		Save.save()
		_doubled = true
		Audio.sfx(&"coins")
		_on_changed.call()
		_build(false)


## 每日首胜：看广告把首胜鱼票翻倍
func _double_tickets() -> void:
	if await Ads.rewarded(&"rv_first_win_ticket") and is_inside_tree():
		var extra: int = int(Config.eco["firstWinTickets"])
		Save.data["tickets"] = int(Save.data["tickets"]) + extra
		_reward["tickets"] = int(_reward["tickets"]) + extra
		_reward["tickets_doubled"] = true
		Save.save()
		Audio.sfx(&"card")
		_build(false)


func _next() -> void:
	Audio.sfx(&"click")
	_on_next.call()


func _home() -> void:
	Audio.sfx(&"click")
	_on_home.call()
