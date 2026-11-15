class_name HomePage
extends Control
## 主界面中间页面的基类：持有 HomeScreen，提供摆放控件的小工具。子类重写 build()。

const W := 750.0

var host: HomeScreen


func build() -> void:
	pass


func add(node: Control, pos: Vector2, area: Vector2 = Vector2.ZERO) -> Control:
	return add_to(self, node, pos, area)


static func add_to(
	parent: Control, node: Control, pos: Vector2, area: Vector2 = Vector2.ZERO
) -> Control:
	node.position = pos
	if area != Vector2.ZERO:
		node.size = area
		node.pivot_offset = area / 2.0
	parent.add_child(node)
	return node


func btn(
	parent: Control,
	text: String,
	color: Color,
	pos: Vector2,
	area: Vector2,
	action: Callable,
	font: int = 32
) -> KitButton:
	var b := UiKit.button(text, color, font)
	b.pressed.connect(action)
	Anim.press_fx(b)
	add_to(parent, b, pos, area)
	return b


## 按钮上的小标：看广告的视频角标
func ad_badge(b: Control) -> void:
	var badge := UiKit.badge("badge_video", 36)
	badge.position = Vector2(b.size.x - 30.0, -14.0)
	b.add_child(badge)


## 按钮上的金币价：文字靠左，右侧金币图标 + 价格
func coin_price(b: KitButton, price: int) -> void:
	b.alignment = HORIZONTAL_ALIGNMENT_LEFT
	for state: String in ["normal", "hover", "pressed", "disabled", "focus"]:
		var pad := StyleBoxEmpty.new()
		pad.content_margin_left = 22.0
		b.add_theme_stylebox_override(state, pad)
	var label := UiKit.label(str(price), 30)
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	label.position = Vector2(b.size.x - 24.0 - 80.0, 0)
	label.size = Vector2(80.0, b.size.y - 6.0)
	b.add_child(label)
	var coin := UiKit.icon("res://assets/ui/coin.png", 44)
	coin.position = Vector2(b.size.x - 24.0 - 80.0 - 46.0, (b.size.y - 44.0) / 2.0 - 3.0)
	b.add_child(coin)


func title(text: String) -> void:
	add(UiKit.label(text, 52), Vector2(0, 18), Vector2(W, 72))
