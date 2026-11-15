class_name AvatarFrame
extends Control
## 收藏终极大奖的专属头像框（docs/01 §5.4）：头像外一圈金色环。
## 正式美术出来前用代码画：深金外沿 + 亮金主环 + 高光弧 + 四颗小星点。

const DARK := Color("A66A12")
const GOLD := Color("FFC93C")
const LIGHT := Color("FFF1A8")


## 给头像 avatar 外加一圈框，框盖在头像上沿外侧。没解锁不加，返回 null
static func attach(avatar: Control, owned: bool) -> AvatarFrame:
	if not owned or avatar.get_parent() == null:
		return null
	var frame := AvatarFrame.new()
	var side: float = avatar.size.x
	var pad: float = side * 0.14
	frame.size = Vector2.ONE * (side + pad * 2.0)
	frame.position = avatar.position - Vector2(pad, pad)
	frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	avatar.get_parent().add_child(frame)
	return frame


func _draw() -> void:
	var c: Vector2 = size / 2.0
	var r: float = size.x / 2.0
	var w: float = maxf(4.0, size.x * 0.075)
	draw_arc(c, r - w * 0.5, 0.0, TAU, 64, DARK, w + 2.0, true)
	draw_arc(c, r - w * 0.5, 0.0, TAU, 64, GOLD, w - 1.0, true)
	draw_arc(c, r - w * 0.7, PI * 1.05, PI * 1.55, 24, LIGHT, maxf(2.0, w * 0.35), true)
	for i: int in 4:
		var at: Vector2 = c + Vector2.from_angle(PI / 4.0 + i * PI / 2.0) * (r - w * 0.5)
		draw_circle(at, w * 0.55, LIGHT)
