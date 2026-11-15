class_name LevelRoute
extends Control
## 选关路线（docs/01 §5.7）：可上下滑动的一条路，已通过的绿色圆点可重玩，
## 当前关高亮跳动，后面的灰色上锁，挑战关用橙色方块加宝箱标记。

const W := 750.0
const STEP := 128.0
const TOP_PAD := 150.0
const BOTTOM_PAD := 120.0
## 路线左右摆动的一个周期（相对中线的偏移）
const SWAY: Array[float] = [0.0, 130.0, 210.0, 130.0, 0.0, -130.0, -210.0, -130.0]
const PASSED_LINE := Color("4CC42E")
const LOCKED_LINE := Color("6E8FBF")

var _host: Control
var _model: HomeModel
var _scroll: ScrollContainer
var _inner: Control


## host 是挂靠的界面（HomeScreen）
static func open(host: Control) -> LevelRoute:
	var page := LevelRoute.new()
	page._host = host
	page.size = host.size
	page.z_index = 95
	host.add_child(page)
	page._build()
	return page


func _x(n: int) -> float:
	return W / 2.0 + SWAY[n % SWAY.size()]


func _y(n: int, total: int) -> float:
	return TOP_PAD + (total - n) * STEP


func _build() -> void:
	_model = HomeModel.get_inst()
	var bg := TextureRect.new()
	bg.texture = UiKit.tex("res://assets/ui/bg_home.jpg")
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.size = size
	add_child(bg)
	var stage := Control.new()
	stage.position = Vector2((size.x - W) / 2.0, 0)
	stage.size = Vector2(W, size.y)
	add_child(stage)
	var total: int = _model.total_levels()
	_scroll = ScrollContainer.new()
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
	HomePage.add_to(stage, _scroll, Vector2(0, 0), Vector2(W, size.y))
	_inner = Control.new()
	_inner.mouse_filter = Control.MOUSE_FILTER_PASS
	_inner.custom_minimum_size = Vector2(W, TOP_PAD + total * STEP + BOTTOM_PAD)
	_scroll.add_child(_inner)
	var line := RouteLine.new()
	line.setup(total, _model.level(), _x, _y)
	line.size = _inner.custom_minimum_size
	_inner.add_child(line)
	for n: int in range(1, total + 1):
		_node(n, total)
	_header(stage)
	# 滚到当前关附近，让它落在屏幕偏下的位置
	var focus: float = _y(_model.level(), total)
	_scroll.scroll_vertical = int(maxf(0.0, focus - size.y * 0.62))
	call_deferred("_focus_current", focus)
	modulate.a = 0.0
	create_tween().tween_property(self, "modulate:a", 1.0, 0.2)


func _focus_current(focus: float) -> void:
	_scroll.scroll_vertical = int(maxf(0.0, focus - size.y * 0.62))


## 顶部不放整条栏，让路线铺满屏幕：只有顶上一层很淡的渐变托底，
## 左上悬一个返回胶囊，右上悬一个重玩奖励胶囊。
func _header(stage: Control) -> void:
	HomePage.add_to(stage, UiKit.top_scrim(W + 800, 170), Vector2(-400, 0))
	var back := _pill(tr("H_BACK_ARROW"), 150.0)
	HomePage.add_to(stage, back, Vector2(24, 26))
	var hot := UiKit.hotspot(Vector2(-8, -8), Vector2(166, 88))
	hot.pressed.connect(close)
	Anim.press_fx(hot)
	back.add_child(hot)
	# 重玩每天前 5 次给奖励
	var hint: String = tr("H_REPLAY_HINT") % [_model.replay_used(), _model.replay_cap()]
	HomePage.add_to(stage, _pill(hint, 330.0), Vector2(W - 24.0 - 330.0, 26))


## 悬浮的白色胶囊：白底深蓝字，不描边
func _pill(caption: String, width: float) -> Control:
	var box := Control.new()
	box.size = Vector2(width, 72)
	box.pivot_offset = box.size / 2.0
	var chip := UiKit.piece("chip")
	chip.size = box.size
	box.add_child(chip)
	var text := UiKit.text(caption, 26, UiKit.INK)
	text.size = box.size
	text.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	text.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	box.add_child(text)
	return box


func close() -> void:
	Anim.fade_out_free(self, 0.15)


func _node(n: int, total: int) -> void:
	var state: String = _model.level_state(n)
	var challenge: bool = _model.is_challenge(n)
	var side: float = 104.0 if state == "current" else (84.0 if challenge else 76.0)
	var holder := Control.new()
	holder.position = Vector2(_x(n) - side / 2.0, _y(n, total) - side / 2.0)
	holder.size = Vector2(side, side)
	holder.pivot_offset = holder.size / 2.0
	_inner.add_child(holder)
	var grey := state == "locked"
	if challenge:
		var sq := UiKit.piece("btn_orange")
		sq.size = Vector2(side, side)
		holder.add_child(sq)
		sq.modulate = Color(0.6, 0.66, 0.74) if grey else Color.WHITE
		var chest := UiKit.icon("res://assets/ui/chest.png", 38)
		chest.position = Vector2(side - 26.0, -14.0)
		chest.modulate = Color(0.6, 0.66, 0.74) if grey else Color.WHITE
		holder.add_child(chest)
	else:
		var disc := UiKit.badge("badge_green", side)
		holder.add_child(disc)
		disc.modulate = Color(0.55, 0.62, 0.72) if grey else Color.WHITE
	if grey and not challenge:
		var lock := UiKit.icon("res://assets/ui/lock.png", 36)
		lock.position = Vector2((side - 36.0) / 2.0, (side - 36.0) / 2.0)
		holder.add_child(lock)
	else:
		var num := UiKit.label(str(n), 34 if state != "current" else 44)
		num.size = Vector2(side, side - 4.0)
		holder.add_child(num)
	if state == "current":
		Anim.pulse(holder, 1.08, 1.0)
		var tag := UiKit.label(tr("H_YOU_ARE_HERE"), 22, UiKit.GOLD)
		tag.position = Vector2(side + 6.0, side / 2.0 - 16.0)
		tag.size = Vector2(110, 32)
		holder.add_child(tag)
	var hot := UiKit.hotspot(Vector2(-10, -10), Vector2(side + 20, side + 20))
	hot.pressed.connect(_on_node.bind(n, holder))
	holder.add_child(hot)


func _on_node(n: int, holder: Control) -> void:
	if _model.level_state(n) == "locked":
		Audio.sfx(&"error")
		Anim.shake(holder, 6.0)
		return
	Audio.sfx(&"click")
	close()
	# 已通过的关按重玩开始；当前关照常
	if _host.has_method("start_level"):
		_host.call("start_level", n if _model.level_state(n) == "passed" else 0)


## 路线：已通过的一段是绿色，后面是灰蓝色
class RouteLine:
	extends Control

	var _total: int = 0
	var _current: int = 1
	var _fx: Callable
	var _fy: Callable

	func setup(total: int, current: int, fx: Callable, fy: Callable) -> void:
		_total = total
		_current = current
		_fx = fx
		_fy = fy
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func _draw() -> void:
		for n: int in range(1, _total):
			var a := Vector2(_fx.call(n), _fy.call(n, _total))
			var b := Vector2(_fx.call(n + 1), _fy.call(n + 1, _total))
			var color: Color = PASSED_LINE if n < _current else LOCKED_LINE
			draw_line(a, b, color, 14.0, true)
