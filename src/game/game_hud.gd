class_name GameHud
extends RefCounted
## 局内的固定部件：顶部两个胶囊（已救/总数、关卡号）、暂存槽一排、底部技能键和设置键。

const BAR_Y := 14.0
const BAR_H := 52.0
const ROW_Y := 326.0
const SLOT := 56.0
const SLOT_GAP := 66.0
const TOOLS_H := 150.0
const TOOL_NAMES: Dictionary = {
	"net": "UI_TOOL_NET", "blow": "UI_TOOL_BLOW", "shuffle": "UI_TOOL_SHUFFLE"
}

var _stage: Control
var _fx: GameFx
var _rescued: Label
var _rescued_shown: int = 0
var _total: int = 0
var _cap: int = 5
var _slots: Array[Control] = []
## 暂存槽里的鱼，按逻辑顺序；还在飞的那条先隐藏
var _fish: Array[TextureRect] = []
var _warn: Panel
var _warn_tween: Tween
var _tool_badges: Dictionary = {}
var _tool_btns: Dictionary = {}
var _tool_pos: Dictionary = {}
var _nudge: Dictionary = {}
var _level: int = 1


func _init(stage: Control, fx: GameFx) -> void:
	_stage = stage
	_fx = fx


# ---------- 顶部 ----------


## 左：生物图标 + 已救/总数；右：第 N 关（挑战关金色）。局内不显示金币
func build_top(level_id: int, challenge: bool, icon: Texture2D, total: int, intro: bool) -> void:
	_level = level_id
	_total = total
	var left := Control.new()
	left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx.put(left, Vector2(20, BAR_Y), Vector2(176, BAR_H))
	var chip := UiKit.piece("track")
	chip.size = left.size
	left.add_child(chip)
	var pic := UiKit.icon("", 50)
	pic.texture = icon
	pic.position = Vector2(6, 1)
	left.add_child(pic)
	_rescued = UiKit.label("", 28)
	_rescued.position = Vector2(56, 0)
	_rescued.size = Vector2(112, BAR_H)
	_rescued.pivot_offset = _rescued.size / 2.0
	left.add_child(_rescued)
	var right := Control.new()
	right.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx.put(right, Vector2(_fx.width - 20 - 176, BAR_Y), Vector2(176, BAR_H))
	var chip2 := UiKit.piece("track")
	chip2.size = right.size
	right.add_child(chip2)
	var ink: Color = UiKit.GOLD if challenge else Color.WHITE
	var title := UiKit.label(_stage.tr("UI_LEVEL") % level_id, 28, ink)
	title.size = right.size
	right.add_child(title)
	if intro:
		Anim.pop_in(left)
		Anim.pop_in(right, 0.05)


## 已救数：animate 时一条一条往上跳
func set_rescued(n: int, animate: bool) -> void:
	if not is_instance_valid(_rescued):
		return
	var changed: bool = n != _rescued_shown
	_rescued_shown = n
	_rescued.text = "%d/%d" % [n, _total]
	if animate and changed:
		Anim.bounce(_rescued, 1.25, 0.25)


func rescued_shown() -> int:
	return _rescued_shown


## 过关金币飞向的位置（结算演出用）
func top_anchor() -> Vector2:
	return Vector2(108, BAR_Y + BAR_H / 2.0)


# ---------- 暂存槽 ----------


func buffer_pos(i: int) -> Vector2:
	var x0: float = (_fx.width - SLOT_GAP * (_cap - 1)) / 2.0
	return Vector2(x0 + i * SLOT_GAP, ROW_Y + SLOT / 2.0)


## 一排低调的小格子，不垫托盘；species 是开局时已经在槽里的鱼的贴图
func build_buffer(cap: int, fish: Array[Texture2D], intro: bool) -> void:
	_cap = cap
	_slots.clear()
	_fish.clear()
	for i: int in cap:
		var slot := UiKit.piece("track")
		slot.modulate = Color(1, 1, 1, 0.82)
		_fx.put(slot, buffer_pos(i) - Vector2(SLOT, SLOT) / 2.0, Vector2(SLOT, SLOT))
		_slots.append(slot)
		if intro:
			Anim.pop_in(slot, 0.2 + 0.04 * i)
	# 告警框：只剩一格时套在那一格上闪
	_warn = Panel.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(1.0, 0.2, 0.15, 0.18)
	sb.border_color = Color("FF4433")
	sb.set_border_width_all(4)
	sb.set_corner_radius_all(11)
	_warn.add_theme_stylebox_override("panel", sb)
	_warn.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_warn.visible = false
	_fx.put(_warn, Vector2.ZERO, Vector2(SLOT + 8, SLOT + 8))
	for tex: Texture2D in fish:
		buffer_land(buffer_add(tex))
	_layout(false)


## 一条鱼正飞向暂存槽：先占位（隐藏），落地时调 buffer_land
func buffer_add(tex: Texture2D) -> TextureRect:
	var f := UiKit.icon("", 48)
	f.texture = tex
	f.visible = false
	f.z_index = 1
	_fx.put(f, buffer_pos(_fish.size()) - Vector2(24, 24))
	_fish.append(f)
	_update_warn()
	return f


## 落进槽里：鱼弹出来，槽格轻弹，声音比入缸低沉
func buffer_land(f: TextureRect) -> void:
	if not is_instance_valid(f) or f.visible:
		return
	f.visible = true
	Anim.pop_in(f, 0.0, 0.2)
	var i: int = _fish.find(f)
	if i >= 0 and i < _slots.size():
		Anim.squash(_slots[i], 0.16)
	Audio.sfx(&"buffer", randf_range(0.9, 1.0))


## 第 i 条鱼离开暂存槽（飞去鱼缸）。返回它现在的位置，后面的鱼往左补位
func buffer_take(i: int) -> Vector2:
	if i < 0 or i >= _fish.size():
		return buffer_pos(i)
	var f: TextureRect = _fish[i]
	_fish.remove_at(i)
	var at: Vector2 = f.position + Vector2(24, 24)
	f.queue_free()
	_layout(true)
	return at


## 吹泡：槽里的鱼全部飘走
func buffer_clear() -> void:
	for f: TextureRect in _fish:
		f.visible = true
		var tw: Tween = f.create_tween().set_parallel()
		tw.tween_property(f, "position:y", f.position.y + 50, 0.25)
		tw.tween_property(f, "modulate:a", 0.0, 0.25)
		tw.chain().tween_callback(f.queue_free)
	_fish.clear()
	_update_warn()


func _layout(animate: bool) -> void:
	for i: int in _fish.size():
		var to: Vector2 = buffer_pos(i) - Vector2(24, 24)
		if animate:
			_fish[i].create_tween().tween_property(_fish[i], "position", to, 0.18).set_ease(
				Tween.EASE_OUT
			)
		else:
			_fish[i].position = to
	_update_warn()


## 空格数（按逻辑算，在路上的鱼也占格）
func buffer_free() -> int:
	return _cap - _fish.size()


func _update_warn() -> void:
	if not is_instance_valid(_warn):
		return
	var cfg: Dictionary = GameCfg.d()["buffer"]
	var on: bool = buffer_free() == int(cfg["warnFree"]) and _fish.size() < _slots.size()
	if on:
		_warn.position = buffer_pos(_fish.size()) - _warn.size / 2.0
	if on != _warn.visible:
		_warn.visible = on
		if _warn_tween != null:
			_warn_tween.kill()
		if on:
			Audio.sfx(&"warn")
			_warn.modulate.a = 1.0
			_warn_tween = _warn.create_tween().set_loops()
			_warn_tween.tween_property(_warn, "modulate:a", 0.25, 0.28)
			_warn_tween.tween_property(_warn, "modulate:a", 1.0, 0.28)
	# 快满时，能救场的技能键跳动提醒
	var urge: bool = buffer_free() <= int(cfg["skillNudgeFree"])
	_set_nudge("blow", urge and not _fish.is_empty())


# ---------- 技能键 ----------


func tool_pos(tool: String) -> Vector2:
	return _tool_pos[tool]


func tool_locked(tool: String) -> bool:
	return _level < GameCfg.unlock_level(tool)


## 底栏：渐隐衬底上一排技能键，最右是设置键。未解锁的技能是灰锁和「第 N 关」
func build_tools(view_h: float, intro: bool, on_tool: Callable, on_gear: Callable) -> void:
	_tool_badges.clear()
	_tool_btns.clear()
	_nudge.clear()
	var w: float = _fx.width
	_fx.put(
		UiKit.piece("fade"), Vector2(-400, view_h - TOOLS_H - 30), Vector2(w + 800, TOOLS_H + 30)
	)
	var order: Array = GameCfg.d()["skillOrder"]
	var y: float = view_h - TOOLS_H + 4
	for i: int in order.size():
		var tool: String = order[i]
		var x: float = 40 + i * 160.0
		var btn := UiKit.tile_button()
		btn.pressed.connect(on_tool.bind(tool))
		Anim.press_fx(btn)
		_fx.put(btn, Vector2(x, y), Vector2(104, 104))
		_tool_btns[tool] = btn
		_tool_pos[tool] = Vector2(x + 52, y + 52)
		if tool_locked(tool):
			btn.face.modulate = Color(0.55, 0.6, 0.68)
			var lock := UiKit.icon("res://assets/ui/lock.png", 62)
			var gray := GameFx.tint_material()
			gray.set_shader_parameter("gray", 1.0)
			lock.material = gray
			_fx.put(lock, Vector2(x + 21, y + 19))
			var need: String = _stage.tr("UI_LEVEL") % GameCfg.unlock_level(tool)
			_fx.put(
				UiKit.label(need, 22, Color("C9D3E6")), Vector2(x - 30, y + 106), Vector2(164, 34)
			)
		else:
			_fx.put(UiKit.icon("res://assets/ui/tool_%s.png" % tool, 80), Vector2(x + 12, y + 12))
			_fx.put(
				UiKit.label(_stage.tr(TOOL_NAMES[tool]), 24),
				Vector2(x - 30, y + 106),
				Vector2(164, 34)
			)
			_fx.put(UiKit.badge("dot_red", 40), Vector2(x + 78, y - 12))
			var badge := UiKit.label("", 22)
			_fx.put(badge, Vector2(x + 78, y - 12), Vector2(40, 40))
			_tool_badges[tool] = badge
		if intro:
			Anim.pop_in(btn, 0.3 + 0.06 * i)
	_fx.put(UiKit.badge("btn_gear", 64), Vector2(w - 40 - 64, y + 20))
	var gear := UiKit.hotspot(Vector2(w - 124, y), Vector2(104, 104))
	gear.pressed.connect(on_gear)
	Anim.press_fx(gear)
	_stage.add_child(gear)
	refresh_tools()


## 角标：数量最多显示 99，没有了显示「+」
func refresh_tools() -> void:
	var cap: int = int(GameCfg.d()["badgeCap"])
	for tool: String in _tool_badges:
		var badge: Label = _tool_badges[tool]
		if is_instance_valid(badge):
			var have: int = int(Save.data["tools"][tool])
			badge.text = str(mini(have, cap)) if have > 0 else "+"


func _set_nudge(tool: String, on: bool) -> void:
	if not _tool_btns.has(tool) or tool_locked(tool) or bool(_nudge.get(tool, false)) == on:
		return
	_nudge[tool] = on
	var btn: Control = _tool_btns[tool]
	if not is_instance_valid(btn):
		return
	if on:
		btn.pivot_offset = btn.size / 2.0
		var tw: Tween = btn.create_tween().set_loops()
		tw.tween_property(btn, "scale", Vector2(1.1, 1.1), 0.3).set_trans(Tween.TRANS_SINE)
		tw.tween_property(btn, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_SINE)
		btn.set_meta("nudge", tw)
	elif btn.has_meta("nudge"):
		(btn.get_meta("nudge") as Tween).kill()
		btn.scale = Vector2.ONE
