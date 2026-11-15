class_name GameScreen
extends Control
## 局内界面。规则全部交给 Rules，这里只负责摆放、输入转发和按事件播动画。

const W := 750.0
const BAR_Y := 8.0
const BAR_H := 68.0
const SHELF_Y := 84.0
const ROW_Y := 236.0
const FIELD_Y := 322.0
const TOOLS_H := 150.0
const FLY_TIME := GameFx.FLY_TIME
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
var _fx: GameFx
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
## 连击：短时间内连续把鱼送进缸
var _combo: int = 0
var _combo_at: float = -100.0
var _combo_coins: int = 0
var _combo_hud: ComboHud
## 最后一条鱼由游戏自己收尾，期间不接受点击
var _auto: bool = false


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
	_auto = false
	_combo = 0
	_combo_coins = 0
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
	_fx = GameFx.new(_stage, W)
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


## 顶栏：一条玻璃横栏，金币在左、「第 N 关」文字在正中、设置键在右，同一条中线
func _build_top() -> void:
	var mid: float = BAR_Y + BAR_H / 2.0
	_put(UiKit.piece("glass"), Vector2(16, BAR_Y), Vector2(W - 32, BAR_H))
	var coin: Dictionary = UiKit.capsule("res://assets/ui/coin.png", 200, 46.0)
	_put(coin["box"], Vector2(34, mid - 23))
	_coins = coin["label"]
	var title: String = tr("UI_LEVEL") % _level_id
	if _lv.challenge:
		title = "%s · %s" % [tr("UI_CHALLENGE"), title]
	var chip := UiKit.piece("chip")
	_put(chip, Vector2(W / 2.0 - 110, mid - 23), Vector2(220, 46))
	var ink: Color = UiKit.PURPLE if _lv.challenge else UiKit.INK
	_put(UiKit.text(title, 26, ink), Vector2(W / 2.0 - 110, mid - 23), Vector2(220, 46))
	if _intro:
		Anim.pop_in(chip)
	_put(UiKit.badge("btn_gear", 54), Vector2(W - 26 - 54, mid - 27))
	var gear := UiKit.hotspot(Vector2(W - 100, BAR_Y), Vector2(84, BAR_H))
	gear.pressed.connect(_show_settings)
	Anim.press_fx(gear)
	_stage.add_child(gear)


## 用圆点表示缸里的进度：亮点是已收的鱼。返回进度是否变了
func _fill_dots(box: Control, have: int, cap: int) -> bool:
	if box.get_meta("have", -1) == have and box.get_child_count() == cap:
		return false
	box.set_meta("have", have)
	for k: Node in box.get_children():
		k.queue_free()
	var gap: float = 20.0
	var x0: float = (box.size.x - gap * (cap - 1)) / 2.0
	for i: int in cap:
		var dot := Panel.new()
		var sb := StyleBoxFlat.new()
		sb.set_corner_radius_all(8)
		sb.bg_color = UiKit.GOLD if i < have else Color("C3D3EE")
		dot.add_theme_stylebox_override("panel", sb)
		dot.size = Vector2(16, 16)
		dot.position = Vector2(x0 + i * gap - 8, box.size.y / 2.0 - 8)
		dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
		box.add_child(dot)
	return true


func _bowl_pos(i: int) -> Vector2:
	return Vector2(20 + i * 180 + 85, SHELF_Y + 70)


func _build_shelf() -> void:
	# 珊瑚色的架子
	_put(UiKit.piece("shelf"), Vector2(12, SHELF_Y + 112), Vector2(W - 24, 28))
	_bowls.clear()
	for i: int in GameState.MAX_SLOTS:
		var c: Vector2 = _bowl_pos(i)
		var tank := UiKit.icon("res://assets/ui/tank.png", 124)
		_put(tank, c - Vector2(62, 66))
		var fish := UiKit.icon("", 58)
		_put(fish, c - Vector2(29, 20))
		var plus := UiKit.badge("plus", 44)
		_put(plus, c - Vector2(22, 12))
		Anim.pulse(plus, 1.12)
		var pill := UiKit.piece("chip")
		_put(pill, c + Vector2(-40, 46), Vector2(80, 32))
		var count := Control.new()
		count.mouse_filter = Control.MOUSE_FILTER_IGNORE
		count.pivot_offset = Vector2(40, 16)
		_put(count, c + Vector2(-40, 46), Vector2(80, 32))
		var timer := UiKit.label("", 28, UiKit.GOLD)
		_put(timer, c + Vector2(-60, -84), Vector2(120, 30))
		var hot := UiKit.hotspot(c - Vector2(62, 66), Vector2(124, 150))
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
	return Vector2(196 + i * 82 + 34, ROW_Y + 36)


func _build_row() -> void:
	_put(UiKit.piece("chip"), Vector2(20, ROW_Y + 14), Vector2(150, 46))
	_progress = UiKit.text("", 26, UiKit.INK)
	_put(_progress, Vector2(20, ROW_Y + 14), Vector2(150, 46))
	_put(UiKit.piece("glass"), Vector2(182, ROW_Y), Vector2(436, 74))
	for i: int in _s.buffer_cap:
		var slot := UiKit.piece("slot")
		_put(slot, _buffer_pos(i) - Vector2(32, 32), Vector2(64, 64))
		if _intro:
			Anim.pop_in(slot, 0.2 + 0.04 * i)
	_buffer_box = _put(Control.new(), Vector2.ZERO)
	_buffer_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_put(UiKit.label(tr("UI_NEXT_BOWL"), 22), Vector2(626, ROW_Y), Vector2(116, 28))
	_next_icon = UiKit.icon("", 46)
	_put(_next_icon, Vector2(661, ROW_Y + 28))


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
			Anim.wiggle(f, 7.0, randf_range(1.2, 2.0), randf())
			Anim.drift(f, randf_range(3.0, 6.0), randf_range(3.0, 5.0), randf())
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


## 底栏：渐隐衬底上三个方形道具键，右上角是数量，下方是名字
func _build_tools(view_h: float) -> void:
	var names: Dictionary = {
		"net": "UI_TOOL_NET", "blow": "UI_TOOL_BLOW", "shuffle": "UI_TOOL_SHUFFLE"
	}
	_put(UiKit.piece("fade"), Vector2(-400, view_h - TOOLS_H - 30), Vector2(W + 800, TOOLS_H + 30))
	for i: int in TOOLS.size():
		var tool: String = TOOLS[i]
		var x: float = 135 + i * 240 - 52
		var y: float = view_h - TOOLS_H + 4
		var btn := UiKit.tile_button()
		btn.pressed.connect(_on_tool.bind(tool))
		Anim.press_fx(btn)
		_put(btn, Vector2(x, y), Vector2(104, 104))
		_put(UiKit.icon("res://assets/ui/tool_%s.png" % tool, 80), Vector2(x + 12, y + 12))
		_put(UiKit.label(tr(names[tool]), 24), Vector2(x - 30, y + 106), Vector2(164, 34))
		_put(UiKit.badge("dot_red", 40), Vector2(x + 78, y - 12))
		var badge := UiKit.label("", 22)
		_put(badge, Vector2(x + 78, y - 12), Vector2(40, 40))
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
		var count: Control = view["count"]
		count.visible = bowl != null
		# 只有紧挨着的下一个缸位能开
		(view["plus"] as Control).visible = i == _s.open_slots
		if bowl != null:
			(view["fish"] as TextureRect).texture = _fish_tex(bowl.species)
			if _fill_dots(count, bowl.count, bowl.cap):
				Anim.bounce(count, 1.3)
	for i: int in _buffer_box.get_child_count():
		_buffer_box.get_child(i).queue_free()
	for i: int in _s.buffer.size():
		var f := UiKit.icon("", 54)
		f.texture = _fish_tex(_s.buffer[i])
		f.position = _buffer_pos(i) - Vector2(27, 27)
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
		(_tool_badges[tool] as Label).text = str(mini(have, 99)) if have > 0 else "+"


# ---------- 输入 ----------


func _on_field_input(event: InputEvent, input: Control) -> void:
	var click := event as InputEventMouseButton
	if click == null or not click.pressed or click.button_index != MOUSE_BUTTON_LEFT:
		return
	if _over or _net_mode or _auto:
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
	var from: Vector2 = _fish_pos(b, k)
	var events: Array[Dictionary] = Rules.tap(_s, b, k)
	if events.is_empty():
		return
	_count_combo(events, from)
	Audio.sfx(&"tap", minf(1.0 + _combo * 0.05, 1.6))
	_play(events)


## 连击：在时间窗内连续把点到的鱼送进缸就累加；进了暂存槽或超时就断
func _count_combo(events: Array[Dictionary], from: Vector2) -> void:
	var cfg: Dictionary = Config.eco["combo"]
	var now: float = Time.get_ticks_msec() / 1000.0
	var hit: bool = events[0]["t"] == &"fish_to_bowl"
	if not hit or now - _combo_at > float(cfg["windowSeconds"]):
		_combo = 0
	if not hit:
		return
	_combo += 1
	_combo_at = now
	if _combo < int(cfg["startAt"]):
		return
	var praise: String = (cfg["praiseAt"] as Dictionary).get(str(_combo), "")
	_show_combo(tr(praise) if praise != "" else "", float(cfg["windowSeconds"]))
	if _combo_coins >= int(cfg["maxCoinsPerLevel"]):
		return
	var gain: int = int(cfg["coinPerHit"])
	_combo_coins += gain
	Save.data["coins"] = int(Save.data["coins"]) + gain
	_fx.coin_to(from, Vector2(100, BAR_Y + 34), minf(1.0 + _combo * 0.04, 1.5), _refresh_top)


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
				get_tree().create_timer(FLY_TIME + 0.35).timeout.connect(_celebrate)
			&"lose":
				_over = true
				get_tree().create_timer(0.7).timeout.connect(_show_lose.bind(e["reason"]))
	_refresh_field()
	# 顶部等鱼飞到了再更新，数字和鱼同时到位
	var wait: float = FLY_TIME + maxi(0, flights - 1) * 0.06 + (0.12 if bowl_done else 0.0)
	get_tree().create_timer(wait).timeout.connect(_refresh_top)
	_auto_finish()


## 只剩最后一条鱼时不用玩家再点：气泡自己破掉，鱼自己入缸
func _auto_finish() -> void:
	if _over or _auto or _s.status != GameState.Status.PLAYING or _s.fish_left() != 1:
		return
	for b: int in Rules.open_bubbles(_s):
		for k: int in _s.bubbles[b].fish.size():
			if _s.bubbles[b].fish[k] >= 0:
				_auto = true
				get_tree().create_timer(0.55).timeout.connect(_tap.bind(b, k))
				return


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


## 过关演出，播完再弹结算
func _celebrate() -> void:
	Anim.shake(_stage, 16.0)
	for i: int in _bowls.size():
		Anim.squash(_bowls[i]["tank"], 0.2)
	WinFx.play(self, tr("UI_FINISH_TITLE"), _stage.position + Vector2(100, BAR_Y + 34))
	get_tree().create_timer(1.9).timeout.connect(_show_win)


func _show_win() -> void:
	var reward: Dictionary = Meta.finish_level(
		Save.data, Config.eco, _level_id, _lv.challenge, Save.today()
	)
	var card: Dictionary = Meta.draw_card(
		Save.data, Config.eco, Config.species, "levelCard", Rng.new(Time.get_ticks_usec())
	)
	Save.save()
	_refresh_top()
	CardReveal.open(self, card, _after_reveal.bind(reward, card))


func _after_reveal(reward: Dictionary, card: Dictionary) -> void:
	if is_inside_tree():
		_win_popup(reward, card, false)
		Ads.banner(true)


func _win_popup(reward: Dictionary, card: Dictionary, doubled: bool) -> void:
	var coins: int = int(reward["coins"]) * (int(Config.eco["adCoinMultiplier"]) if doubled else 1)
	var lines: Array[String] = [
		tr("UI_COINS_GAIN") % (coins + _combo_coins), tr("UI_STARS_GAIN") % int(reward["stars"])
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
	_open_popup(tr("UI_FINISH_POPUP"), lines, buttons)
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


# ---------- 表现（实现见 GameFx） ----------


func _fly(slot: int, from: Vector2, to: Vector2, delay: float, on_arrive: Callable) -> void:
	_fx.fly(_fish_tex(slot), from, to, delay, on_arrive)


func _on_bowl_hit(slot: int) -> void:
	if slot < _bowls.size() and is_instance_valid(_bowls[slot]["tank"]):
		_fx.bowl_hit(_bowl_pos(slot), _bowls[slot]["tank"], _bowls[slot]["fish"])


func _bowl_done_fx(slot: int) -> void:
	if slot < _bowls.size() and is_instance_valid(_bowls[slot]["tank"]):
		_fx.bowl_done(_bowl_pos(slot), _bowls[slot]["tank"], _bowls[slot]["fish"])


func _pop_fx(b: int) -> void:
	var view: Dictionary = _bubbles[b]
	var c: Vector2 = view["center"]
	var r: float = view["r"]
	_fx.pop(c, r)
	# 旁边的气泡被震得晃一下
	for i: int in _bubbles.size():
		var other: Dictionary = _bubbles[i]
		var near: bool = c.distance_to(other["center"]) < r + float(other["r"]) + 30.0
		if i != b and near and (other["node"] as Control).visible:
			Anim.bounce(other["node"], 1.05, 0.25)


func _drop_fx(path: String, b: int) -> void:
	_fx.drop(path, _bubbles[b]["center"], _bubbles[b]["r"])


func _toast(text: String) -> void:
	_fx.toast(text, FIELD_Y - 4)


func _show_combo(praise: String, window: float) -> void:
	if _combo_hud == null or not is_instance_valid(_combo_hud):
		_combo_hud = ComboHud.new(_stage, Vector2(0, FIELD_Y + 50), Vector2(W, 240))
	_combo_hud.hit(_combo, clampf((_combo - 3) / 9.0, 0.0, 1.0), praise, window)
