class_name WheelView
extends Control
## 转盘本体：色块扇区随 rot 转动，奖品图标和文字始终摆正，只沿圆周移动（汉字不旋转）。
## 指针固定在正上方；旋转越过一个扇区分界就发一次 ticked 信号（播滴答声、指针弹一下）。

signal ticked

const SEG_COLORS: Array[Color] = [Color("3C97F4"), Color("1B54B0")]
const RIM := Color("0F2F6E")
const HUB := Color("FFC93C")

var rot: float = 0.0:
	set(value):
		rot = value
		_place_items()
		queue_redraw()

var _segments: Array = []
var _radius: float = 250.0
var _items: Array[Control] = []
var _last_tick: int = 0
var _pointer: Control


func setup(segments: Array, radius: float) -> WheelView:
	_segments = segments
	_radius = radius
	size = Vector2(radius * 2.0 + 40.0, radius * 2.0 + 70.0)
	pivot_offset = size / 2.0
	for i: int in segments.size():
		var item := Control.new()
		item.mouse_filter = Control.MOUSE_FILTER_IGNORE
		item.size = Vector2(110, 110)
		item.pivot_offset = item.size / 2.0
		var prize: Dictionary = segments[i]
		var icon := UiKit.icon(HomePrize.icon_path(prize), 54)
		icon.modulate = HomePrize.tint(prize)
		icon.position = Vector2(28, 0)
		item.add_child(icon)
		var text := UiKit.label(HomePrize.short(prize), 24)
		text.position = Vector2(0, 62)
		text.size = Vector2(110, 34)
		item.add_child(text)
		add_child(item)
		_items.append(item)
	_build_pointer()
	_place_items()
	return self


func _center() -> Vector2:
	return Vector2(size.x / 2.0, _radius + 52.0)


func _seg_angle() -> float:
	return TAU / maxf(1.0, _segments.size())


func _build_pointer() -> void:
	# 指针：红色实心水滴指向转盘，挂在转盘上沿
	_pointer = Control.new()
	_pointer.size = Vector2(56, 70)
	_pointer.pivot_offset = Vector2(28, 14)
	_pointer.position = Vector2(size.x / 2.0 - 28.0, 0)
	_pointer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_pointer.draw.connect(_draw_pointer)
	add_child(_pointer)
	_pointer.z_index = 2


func _draw_pointer() -> void:
	var pts := PackedVector2Array([Vector2(4, 12), Vector2(52, 12), Vector2(28, 66)])
	_pointer.draw_colored_polygon(pts, UiKit.RED)
	_pointer.draw_circle(Vector2(28, 22), 22.0, UiKit.RED)
	_pointer.draw_circle(Vector2(28, 22), 9.0, Color.WHITE)


func _place_items() -> void:
	var seg: float = _seg_angle()
	for i: int in _items.size():
		var a: float = rot + i * seg
		var dir := Vector2(sin(a), -cos(a))
		_items[i].position = _center() + dir * _radius * 0.64 - _items[i].size / 2.0
	# 越过扇区分界：滴答 + 指针弹一下
	var tick: int = int(floor(rot / seg + 0.5))
	if tick != _last_tick:
		_last_tick = tick
		ticked.emit()
		if _pointer != null:
			_pointer.rotation = deg_to_rad(-16.0)
			_pointer.create_tween().tween_property(_pointer, "rotation", 0.0, 0.1)


func _draw() -> void:
	var c: Vector2 = _center()
	var seg: float = _seg_angle()
	draw_circle(c + Vector2(0, 8), _radius + 18.0, Color(0.02, 0.1, 0.3, 0.35))
	draw_circle(c, _radius + 14.0, RIM)
	for i: int in _segments.size():
		var a0: float = rot + (i - 0.5) * seg
		var pts := PackedVector2Array([c])
		for k: int in 13:
			var a: float = a0 + seg * k / 12.0
			pts.append(c + Vector2(sin(a), -cos(a)) * _radius)
		var tone: int = int((_segments[i] as Dictionary)["tone"])
		draw_colored_polygon(pts, SEG_COLORS[tone])
	# 扇区分隔线
	for i: int in _segments.size():
		var a: float = rot + (i - 0.5) * seg
		draw_line(c, c + Vector2(sin(a), -cos(a)) * _radius, Color(1, 1, 1, 0.35), 3.0, true)
	draw_arc(c, _radius + 7.0, 0.0, TAU, 96, Color("5FB4FF"), 6.0, true)
	# 轮缘上的小灯
	for i: int in _segments.size():
		var a: float = rot * 0.0 + (i - 0.5) * seg
		draw_circle(c + Vector2(sin(a), -cos(a)) * (_radius + 7.0), 6.0, HUB)
	draw_circle(c, 44.0, RIM)
	draw_circle(c, 36.0, HUB)
	draw_circle(c, 14.0, Color.WHITE)
