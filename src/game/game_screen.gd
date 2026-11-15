extends Control
## 局内界面。规则全部交给 Rules，这里只负责摆放、输入转发和按事件播动画。

const W := 750.0
const SHELF_Y := 96.0
const ROW_Y := 300.0
const FIELD_Y := 392.0
const TOOLS_H := 150.0
const FLY_TIME := 0.22
const LEVEL_COUNT := 60
const TOOLS: Array[String] = ["net", "blow", "shuffle"]
## 已有美术的鱼种；关卡里的鱼种槽位映射到它们
const FISH_ART: Array[String] = [
	"c01", "c04", "c05", "c09", "c13", "c15", "c16", "c19", "c21", "c23", "c27", "c29"
]
const DIM := Color(0.55, 0.62, 0.74)
const SILHOUETTE := Color(0.03, 0.16, 0.2, 0.8)

var _level_id: int = 1
var _lv: LevelData
var _s: GameState
var _species: Array[String] = []
var _tool_uses: Dictionary = {}
var _net_mode: bool = false
var _over: bool = false
var _total_fish: int = 0

var _stage: Control
var _field_origin: Vector2
var _field_w: float
var _bubbles: Array[Dictionary] = []
var _bowls: Array[Dictionary] = []
var _buffer_box: Control
var _return_box: Control
var _next_icon: TextureRect
var _progress: Label
var _coins: Label
var _tool_badges: Dictionary = {}
var _popup: Control


func _ready() -> void:
	resized.connect(_build)
	start_level(int(Save.data["level"]))


func start_level(id: int) -> void:
	_level_id = id
	var ease: int = Meta.ease_for(Save.data, Config.eco, id)
	# 目前只做了 60 关，超出后循环使用
	_lv = Config.load_level((id - 1) % LEVEL_COUNT + 1, ease)
	_s = GameState.from_level(_lv)
	if id <= int(Config.eco["freeBowlSlotUntil"]):
		_s.open_slots = 3
	Rules.start(_s)
	var ids: Array[String] = FISH_ART.duplicate()
	Rng.new(_lv.level_seed).shuffle(ids)
	_species = ids.slice(0, _lv.palette)
	_tool_uses = {"net": 0, "blow": 0, "shuffle": 0}
	_net_mode = false
	_over = false
	_total_fish = _s.fish_left()
	_build()


func _process(delta: float) -> void:
	if _s == null or _over or _popup != null:
		return
	var events: Array[Dictionary] = Rules.tick(_s, delta)
	for i: int in _bowls.size():
		var bowl: GameState.Bowl = _s.slots[i] if i < _s.open_slots else null
		var timer: Label = _bowls[i]["timer"]
		timer.visible = bowl != null and bowl.timer != GameState.NO_TIMER
		if timer.visible:
			timer.text = "%d:%02d" % [int(bowl.timer) / 60, int(bowl.timer) % 60]
	if not events.is_empty():
		_play(events)


# ---------- 搭建 ----------


func _build() -> void:
	if _s == null:
		return
	for c: Node in get_children():
		c.queue_free()
	_popup = null
	var view: Vector2 = size
	var bg := TextureRect.new()
	bg.texture = UiKit.tex("res://assets/ui/bg.jpg")
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.size = view
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	_stage = Control.new()
	_stage.position = Vector2((view.x - W) / 2.0, 0)
	_stage.size = Vector2(W, view.y)
	_stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_stage)
	_build_top()
	_build_shelf()
	_build_row()
	_build_field(view.y)
	_build_tools(view.y)
	_refresh_field()
	_refresh_top()


func _put(node: Control, pos: Vector2, area: Vector2 = Vector2.ZERO) -> Control:
	node.position = pos
	if area != Vector2.ZERO:
		node.size = area
	_stage.add_child(node)
	return node


func _build_top() -> void:
	_put(UiKit.panel(UiKit.MINT, 0), Vector2(-400, -40), Vector2(W + 800, 126))
	var title: String = tr("UI_LEVEL") % _level_id
	if _lv.challenge:
		title += " · " + tr("UI_CHALLENGE")
	var level := UiKit.label(title, 40, UiKit.LEMON if _lv.challenge else Color.WHITE)
	level.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_put(level, Vector2(24, 14), Vector2(360, 60))
	_put(UiKit.icon("res://assets/ui/coin.png", 56), Vector2(420, 16))
	_coins = UiKit.label("0", 36)
	_coins.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_put(_coins, Vector2(484, 14), Vector2(130, 60))
	var restart := UiKit.button(tr("UI_RESTART"), UiKit.CORAL, 26)
	restart.pressed.connect(func() -> void: start_level(_level_id))
	_put(restart, Vector2(626, 12), Vector2(108, 62))


func _bowl_pos(i: int) -> Vector2:
	return Vector2(20 + i * 180 + 85, SHELF_Y + 84)


func _build_shelf() -> void:
	# 珊瑚色的架子
	_put(UiKit.panel(UiKit.CORAL, 14), Vector2(8, SHELF_Y + 150), Vector2(W - 16, 30))
	_bowls.clear()
	for i: int in GameState.MAX_SLOTS:
		var c: Vector2 = _bowl_pos(i)
		var tank := UiKit.icon("res://assets/ui/tank.png", 170)
		_put(tank, c - Vector2(85, 92))
		var fish := UiKit.icon("", 78)
		_put(fish, c - Vector2(39, 30))
		var plus := UiKit.icon("res://assets/ui/plus.png", 64)
		_put(plus, c - Vector2(32, 22))
		var count := UiKit.label("", 30)
		_put(count, c + Vector2(-60, 60), Vector2(120, 40))
		var timer := UiKit.label("", 28, UiKit.LEMON)
		_put(timer, c + Vector2(-60, -104), Vector2(120, 36))
		var hot := UiKit.hotspot(c - Vector2(85, 92), Vector2(170, 190))
		hot.pressed.connect(_on_bowl_pressed.bind(i))
		_stage.add_child(hot)
		_bowls.append({"tank": tank, "fish": fish, "plus": plus, "count": count, "timer": timer})


func _buffer_pos(i: int) -> Vector2:
	return Vector2(196 + i * 84 + 38, ROW_Y + 42)


func _build_row() -> void:
	_progress = UiKit.label("", 30)
	_put(_progress, Vector2(8, ROW_Y + 16), Vector2(176, 52))
	for i: int in _s.buffer_cap:
		_put(UiKit.icon("res://assets/ui/slot.png", 82), _buffer_pos(i) - Vector2(41, 41))
	_buffer_box = _put(Control.new(), Vector2.ZERO)
	_buffer_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_put(UiKit.label(tr("UI_NEXT_BOWL"), 22), Vector2(626, ROW_Y - 2), Vector2(116, 30))
	_next_icon = UiKit.icon("", 56)
	_put(_next_icon, Vector2(656, ROW_Y + 26))


func _build_field(view_h: float) -> void:
	var avail: float = view_h - FIELD_Y - TOOLS_H
	_field_w = minf(W, avail / LevelGen.FIELD_H)
	_field_origin = Vector2(
		(W - _field_w) / 2.0, FIELD_Y + (avail - _field_w * LevelGen.FIELD_H) / 2.0
	)
	var input := Control.new()
	input.gui_input.connect(_on_field_input.bind(input))
	_put(input, Vector2(0, FIELD_Y), Vector2(W, avail))
	_bubbles.clear()
	for d: Dictionary in _lv.bubbles:
		var r: float = float(d["r"]) * _field_w
		var center: Vector2 = _field_origin + Vector2(d["x"], d["y"]) * _field_w
		var node := Control.new()
		node.z_index = int(d["layer"]) + 1
		node.mouse_filter = Control.MOUSE_FILTER_IGNORE
		_put(node, center)
		var skin := UiKit.icon("res://assets/ui/bubble.png", r * 2.0)
		skin.position = -Vector2(r, r)
		skin.modulate.a = 0.8
		node.add_child(skin)
		var n: int = (d["fish"] as Array).size()
		var fs: float = clampf(r * (0.95 if n == 1 else 0.8 if n <= 3 else 0.68), 44.0, 110.0)
		var fish_nodes: Array[TextureRect] = []
		var offsets: Array[Vector2] = []
		for k: int in n:
			var off := Vector2.ZERO
			if n > 1:
				off = Vector2.from_angle(TAU * k / n - PI / 2.0) * r * (0.36 if n == 2 else 0.46)
			var f := UiKit.icon("", fs)
			f.position = off - Vector2(fs, fs) / 2.0
			node.add_child(f)
			fish_nodes.append(f)
			offsets.append(off)
		var ice := UiKit.icon("res://assets/ui/ice.png", r * 1.5)
		ice.position = -Vector2(r, r) * 0.75
		ice.modulate.a = 0.75
		node.add_child(ice)
		var lock := UiKit.icon("res://assets/ui/lock.png", r * 1.1)
		lock.position = -Vector2(r, r) * 0.55
		node.add_child(lock)
		var lock_n := UiKit.label("", int(r * 0.5))
		lock_n.position = Vector2(-r * 0.5, -r * 0.1)
		lock_n.size = Vector2(r * 0.8, r * 0.6)
		node.add_child(lock_n)
		(
			_bubbles
			. append(
				{
					"node": node,
					"fish": fish_nodes,
					"offsets": offsets,
					"center": center,
					"r": r,
					"fs": fs,
					"ice": ice,
					"lock": lock,
					"lock_n": lock_n,
				}
			)
		)
	_return_box = _put(Control.new(), Vector2.ZERO)
	_return_box.z_index = 20
	_return_box.mouse_filter = Control.MOUSE_FILTER_IGNORE


func _build_tools(view_h: float) -> void:
	var names: Dictionary = {
		"net": "UI_TOOL_NET", "blow": "UI_TOOL_BLOW", "shuffle": "UI_TOOL_SHUFFLE"
	}
	for i: int in TOOLS.size():
		var tool: String = TOOLS[i]
		var x: float = 40 + i * 235
		var y: float = view_h - TOOLS_H + 14
		var btn := UiKit.button("", UiKit.MINT)
		btn.pressed.connect(_on_tool.bind(tool))
		_put(btn, Vector2(x, y), Vector2(200, 122))
		_put(UiKit.icon("res://assets/ui/tool_%s.png" % tool, 84), Vector2(x + 58, y + 2))
		_put(UiKit.label(tr(names[tool]), 26), Vector2(x, y + 80), Vector2(200, 34))
		var badge := UiKit.label("", 28, UiKit.LEMON)
		_put(badge, Vector2(x + 140, y - 6), Vector2(60, 40))
		_tool_badges[tool] = badge


# ---------- 刷新 ----------


func _fish_tex(slot: int) -> Texture2D:
	return UiKit.tex("res://assets/fish/%s.png" % _species[slot])


func _refresh_field() -> void:
	var open: Array[int] = Rules.open_bubbles(_s)
	for b: int in _bubbles.size():
		var view: Dictionary = _bubbles[b]
		var bub: GameState.Bubble = _s.bubbles[b]
		var node: Control = view["node"]
		node.visible = bub.count() > 0
		if not node.visible:
			continue
		var is_open: bool = open.has(b)
		node.modulate = Color.WHITE if is_open else DIM
		var fish_nodes: Array[TextureRect] = view["fish"]
		for k: int in fish_nodes.size():
			var f: TextureRect = fish_nodes[k]
			f.visible = bub.fish[k] >= 0
			if f.visible:
				f.texture = _fish_tex(bub.fish[k])
				# 迷雾泡：被挡住时只露剪影
				f.modulate = SILHOUETTE if bub.fog and not is_open else Color.WHITE
		(view["ice"] as Control).visible = bub.frozen
		(view["lock"] as Control).visible = bub.chain > 0
		(view["lock_n"] as Label).visible = bub.chain > 0
		(view["lock_n"] as Label).text = str(bub.chain)
	for c: Node in _return_box.get_children():
		c.queue_free()
	for k: int in _s.return_fish.size():
		var p: Vector2 = _return_pos(k)
		var skin := UiKit.icon("res://assets/ui/bubble.png", 84)
		skin.position = p - Vector2(42, 42)
		skin.modulate.a = 0.8
		_return_box.add_child(skin)
		var f := UiKit.icon("", 60)
		f.texture = _fish_tex(_s.return_fish[k])
		f.position = p - Vector2(30, 30)
		_return_box.add_child(f)
		var hot := UiKit.hotspot(p - Vector2(42, 42), Vector2(84, 84))
		hot.pressed.connect(_tap.bind(GameState.RETURN_BUBBLE, k))
		_return_box.add_child(hot)


func _return_pos(k: int) -> Vector2:
	return Vector2(52 + (k % 8) * 90, FIELD_Y + 46 + (k / 8) * 88)


func _refresh_top() -> void:
	if _s == null or _coins == null or not is_instance_valid(_coins):
		return
	for i: int in _bowls.size():
		var view: Dictionary = _bowls[i]
		var usable: bool = i < _s.open_slots
		var bowl: GameState.Bowl = _s.slots[i] if usable else null
		(view["tank"] as Control).modulate = Color.WHITE if bowl != null else Color(1, 1, 1, 0.45)
		(view["fish"] as TextureRect).visible = bowl != null
		(view["count"] as Label).visible = bowl != null
		# 只有紧挨着的下一个缸位能开
		(view["plus"] as Control).visible = i == _s.open_slots
		if bowl != null:
			(view["fish"] as TextureRect).texture = _fish_tex(bowl.species)
			(view["count"] as Label).text = "%d/%d" % [bowl.count, bowl.cap]
	for c: Node in _buffer_box.get_children():
		c.queue_free()
	for i: int in _s.buffer.size():
		var f := UiKit.icon("", 64)
		f.texture = _fish_tex(_s.buffer[i])
		f.position = _buffer_pos(i) - Vector2(32, 32)
		_buffer_box.add_child(f)
	_next_icon.visible = _s.next_order < _s.orders.size()
	if _next_icon.visible:
		_next_icon.texture = _fish_tex(_s.orders[_s.next_order]["s"])
	_progress.text = "%d/%d" % [_total_fish - _s.fish_left(), _total_fish]
	_coins.text = str(int(Save.data["coins"]))
	for tool: String in TOOLS:
		var have: int = int(Save.data["tools"][tool])
		(_tool_badges[tool] as Label).text = str(have) if have > 0 else "+"


# ---------- 输入 ----------


func _on_field_input(event: InputEvent, input: Control) -> void:
	var click := event as InputEventMouseButton
	if click == null or not click.pressed or click.button_index != MOUSE_BUTTON_LEFT:
		return
	if _over or _net_mode:
		return
	var p: Vector2 = click.position + input.position
	var best_b: int = -1
	var best_k: int = -1
	var best_d: float = INF
	for b: int in Rules.open_bubbles(_s):
		var view: Dictionary = _bubbles[b]
		for k: int in _s.bubbles[b].fish.size():
			if _s.bubbles[b].fish[k] < 0:
				continue
			var d: float = p.distance_to(_fish_pos(b, k))
			if d < float(view["fs"]) * 0.62 and d < best_d:
				best_d = d
				best_b = b
				best_k = k
	if best_b >= 0:
		_tap(best_b, best_k)
		return
	# 点到了不能点的气泡：晃一下提示
	var top: int = -1
	for b: int in _bubbles.size():
		var view: Dictionary = _bubbles[b]
		if _s.bubbles[b].count() > 0 and p.distance_to(view["center"]) < float(view["r"]):
			if (
				top < 0
				or (view["node"] as Control).z_index > (_bubbles[top]["node"] as Control).z_index
			):
				top = b
	if top >= 0 and not Rules.is_open(_s, top):
		_shake(_bubbles[top]["node"])


func _fish_pos(b: int, k: int) -> Vector2:
	if b == GameState.RETURN_BUBBLE:
		return _return_pos(k)
	var view: Dictionary = _bubbles[b]
	return (view["center"] as Vector2) + (view["offsets"] as Array[Vector2])[k]


func _tap(b: int, k: int) -> void:
	if _over or _net_mode:
		return
	_play(Rules.tap(_s, b, k))


func _on_bowl_pressed(i: int) -> void:
	if _over:
		return
	if _net_mode:
		if i < _s.open_slots and _s.slots[i] != null:
			_net_mode = false
			_spend_tool("net")
			_play(Rules.use_net(_s, i))
		return
	if i == _s.open_slots:
		var result: int = await Platform.impl.show_rewarded(&"rv_bowl_slot")
		if result == PlatformBase.AdResult.DONE and is_inside_tree():
			_play(Rules.unlock_bowl(_s))


func _on_tool(tool: String) -> void:
	if _over or _net_mode:
		_net_mode = false
		return
	if int(_tool_uses[tool]) >= int(Config.eco["toolMaxPerLevel"]):
		_toast(tr("UI_TOOL_LIMIT"))
		return
	if int(Save.data["tools"][tool]) <= 0 and not await _get_tool(tool):
		return
	match tool:
		"net":
			_net_mode = true
			_toast(tr("UI_NET_HINT"))
		"blow":
			var events: Array[Dictionary] = Rules.use_blow(_s)
			if not events.is_empty():
				_spend_tool(tool)
				_play(events)
		"shuffle":
			var events: Array[Dictionary] = Rules.use_shuffle(_s, Time.get_ticks_usec())
			if not events.is_empty():
				_spend_tool(tool)
				_play(events)


## 道具用完了：金币够就买，不够就看广告拿一个
func _get_tool(tool: String) -> bool:
	if Meta.buy_tool(Save.data, Config.eco, tool):
		Save.save()
		_refresh_top()
		return true
	var result: int = await Platform.impl.show_rewarded(&"rv_tool")
	if result != PlatformBase.AdResult.DONE or not is_inside_tree():
		_toast(tr("UI_NO_COINS"))
		return false
	Save.data["tools"][tool] = int(Save.data["tools"][tool]) + 1
	return true


func _spend_tool(tool: String) -> void:
	Save.data["tools"][tool] = int(Save.data["tools"][tool]) - 1
	_tool_uses[tool] = int(_tool_uses[tool]) + 1
	Save.save()


# ---------- 表现 ----------


func _play(events: Array[Dictionary]) -> void:
	if events.is_empty():
		return
	for e: Dictionary in events:
		match e["t"]:
			&"fish_to_bowl":
				_fly(e["species"], _fish_pos(e["b"], e["k"]), _bowl_pos(e["slot"]))
			&"fish_to_buffer":
				_fly(e["species"], _fish_pos(e["b"], e["k"]), _buffer_pos(e["index"]))
			&"buffer_to_bowl":
				_fly(e["species"], _buffer_pos(e["index"]), _bowl_pos(e["slot"]))
			&"net_fish":
				_fly(e["species"], _fish_pos(e["b"], e["k"]), _bowl_pos(e["slot"]))
			&"bubble_pop":
				_pop_fx(e["b"])
			&"win":
				_over = true
				get_tree().create_timer(0.6).timeout.connect(_show_win)
			&"lose":
				_over = true
				get_tree().create_timer(0.6).timeout.connect(_show_lose.bind(e["reason"]))
	_refresh_field()
	# 顶部等飞行动画到了再更新，数字和鱼同时到位
	get_tree().create_timer(FLY_TIME).timeout.connect(_refresh_top)


func _fly(slot: int, from: Vector2, to: Vector2) -> void:
	var f := UiKit.icon("", 72)
	f.texture = _fish_tex(slot)
	f.z_index = 50
	_put(f, from - Vector2(36, 36))
	var tw: Tween = f.create_tween()
	(
		tw
		. tween_property(f, "position", to - Vector2(36, 36), FLY_TIME)
		. set_trans(Tween.TRANS_QUAD)
		. set_ease(Tween.EASE_OUT)
	)
	tw.tween_callback(f.queue_free)


func _pop_fx(b: int) -> void:
	var view: Dictionary = _bubbles[b]
	var r: float = view["r"]
	var fx := UiKit.icon("res://assets/ui/bubble.png", r * 2.0)
	fx.z_index = 40
	_put(fx, (view["center"] as Vector2) - Vector2(r, r))
	var tw: Tween = fx.create_tween().set_parallel()
	tw.tween_property(fx, "scale", Vector2(1.35, 1.35), 0.18)
	tw.tween_property(fx, "modulate:a", 0.0, 0.18)
	tw.chain().tween_callback(fx.queue_free)


func _shake(node: Control) -> void:
	var home: Vector2 = node.position
	var tw: Tween = node.create_tween()
	for dx: float in [8.0, -8.0, 5.0, -5.0, 0.0]:
		tw.tween_property(node, "position:x", home.x + dx, 0.04)


func _toast(text: String) -> void:
	var l := UiKit.label(text, 30)
	l.z_index = 90
	_put(l, Vector2(0, FIELD_Y - 4), Vector2(W, 50))
	var tw: Tween = l.create_tween()
	tw.tween_interval(1.4)
	tw.tween_property(l, "modulate:a", 0.0, 0.3)
	tw.tween_callback(l.queue_free)


# ---------- 弹窗 ----------


## buttons: [[文字, 颜色, 回调], ...]
func _show_popup(title: String, lines: Array[String], buttons: Array) -> void:
	if _popup != null:
		_popup.queue_free()
	_popup = Control.new()
	_popup.z_index = 100
	_popup.size = size
	add_child(_popup)
	var shade := ColorRect.new()
	shade.color = Color(0.02, 0.15, 0.2, 0.6)
	shade.size = size
	_popup.add_child(shade)
	var h: float = 150 + lines.size() * 52 + buttons.size() * 104
	var card := UiKit.panel(UiKit.CREAM)
	card.size = Vector2(600, h)
	card.position = Vector2((size.x - 600) / 2.0, (size.y - h) / 2.0)
	_popup.add_child(card)
	var head := UiKit.label(title, 60, UiKit.LEMON)
	head.position = Vector2(0, 24)
	head.size = Vector2(600, 84)
	card.add_child(head)
	var y: float = 122
	for text: String in lines:
		var l := UiKit.label(text, 30, UiKit.INK)
		l.add_theme_constant_override("outline_size", 0)
		l.position = Vector2(20, y)
		l.size = Vector2(560, 46)
		card.add_child(l)
		y += 52
	y += 10
	for spec: Array in buttons:
		var b := UiKit.button(spec[0], spec[1])
		b.position = Vector2(90, y)
		b.size = Vector2(420, 88)
		b.pressed.connect(spec[2])
		card.add_child(b)
		y += 104


func _close_popup() -> void:
	if _popup != null:
		_popup.queue_free()
		_popup = null


func _show_win() -> void:
	var reward: Dictionary = Meta.finish_level(
		Save.data, Config.eco, _level_id, _lv.challenge, Save.today()
	)
	var card: Dictionary = Meta.draw_card(
		Save.data, Config.eco, Config.species, "levelCard", Rng.new(Time.get_ticks_usec())
	)
	Save.save()
	_win_popup(reward, card, false)


func _win_popup(reward: Dictionary, card: Dictionary, doubled: bool) -> void:
	var coins: int = int(reward["coins"]) * (int(Config.eco["adCoinMultiplier"]) if doubled else 1)
	var lines: Array[String] = [
		tr("UI_COINS_GAIN") % coins, tr("UI_STARS_GAIN") % int(reward["stars"])
	]
	if int(reward["tickets"]) > 0:
		lines.append(tr("UI_TICKETS_GAIN") % int(reward["tickets"]))
	var card_name: String = Config.species_by_id[card["id"]]["name"]
	if card["is_new"]:
		lines.append(tr("UI_CARD_NEW") % card_name)
	else:
		lines.append(tr("UI_CARD_DUPE") % [card_name, int(card["coins"])])
	var buttons: Array = []
	if not doubled:
		buttons.append([tr("UI_DOUBLE_COINS"), UiKit.BERRY, _on_double.bind(reward, card)])
	buttons.append(
		[tr("UI_NEXT_LEVEL"), UiKit.GREEN, func() -> void: start_level(int(Save.data["level"]))]
	)
	_show_popup(tr("UI_WIN"), lines, buttons)
	_refresh_top()


func _on_double(reward: Dictionary, card: Dictionary) -> void:
	var result: int = await Platform.impl.show_rewarded(&"rv_double_coin")
	if result == PlatformBase.AdResult.DONE and is_inside_tree():
		Meta.double_coins(Save.data, Config.eco, reward)
		Save.save()
		_win_popup(reward, card, true)


func _show_lose(reason: int) -> void:
	Meta.fail_level(Save.data, Config.eco, _level_id)
	Save.save()
	var why: Dictionary = {
		GameState.LoseReason.BUFFER_FULL: "UI_LOSE_BUFFER",
		GameState.LoseReason.TIMEOUT: "UI_LOSE_TIMEOUT",
		GameState.LoseReason.STUCK: "UI_LOSE_STUCK",
	}
	var lines: Array[String] = [tr(why[reason])]
	var buttons: Array = []
	if not _s.revived:
		buttons.append([tr("UI_REVIVE"), UiKit.BERRY, _on_revive])
	buttons.append([tr("UI_RETRY"), UiKit.CORAL, func() -> void: start_level(_level_id)])
	_show_popup(tr("UI_LOSE"), lines, buttons)


func _on_revive() -> void:
	var result: int = await Platform.impl.show_rewarded(&"rv_revive")
	if result != PlatformBase.AdResult.DONE or not is_inside_tree():
		return
	_close_popup()
	_over = false
	_play(Rules.revive(_s))
