class_name KitButton
extends Button
## 贴图按钮：立体果冻面 + 文字。按下时变暗并下沉，禁用时变灰。

var face: Slice3


func _init() -> void:
	focus_mode = Control.FOCUS_NONE
	for state: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		var empty := StyleBoxEmpty.new()
		# 贴图底边较厚，文字稍微上移才居中
		empty.content_margin_bottom = 10
		add_theme_stylebox_override(state, empty)
	face = Slice3.new()
	face.show_behind_parent = true
	add_child(face)
	resized.connect(_fit)
	button_down.connect(_set_pressed_look.bind(true))
	button_up.connect(_set_pressed_look.bind(false))


# 进树之前设置的尺寸不会触发 resized，这里补一次
func _ready() -> void:
	_fit()


func _fit() -> void:
	face.size = size


func _set_pressed_look(down: bool) -> void:
	face.position.y = 4.0 if down else 0.0
	_tint(down)


func _tint(down: bool = false) -> void:
	if disabled:
		face.modulate = Color(0.62, 0.66, 0.7)
	else:
		face.modulate = Color(0.82, 0.84, 0.9) if down else Color.WHITE


func _draw() -> void:
	# disabled 变化会触发重绘，借这里同步外观
	_tint(face.position.y > 0.0)
