class_name KitButton
extends Button
## 贴图按钮：按下时变暗并下沉，禁用时变灰。

var face: Patch


func _init() -> void:
	focus_mode = Control.FOCUS_NONE
	for state: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		add_theme_stylebox_override(state, StyleBoxEmpty.new())
	face = Patch.new()
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
	face.position.y = 3.0 if down else 0.0
	_tint(down)


func _tint(down: bool = false) -> void:
	if disabled:
		face.modulate = Color(0.66, 0.7, 0.74, 0.9)
	else:
		face.modulate = Color(0.86, 0.88, 0.93) if down else Color.WHITE


func _draw() -> void:
	# disabled 变化会触发重绘，借这里同步外观
	_tint(face.position.y > 0.0)
