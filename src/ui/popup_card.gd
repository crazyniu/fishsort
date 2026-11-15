class_name PopupCard
extends Control
## 通用弹窗：半透明遮罩 + 弹出的卡片。内容区可由调用方继续往 card 里加节点。

const CARD_W := 620.0

var card: Panel
## 标题和文字行之后的下一个可用 y
var content_y: float = 0.0


## buttons: [[文字, 颜色, 回调], ...]；extra_h 给调用方自定义内容预留高度
static func open(
	host: Control, title: String, lines: Array[String], buttons: Array, extra_h: float = 0.0
) -> PopupCard:
	var p := PopupCard.new()
	p.z_index = 100
	p.size = host.size
	host.add_child(p)
	var shade := ColorRect.new()
	shade.color = Color(0.02, 0.15, 0.2, 0.62)
	shade.size = host.size
	shade.modulate.a = 0.0
	p.add_child(shade)
	shade.create_tween().tween_property(shade, "modulate:a", 1.0, 0.18)
	var h: float = 140 + lines.size() * 52 + extra_h + buttons.size() * 102 + 20
	p.card = UiKit.panel(UiKit.CREAM)
	p.card.mouse_filter = Control.MOUSE_FILTER_STOP
	p.card.size = Vector2(CARD_W, h)
	p.card.position = Vector2((host.size.x - CARD_W) / 2.0, (host.size.y - h) / 2.0)
	p.card.pivot_offset = p.card.size / 2.0
	p.add_child(p.card)
	var head := UiKit.label(title, 58, UiKit.LEMON)
	head.position = Vector2(0, 22)
	head.size = Vector2(CARD_W, 84)
	p.card.add_child(head)
	var y: float = 118
	for text: String in lines:
		var l := UiKit.label(text, 30, UiKit.INK)
		l.add_theme_constant_override("outline_size", 0)
		l.position = Vector2(20, y)
		l.size = Vector2(CARD_W - 40, 46)
		p.card.add_child(l)
		y += 52
	p.content_y = y
	y += extra_h + 10
	for spec: Array in buttons:
		var b := UiKit.button(spec[0], spec[1])
		b.position = Vector2(95, y)
		b.size = Vector2(CARD_W - 190, 86)
		b.pressed.connect(spec[2])
		Anim.press_fx(b)
		p.card.add_child(b)
		y += 102
	Anim.pop_in(p.card)
	return p


func close() -> void:
	Anim.fade_out_free(self, 0.15)
