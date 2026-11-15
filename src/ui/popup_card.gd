class_name PopupCard
extends Control
## 统一弹窗（docs/03「弹窗」）：一层不透明深海蓝面板，标题压在顶部亮蓝色带上，
## 右上角红色圆形关闭键略探出，按钮最多两个（主按钮在右），背景压暗 60%，缩放回弹约 0.2 秒。
## 内容区由调用方继续往 card 里加节点，起点是 content_y。

const CARD_W := 620.0
const HEAD_H := 84.0
const SIDE := 32.0
const BTN_H := 88.0
const LINE_H := 46.0
const GAP := 16.0

var card: Patch
## 标题和文字行之后的下一个可用 y
var content_y: float = 0.0
## 按钮区的起点 y（调用方往内容区加东西时不要越过它）
var buttons_y: float = 0.0

## 底部按钮，从左到右
var buttons: Array[KitButton] = []

var _on_close: Callable
var _closing: bool = false


## specs: [[文字, 颜色, 回调, 选项], ...]，选项是可选字典：
##   ad: true 带视频角标（看广告）；coin: 金币价，按钮左侧带金币图标；disabled: true 置灰
## 一个或两个按钮时并排，颜色为绿色的（没有绿色就取最后一个）放在右边当主按钮。
## 超过两个的旧调用退化成竖排，仅为兼容尚未改造的局内弹窗。
## opts: closable（默认 true，显示红色关闭键）、on_close（关闭时回调）、backdrop_close（点背景关闭）
static func open(
	host: Control,
	title: String,
	lines: Array[String],
	specs: Array,
	extra_h: float = 0.0,
	opts: Dictionary = {}
) -> PopupCard:
	var p := PopupCard.new()
	p.z_index = 100
	p.size = host.size
	p._on_close = opts.get("on_close", Callable())
	host.add_child(p)
	var shade := ColorRect.new()
	shade.color = Color(0.0, 0.05, 0.13, 0.6)
	shade.size = host.size
	shade.modulate.a = 0.0
	if bool(opts.get("backdrop_close", false)):
		shade.gui_input.connect(p._on_shade_input)
	p.add_child(shade)
	shade.create_tween().tween_property(shade, "modulate:a", 1.0, 0.18)
	var stacked: bool = specs.size() > 2
	var btn_block: float = 0.0
	if not specs.is_empty():
		btn_block = (BTN_H + GAP) * specs.size() - GAP if stacked else BTN_H
	var h: float = HEAD_H + 28.0 + lines.size() * LINE_H + extra_h + 28.0 + SIDE
	if not specs.is_empty():
		h += btn_block
	p.card = UiKit.piece("popup")
	p.card.mouse_filter = Control.MOUSE_FILTER_STOP
	p.card.size = Vector2(CARD_W, h)
	p.card.position = Vector2((host.size.x - CARD_W) / 2.0, (host.size.y - h) / 2.0)
	p.card.pivot_offset = p.card.size / 2.0
	p.add_child(p.card)
	p._build_head(title, bool(opts.get("closable", true)))
	var y: float = HEAD_H + 28.0
	for text: String in lines:
		var l := UiKit.text(text, 30, Color.WHITE)
		l.position = Vector2(SIDE, y)
		l.size = Vector2(CARD_W - SIDE * 2.0, LINE_H)
		l.autowrap_mode = TextServer.AUTOWRAP_OFF
		p.card.add_child(l)
		y += LINE_H
	p.content_y = y
	y += extra_h + 28.0
	p.buttons_y = y
	p._build_buttons(specs, y, stacked)
	Audio.sfx(&"pop")
	Anim.pop_in(p.card, 0.0, 0.2)
	return p


func _build_head(title: String, closable: bool) -> void:
	var head := UiKit.piece("popup_head")
	head.size = Vector2(CARD_W, HEAD_H)
	card.add_child(head)
	var t := UiKit.label(title, 40)
	t.size = Vector2(CARD_W - 120.0, HEAD_H)
	t.position = Vector2(60, 0)
	card.add_child(t)
	if not closable:
		return
	# 红色圆形关闭键，探出面板右上角
	var side: float = 56.0
	var at := Vector2(CARD_W - side + 14.0, -14.0)
	var dot := UiKit.badge("close_round", side)
	dot.position = at
	card.add_child(dot)
	var hot := UiKit.hotspot(at - Vector2(12, 12), Vector2(side + 24, side + 24))
	hot.pressed.connect(close)
	Anim.press_fx(hot)
	card.add_child(hot)


func _build_buttons(specs: Array, y: float, stacked: bool) -> void:
	if specs.is_empty():
		return
	if stacked:
		for i: int in specs.size():
			var spec: Array = specs[i]
			_make_button(spec, Vector2(SIDE + 40.0, y + i * (BTN_H + GAP)), CARD_W - SIDE * 2 - 80)
		return
	var order: Array = specs.duplicate()
	if order.size() == 2 and order[0][1] == UiKit.GREEN and order[1][1] != UiKit.GREEN:
		order.reverse()
	if order.size() == 1:
		var single_w: float = 300.0 if (order[0][0] as String).length() <= 8 else 400.0
		_make_button(order[0], Vector2((CARD_W - single_w) / 2.0, y), single_w)
		return
	var w: float = (CARD_W - SIDE * 2.0 - GAP) / 2.0
	for i: int in 2:
		_make_button(order[i], Vector2(SIDE + i * (w + GAP), y), w)


func _make_button(spec: Array, pos: Vector2, w: float) -> void:
	var opts: Dictionary = spec[3] if spec.size() > 3 else {}
	# 长文案缩小字号，免得溢出按钮
	var caption: String = spec[0]
	var font: int = 32 if caption.length() <= 6 else (26 if caption.length() <= 9 else 23)
	var b := UiKit.button(caption, spec[1], font)
	b.position = pos
	b.size = Vector2(w, BTN_H)
	b.pivot_offset = b.size / 2.0
	if spec[2] is Callable and (spec[2] as Callable).is_valid():
		b.pressed.connect(spec[2])
	buttons.append(b)
	b.disabled = bool(opts.get("disabled", false))
	Anim.press_fx(b)
	card.add_child(b)
	if int(opts.get("coin", 0)) > 0:
		# 金币价按钮：文字靠左，右侧是金币图标 + 价格
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		for state: String in ["normal", "hover", "pressed", "disabled", "focus"]:
			var pad := StyleBoxEmpty.new()
			pad.content_margin_left = 22.0
			b.add_theme_stylebox_override(state, pad)
		var price := UiKit.label(str(int(opts["coin"])), 32)
		price.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		price.position = Vector2(w - 24.0 - 76.0, 0)
		price.size = Vector2(76.0, BTN_H - 6.0)
		b.add_child(price)
		var coin := UiKit.icon("res://assets/ui/coin.png", 44)
		coin.position = Vector2(w - 24.0 - 76.0 - 46.0, (BTN_H - 44.0) / 2.0 - 3.0)
		b.add_child(coin)
	if bool(opts.get("ad", false)):
		var badge := UiKit.badge("badge_video", 36)
		badge.position = Vector2(w - 30.0, -14.0)
		b.add_child(badge)


func _on_shade_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		close()


func close() -> void:
	if _closing:
		return
	_closing = true
	if _on_close.is_valid():
		_on_close.call()
	Anim.fade_out_free(self, 0.15)
