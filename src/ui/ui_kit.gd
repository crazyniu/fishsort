class_name UiKit
extends RefCounted
## 界面小部件工厂与配色，配色见 docs/03-美术规范.md 第 2 节。

const CORAL := Color("FF7A59")
const MINT := Color("2EC4B6")
const CREAM := Color("FFF6E5")
const LEMON := Color("FFD23F")
const BERRY := Color("8E5BD9")
const INK := Color("0E4A5A")
const GREEN := Color("5DC74A")

static var _cache: Dictionary = {}


static func tex(path: String) -> Texture2D:
	if not _cache.has(path):
		_cache[path] = load(path) if ResourceLoader.exists(path) else null
	return _cache[path]


## 不拦截点击的图片，按给定边长等比缩放
static func icon(path: String, side: float) -> TextureRect:
	var t := TextureRect.new()
	t.texture = tex(path)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	t.size = Vector2(side, side)
	t.pivot_offset = t.size / 2.0
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t


## 白字深色描边的游戏字
static func label(text: String, font_size: int, color: Color = Color.WHITE) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", INK)
	l.add_theme_constant_override("outline_size", maxi(4, font_size / 4))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


static func box(color: Color, radius: int, border: Color = INK, border_w: int = 4) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = color
	s.set_corner_radius_all(radius)
	s.border_color = border
	s.set_border_width_all(border_w)
	# 底边加厚，做出按钮的立体厚度
	s.border_width_bottom = border_w * 2
	s.set_content_margin_all(12)
	return s


static func panel(color: Color, radius: int = 28) -> Panel:
	var p := Panel.new()
	p.add_theme_stylebox_override("panel", box(color, radius))
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return p


static func button(text: String, color: Color, font_size: int = 34) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", font_size)
	b.add_theme_color_override("font_color", Color.WHITE)
	b.add_theme_color_override("font_hover_color", Color.WHITE)
	b.add_theme_color_override("font_pressed_color", Color.WHITE)
	b.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0.6))
	b.add_theme_color_override("font_outline_color", INK)
	b.add_theme_constant_override("outline_size", 8)
	b.add_theme_stylebox_override("normal", box(color, 26))
	b.add_theme_stylebox_override("hover", box(color.lightened(0.08), 26))
	b.add_theme_stylebox_override("pressed", box(color.darkened(0.12), 26))
	b.add_theme_stylebox_override("disabled", box(color.darkened(0.3), 26))
	return b


## 透明的点击热区
static func hotspot(pos: Vector2, area: Vector2) -> Button:
	var b := Button.new()
	b.flat = true
	b.focus_mode = Control.FOCUS_NONE
	b.position = pos
	b.size = area
	for state: String in ["normal", "hover", "pressed", "focus"]:
		b.add_theme_stylebox_override(state, StyleBoxEmpty.new())
	return b
