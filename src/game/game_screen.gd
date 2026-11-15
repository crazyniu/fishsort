class_name GameScreen
extends Control
## 局内界面。规则全部交给 Rules，这里只负责摆放、输入转发和按事件播动画。

const W := 750.0
const SHELF_Y := 122.0
const ROW_Y := 322.0
const FIELD_Y := 412.0
const TOOLS_H := 150.0
const FLY_TIME := 0.3
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
## 只有刚进关卡时播入场动画，窗口缩放重建时不播
var _intro: bool = false

var _stage: Control
var _field_origin: Vector2
var _field_w: float
var _bubbles: Array[Dictionary] = []
var _bowls: Array[Dictionary] = []
var _buffer_box: Control
var _buffer_shown: int = 0
var _return_box: Control
var _next_icon: TextureRect
var _next_species: int = -1
var _progress: Label
var _coins: Label
var _coins_shown: int = -1
var _tool_badges: Dictionary = {}
var _popup: PopupCard


func _ready() -> void:
	resized.connect(_build)
	start_level(int(Save.data["level"]))


func start_level(id: int) -> void:
	Ads.banner(false)
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
	_intro = true
	_build()
	_intro = false


func _process(delta: float) -> void:
	if _s == null or _over or _popup != null:
		return
	var events: Array[Dictionary] = Rules.tick(_s, delta)
	for i: int in _bowls.size():
		var bowl: GameState.Bowl = _s.slots[i] if i < _s.open_slots else null
		var timer: Label = _bowls[i]["timer"]
		timer.visible = bowl != null and bowl.timer != GameState.NO_TIMER
		if not timer.visible:
			continue
		var text: String = "%d:%02d" % [int(bowl.timer) / 60, int(bowl.timer) % 60]
		if text != timer.text:
			timer.text = text
			# 最后 10 秒变红并逐秒跳动
			if bowl.timer <= 10.0:
				timer.add_theme_color_override("font_color", UiKit.ORANGE)
				Anim.bounce(timer, 1.3)
				Audio.sfx(&"click", 1.4)
	if not events.is_empty():
		_play(events)


# ---------- 搭建 ----------


func _build() -> void:
	if _s == null:
		return
	for c: Node in get_children():
		c.queue_free()
	_popup = null
	_buffer_shown = 0
	_next_species = -1
	_coins_shown = -1
	var view: Vector2 = size
	var bg := TextureRect.new()
	bg.texture = UiKit.tex("res://assets/ui/bg_game.jpg")
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
	_refresh_field(false)
	_refresh_top()


func _put(node: Control, pos: Vector2, area: Vector2 = Vector2.ZERO) -> Control:
	node.position = pos
	if area != Vector2.ZERO:
		node.size = area
		node.pivot_offset = area / 2.0
	_stage.add_child(node)
	return node


## 顶栏：左边圆形关卡牌，中间一条横栏放金币，右边设置齿轮
func _build_top() -> void:
	_put(UiKit.slice3("bar"), Vector2(50, 22), Vector2(W - 60, 76))
	var badge := UiKit.pic("badge_purple" if _lv.challenge else "badge_green", 120)
	_put(badge, Vector2(4, 0), Vector2(120, 120))
	var word: String = tr("UI_CHALLENGE") if _lv.challenge else tr("UI_LEVEL_WORD")
	_put(UiKit.label(word, 22), Vector2(8, 18), Vector2(112, 30))
	_put(UiKit.label(str(_level_id), 46), Vector2(8, 42), Vector2(112, 56))
	if _intro:
		Anim.pop_in(badge)
	var coin: Dictionary = UiKit.capsule("res://assets/ui/coin.png", 210)
	_put(coin["box"], Vector2(146, 34))
	_coins = coin["label"]
	_put(UiKit.pic("btn_gear", 76), Vector2(W - 94, 22))
	var gear := UiKit.hotspot(Vector2(W - 96, 22), Vector2(80, 76))
	gear.pressed.connect(_show_settings)
	Anim.press_fx(gear)
	_stage.add_child(gear)


func _bowl_pos(i: int) -> Vector2:
	return Vector2(20 + i * 180 + 85, SHELF_Y + 84)


func _build_shelf() -> void:
	# 珊瑚色的架子
	_put(UiKit.slice3("shelf", 90), Vector2(2, SHELF_Y + 138), Vector2(W - 4, 60))
	_bowls.clear()
	for i: int in GameState.MAX_SLOTS:
		var c: Vector2 = _bowl_pos(i)
		var tank := UiKit.icon("res://assets/ui/tank.png", 170)
		_put(tank, c - Vector2(85, 92))
		var fish := UiKit.icon("", 78)
		_put(fish, c - Vector2(39, 30))
		var plus := UiKit.icon("res://assets/ui/plus.png", 64)
		_put(plus, c - Vector2(32, 22))
		Anim.pulse(plus, 1.12)
		var pill := UiKit.slice3("track")
		_put(pill, c + Vector2(-50, 64), Vector2(100, 38))
		var count := UiKit.label("", 26)
		_put(count, c + Vector2(-60, 62), Vector2(120, 40))
		var timer := UiKit.label("", 28, UiKit.GOLD)
		_put(timer, c + Vector2(-60, -104), Vector2(120, 36))
		var hot := UiKit.hotspot(c - Vector2(85, 92), Vector2(170, 190))
		hot.pressed.connect(_on_bowl_pressed.bind(i))
		_stage.add_child(hot)
		if _intro:
			Anim.pop_in(tank, 0.06 * i)
		_bowls.append(
			{
				"tank": tank,
				"fish": fish,
				"plus": plus,
				"count": count,
				"timer": timer,
				"pill": pill,
				"species": -1
			}
		)


func _buffer_pos(i: int) -> Vector2:
	return Vector2(196 + i * 84 + 38, ROW_Y + 42)


func _build_row() -> void:
	_put(UiKit.slice3("track"), Vector2(10, ROW_Y + 18), Vector2(170, 50))
	_progress = UiKit.label("", 26)
	_put(_progress, Vector2(8, ROW_Y + 16), Vector2(176, 52))
	_put(UiKit.slice3("track"), Vector2(186, ROW_Y - 8), Vector2(440, 100))
	for i: int in _s.buffer_cap:
		var slot := UiKit.icon("res://assets/ui/slot.png", 82)
		_put(slot, _buffer_pos(i) - Vector2(41, 41))
		if _intro:
			Anim.pop_in(slot, 0.2 + 0.04 * i)
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
	for idx: int in _lv.bubbles.size():
		var d: Dictionary = _lv.bubbles[idx]
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
			# 每条鱼按自己的节奏摆尾
			Anim.wiggle(f, 6.0, randf_range(1.3, 2.1), randf())
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
		if _intro:
			Anim.pop_in(node, 0.25 + 0.025 * idx, 0.35)
		# 气泡轻轻上下漂
		Anim.bob(node, randf_range(3.0, 6.0), randf_range(2.4, 3.6), randf())
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
					"open": false,
				}
			)
		)
	_return_box = _put(Control.new(), Vector2.ZERO)
	_return_box.z_index = 20
	_return_box.mouse_filter = Control.MOUSE_FILTER_IGNORE


## 底栏：深色条上三个方形道具键，右上角是数量或加号，下方是名字
func _build_tools(view_h: float) -> void:
	var names: Dictionary = {
		"net": "UI_TOOL_NET", "blow": "UI_TOOL_BLOW", "shuffle": "UI_TOOL_SHUFFLE"
	}
	var strip := UiKit.shade(Color(UiKit.NAVY, 0.55))
	_put(strip, Vector2(-400, view_h - TOOLS_H + 6), Vector2(W + 800, TOOLS_H + 40))
	for i: int in TOOLS.size():
		var tool: String = TOOLS[i]
		var x: float = 135 + i * 240 - 56
		var y: float = view_h - TOOLS_H + 16
		var btn := UiKit.tile_button()
		btn.pressed.connect(_on_tool.bind(tool))
		Anim.press_fx(btn)
		_put(btn, Vector2(x, y), Vector2(112, 112))
		_put(UiKit.icon("res://assets/ui/tool_%s.png" % tool, 84), Vector2(x + 14, y + 2))
		_put(UiKit.slice3("btn_orange"), Vector2(x - 8, y + 86), Vector2(128, 40))
		_put(UiKit.label(tr(names[tool]), 22), Vector2(x - 8, y + 88), Vector2(128, 34))
		_put(UiKit.pic("dot_red", 50), Vector2(x + 80, y - 16))
		var badge := UiKit.label("", 24)
		_put(badge, Vector2(x + 84, y - 12), Vector2(42, 40))
		_tool_badges[tool] = badge
		if _intro:
			Anim.pop_in(btn, 0.3 + 0.06 * i)


# ---------- 刷新 ----------


func _fish_tex(slot: int) -> Texture2D:
	return UiKit.tex("res://assets/fish/%s.png" % _species[slot])


func _refresh_field(animate: bool = true) -> void:
	var open: Array[int] = Rules.open_bubbles(_s)
	for b: int in _bubbles.size():
		var view: Dictionary = _bubbles[b]
		var bub: GameState.Bubble = _s.bubbles[b]
		var node: Control = view["node"]
		node.visible = bub.count() > 0
		if not node.visible:
			continue
		var is_open: bool = open.has(b)
		if is_open and not view["open"] and animate:
			# 刚露出来：由暗变亮并鼓一下
			node.create_tween().tween_property(node, "modulate", Color.WHITE, 0.3)
			Anim.bounce(node, 1.1, 0.3)
		else:
			node.modulate = Color.WHITE if is_open else DIM
		view["open"] = is_open
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
	var had: int = _return_box.get_child_count() / 3
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
		if k >= had:
			Anim.pop_in(skin, 0.04 * (k - had))
			Anim.pop_in(f, 0.04 * (k - had))


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
		(view["pill"] as Control).visible = bowl != null
		var count: Label = view["count"]
		count.visible = bowl != null
		# 只有紧挨着的下一个缸位能开
		(view["plus"] as Control).visible = i == _s.open_slots
		if bowl != null:
			(view["fish"] as TextureRect).texture = _fish_tex(bowl.species)
			var text: String = "%d/%d" % [bowl.count, bowl.cap]
			if text != count.text:
				count.text = text
				Anim.bounce(count, 1.3)
	for i: int in _buffer_box.get_child_count():
		_buffer_box.get_child(i).queue_free()
	for i: int in _s.buffer.size():
		var f := UiKit.icon("", 64)
		f.texture = _fish_tex(_s.buffer[i])
		f.position = _buffer_pos(i) - Vector2(32, 32)
		_buffer_box.add_child(f)
		if i >= _buffer_shown:
			Anim.pop_in(f, 0.0, 0.2)
	_buffer_shown = _s.buffer.size()
	# 暂存槽只剩一格时整排变红警告
	_buffer_box.modulate = (
		Color(1.0, 0.6, 0.6) if _s.buffer.size() >= _s.buffer_cap - 1 else Color.WHITE
	)
	var upcoming: int = _s.orders[_s.next_order]["s"] if _s.next_order < _s.orders.size() else -1
	_next_icon.visible = upcoming >= 0
	if upcoming >= 0 and upcoming != _next_species:
		_next_icon.texture = _fish_tex(upcoming)
		Anim.pop_in(_next_icon, 0.0, 0.25)
	_next_species = upcoming
	_progress.text = "%d/%d" % [_total_fish - _s.fish_left(), _total_fish]
	var coins: int = int(Save.data["coins"])
	if _coins_shown < 0:
		_coins.text = str(coins)
	elif coins != _coins_shown:
		Anim.count_to(_coins, _coins_shown, coins)
	_coins_shown = coins
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
		Anim.shake(_bubbles[top]["node"])
		Audio.sfx(&"error")


func _fish_pos(b: int, k: int) -> Vector2:
	if b == GameState.RETURN_BUBBLE:
		return _return_pos(k)
	var view: Dictionary = _bubbles[b]
	return (view["center"] as Vector2) + (view["offsets"] as Array[Vector2])[k]


func _tap(b: int, k: int) -> void:
	if _over or _net_mode:
		return
	var events: Array[Dictionary] = Rules.tap(_s, b, k)
	if not events.is_empty():
		Audio.sfx(&"tap")
	_play(events)


func _on_bowl_pressed(i: int) -> void:
	if _over:
		return
	if _net_mode:
		if i < _s.open_slots and _s.slots[i] != null:
			_net_mode = false
			_spend_tool("net")
			_play(Rules.use_net(_s, i))
		return
	if i != _s.open_slots:
		return
	if Ads.available():
		if await Ads.rewarded(&"rv_bowl_slot") and is_inside_tree():
			_unlock_slot()
		return
	# 广告不可用时改用金币
	var price: int = int(Config.eco["bowlSlotCoinPrice"])
	_popup = (
		PopupCard
		. open(
			self,
			tr("UI_AD_UNAVAILABLE"),
			[tr("UI_SLOT_COIN") % price],
			[
				[tr("UI_CONFIRM"), UiKit.GREEN, _pay_slot.bind(price)],
				[tr("UI_CLOSE"), UiKit.ORANGE, _close_popup],
			]
		)
	)


func _pay_slot(price: int) -> void:
	_close_popup()
	if int(Save.data["coins"]) < price:
		_toast(tr("UI_NO_COINS"))
		return
	Save.data["coins"] = int(Save.data["coins"]) - price
	Save.save()
	_unlock_slot()


func _unlock_slot() -> void:
	Audio.sfx(&"unlock")
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
			for view: Dictionary in _bowls:
				Anim.bounce(view["tank"], 1.12, 0.4)
		"blow":
			var events: Array[Dictionary] = Rules.use_blow(_s)
			if not events.is_empty():
				_spend_tool(tool)
				Audio.sfx(&"pop")
				_play(events)
		"shuffle":
			var events: Array[Dictionary] = Rules.use_shuffle(_s, Time.get_ticks_usec())
			if not events.is_empty():
				_spend_tool(tool)
				Audio.sfx(&"shuffle")
				for i: int in _bubbles.size():
					Anim.bounce(_bubbles[i]["node"], 1.15, 0.35)
				_play(events)


## 道具用完了：金币够就买，不够就看广告拿一个
func _get_tool(tool: String) -> bool:
	if Meta.buy_tool(Save.data, Config.eco, tool):
		Save.save()
		Audio.sfx(&"coin")
		_refresh_top()
		return true
	if not Ads.available() or not await Ads.rewarded(&"rv_tool") or not is_inside_tree():
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
	var flights: int = 0
	var bowl_done: bool = false
	for e: Dictionary in events:
		var delay: float = flights * 0.06
		match e["t"]:
			&"fish_to_bowl":
				_fly(
					e["species"],
					_fish_pos(e["b"], e["k"]),
					_bowl_pos(e["slot"]),
					delay,
					_on_bowl_hit.bind(e["slot"])
				)
				flights += 1
			&"fish_to_buffer":
				_fly(
					e["species"],
					_fish_pos(e["b"], e["k"]),
					_buffer_pos(e["index"]),
					delay,
					Audio.sfx.bind(&"buffer")
				)
				flights += 1
			&"buffer_to_bowl":
				_fly(
					e["species"],
					_buffer_pos(e["index"]),
					_bowl_pos(e["slot"]),
					delay,
					_on_bowl_hit.bind(e["slot"])
				)
				flights += 1
			&"net_fish":
				_fly(
					e["species"],
					_fish_pos(e["b"], e["k"]),
					_bowl_pos(e["slot"]),
					delay,
					_on_bowl_hit.bind(e["slot"])
				)
				flights += 1
			&"bubble_pop":
				_pop_fx(e["b"])
			&"bowl_done":
				bowl_done = true
				get_tree().create_timer(FLY_TIME + delay).timeout.connect(
					_bowl_done_fx.bind(e["slot"])
				)
			&"chain_open":
				_drop_fx("res://assets/ui/lock.png", e["b"])
				Audio.sfx(&"unlock")
			&"ice_melt":
				_drop_fx("res://assets/ui/ice.png", e["b"])
			&"win":
				_over = true
				get_tree().create_timer(0.9).timeout.connect(_show_win)
			&"lose":
				_over = true
				get_tree().create_timer(0.7).timeout.connect(_show_lose.bind(e["reason"]))
	_refresh_field()
	# 顶部等鱼飞到了再更新，数字和鱼同时到位
	var wait: float = FLY_TIME + maxi(0, flights - 1) * 0.06 + (0.12 if bowl_done else 0.0)
	get_tree().create_timer(wait).timeout.connect(_refresh_top)


## 鱼沿弧线飞到目的地，到达时触发回调
func _fly(slot: int, from: Vector2, to: Vector2, delay: float, on_arrive: Callable) -> void:
	var f := UiKit.icon("", 76)
	f.texture = _fish_tex(slot)
	f.z_index = 50
	_put(f, from - Vector2(38, 38), Vector2(76, 76))
	var ctrl: Vector2 = (from + to) / 2.0 + Vector2(0, -90)
	var tw: Tween = f.create_tween()
	if delay > 0.0:
		tw.tween_interval(delay)
	(
		tw
		. tween_method(
			func(t: float) -> void:
				var p: Vector2 = from.lerp(ctrl, t).lerp(ctrl.lerp(to, t), t)
				f.position = p - Vector2(38, 38)
				f.scale = Vector2.ONE * lerpf(1.25, 0.8, t)
				f.rotation = sin(t * PI) * 0.35,
			0.0,
			1.0,
			FLY_TIME
		)
		. set_trans(Tween.TRANS_QUAD)
		. set_ease(Tween.EASE_IN_OUT)
	)
	tw.tween_callback(on_arrive)
	tw.tween_callback(f.queue_free)


func _on_bowl_hit(slot: int) -> void:
	if slot >= _bowls.size() or not is_instance_valid(_bowls[slot]["tank"]):
		return
	Anim.bounce(_bowls[slot]["tank"], 1.12)
	Audio.sfx(&"bowl", randf_range(0.95, 1.1))


## 满缸：旧缸带着星星飞走，新缸弹出来
func _bowl_done_fx(slot: int) -> void:
	if slot >= _bowls.size() or not is_instance_valid(_bowls[slot]["tank"]):
		return
	Audio.sfx(&"bowl_done")
	var c: Vector2 = _bowl_pos(slot)
	var ghost := UiKit.icon("res://assets/ui/tank.png", 170)
	ghost.z_index = 45
	_put(ghost, c - Vector2(85, 92), Vector2(170, 170))
	var tw: Tween = ghost.create_tween().set_parallel()
	(
		tw
		. tween_property(ghost, "position:y", ghost.position.y - 110, 0.4)
		. set_trans(Tween.TRANS_BACK)
		. set_ease(Tween.EASE_IN)
	)
	tw.tween_property(ghost, "modulate:a", 0.0, 0.4)
	tw.chain().tween_callback(ghost.queue_free)
	for i: int in 6:
		var star := UiKit.icon("res://assets/ui/star.png", 40)
		star.z_index = 46
		_put(star, c - Vector2(20, 20), Vector2(40, 40))
		var dir: Vector2 = Vector2.from_angle(TAU * i / 6.0 + 0.3) * randf_range(70, 110)
		var st: Tween = star.create_tween().set_parallel()
		(
			st
			. tween_property(star, "position", star.position + dir, 0.45)
			. set_trans(Tween.TRANS_QUAD)
			. set_ease(Tween.EASE_OUT)
		)
		st.tween_property(star, "rotation", randf_range(-2, 2), 0.45)
		st.tween_property(star, "modulate:a", 0.0, 0.45).set_ease(Tween.EASE_IN)
		st.chain().tween_callback(star.queue_free)
	Anim.pop_in(_bowls[slot]["tank"], 0.1)
	Anim.pop_in(_bowls[slot]["fish"], 0.18)


func _pop_fx(b: int) -> void:
	Audio.sfx(&"pop", randf_range(0.9, 1.15))
	var view: Dictionary = _bubbles[b]
	var r: float = view["r"]
	var c: Vector2 = view["center"]
	var fx := UiKit.icon("res://assets/ui/bubble.png", r * 2.0)
	fx.z_index = 40
	_put(fx, c - Vector2(r, r), Vector2(r, r) * 2.0)
	var tw: Tween = fx.create_tween().set_parallel()
	tw.tween_property(fx, "scale", Vector2(1.4, 1.4), 0.2)
	tw.tween_property(fx, "modulate:a", 0.0, 0.2)
	tw.chain().tween_callback(fx.queue_free)
	# 溅出几颗小水珠
	for i: int in 7:
		var drop := UiKit.icon("res://assets/ui/bubble.png", randf_range(14, 26))
		drop.z_index = 41
		_put(drop, c - drop.size / 2.0)
		var dir: Vector2 = Vector2.from_angle(TAU * i / 7.0 + randf()) * r * randf_range(0.9, 1.5)
		var dt: Tween = drop.create_tween().set_parallel()
		(
			dt
			. tween_property(drop, "position", drop.position + dir, 0.35)
			. set_trans(Tween.TRANS_QUAD)
			. set_ease(Tween.EASE_OUT)
		)
		dt.tween_property(drop, "modulate:a", 0.0, 0.35).set_ease(Tween.EASE_IN)
		dt.chain().tween_callback(drop.queue_free)


## 锁或冰块从气泡上掉下去
func _drop_fx(path: String, b: int) -> void:
	var view: Dictionary = _bubbles[b]
	var side: float = float(view["r"]) * 1.1
	var fx := UiKit.icon(path, side)
	fx.z_index = 42
	_put(fx, (view["center"] as Vector2) - Vector2(side, side) / 2.0, Vector2(side, side))
	var tw: Tween = fx.create_tween().set_parallel()
	(
		tw
		. tween_property(fx, "position:y", fx.position.y + 140, 0.5)
		. set_trans(Tween.TRANS_QUAD)
		. set_ease(Tween.EASE_IN)
	)
	tw.tween_property(fx, "rotation", 0.9, 0.5)
	tw.tween_property(fx, "modulate:a", 0.0, 0.5).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(fx.queue_free)


func _toast(text: String) -> void:
	var l := UiKit.label(text, 30)
	l.z_index = 90
	_put(l, Vector2(0, FIELD_Y - 4), Vector2(W, 50))
	Anim.pop_in(l, 0.0, 0.2)
	var tw: Tween = l.create_tween()
	tw.tween_interval(1.5)
	tw.tween_property(l, "modulate:a", 0.0, 0.3)
	tw.tween_callback(l.queue_free)


# ---------- 弹窗 ----------


func _close_popup() -> void:
	if _popup != null:
		_popup.close()
		_popup = null
	Ads.banner(false)


func _open_popup(title: String, lines: Array[String], buttons: Array) -> void:
	if _popup != null:
		_popup.queue_free()
	_popup = PopupCard.open(self, title, lines, buttons)


func _show_settings() -> void:
	var music: bool = Save.data["settings"]["music"]
	var sound: bool = Save.data["settings"]["sound"]
	_open_popup(
		tr("UI_SETTINGS"),
		[],
		[
			[tr("UI_MUSIC_ON" if music else "UI_MUSIC_OFF"), UiKit.BLUE, _toggle_music],
			[tr("UI_SOUND_ON" if sound else "UI_SOUND_OFF"), UiKit.BLUE, _toggle_sound],
			[tr("UI_RESTART"), UiKit.ORANGE, start_level.bind(_level_id)],
			[tr("UI_HOME"), UiKit.PURPLE, _go_home],
			[tr("UI_CLOSE"), UiKit.GREEN, _close_popup],
		]
	)


func _toggle_music() -> void:
	Audio.set_music(not bool(Save.data["settings"]["music"]))
	_show_settings()


func _toggle_sound() -> void:
	Audio.set_sound(not bool(Save.data["settings"]["sound"]))
	_show_settings()


func _go_home() -> void:
	Ads.banner(false)
	if App.inst != null:
		App.inst.go_home()


func _show_win() -> void:
	Audio.sfx(&"win")
	Anim.confetti(self, size.x)
	var reward: Dictionary = Meta.finish_level(
		Save.data, Config.eco, _level_id, _lv.challenge, Save.today()
	)
	var card: Dictionary = Meta.draw_card(
		Save.data, Config.eco, Config.species, "levelCard", Rng.new(Time.get_ticks_usec())
	)
	Save.save()
	_win_popup(reward, card, false)
	Ads.banner(true)


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
	if not doubled and Ads.available():
		buttons.append([tr("UI_DOUBLE_COINS"), UiKit.PURPLE, _on_double.bind(reward, card)])
	buttons.append([tr("UI_NEXT_LEVEL"), UiKit.GREEN, _on_next])
	buttons.append([tr("UI_HOME"), UiKit.BLUE, _go_home])
	_open_popup(tr("UI_WIN"), lines, buttons)
	_refresh_top()


func _on_double(reward: Dictionary, card: Dictionary) -> void:
	if await Ads.rewarded(&"rv_double_coin") and is_inside_tree():
		Meta.double_coins(Save.data, Config.eco, reward)
		Save.save()
		Audio.sfx(&"coin")
		_win_popup(reward, card, true)


func _on_next() -> void:
	Ads.banner(false)
	await Ads.interstitial_after_level(_level_id)
	if is_inside_tree():
		start_level(int(Save.data["level"]))


func _show_lose(reason: int) -> void:
	Audio.sfx(&"lose")
	Anim.shake(_stage, 14.0)
	Meta.fail_level(Save.data, Config.eco, _level_id)
	Save.save()
	var why: Dictionary = {
		GameState.LoseReason.BUFFER_FULL: "UI_LOSE_BUFFER",
		GameState.LoseReason.TIMEOUT: "UI_LOSE_TIMEOUT",
		GameState.LoseReason.STUCK: "UI_LOSE_STUCK",
	}
	var lines: Array[String] = [tr(why[reason])]
	var buttons: Array = []
	if not _s.revived and Ads.available():
		buttons.append([tr("UI_REVIVE"), UiKit.PURPLE, _on_revive])
	buttons.append([tr("UI_RETRY"), UiKit.ORANGE, func() -> void: start_level(_level_id)])
	buttons.append([tr("UI_HOME"), UiKit.BLUE, _go_home])
	_open_popup(tr("UI_LOSE"), lines, buttons)
	Ads.banner(true)


func _on_revive() -> void:
	if not await Ads.rewarded(&"rv_revive") or not is_inside_tree():
		return
	_close_popup()
	_over = false
	Audio.sfx(&"unlock")
	_play(Rules.revive(_s))
