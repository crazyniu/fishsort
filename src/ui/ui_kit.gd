class_name UiKit
extends RefCounted
## 界面部件工厂。风格是「轻玻璃」，见 docs/03-美术规范.md 第 2 节。
## 部件贴图由 tools/art/kit.py 绘制；界面只用这里提供的部件，不直接画色块。

const BLUE := Color("2F8FF0")
const NAVY := Color("0B2E6B")
const GREEN := Color("4CC42E")
const ORANGE := Color("FF9B21")
const PURPLE := Color("8E5BD9")
const RED := Color("F0503C")
const GOLD := Color("FFC93C")
## 浅色面板上的正文色
const BODY := Color("27508F")
## 白色胶囊上的字：深蓝，不描边
const INK := Color("1A2F6B")

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


## 可拉伸的部件：glass、chip、slot、fill、panel、row、card、card_gold、shelf、tab_on、fade
static func piece(name: String) -> Patch:
	return Patch.new().setup(name)


## 固定形状的部件（徽章、圆点、加号、齿轮键），边长是可见部分的尺寸，不含投影
static func badge(name: String, side: float) -> Patch:
	var p := piece(name)
	p.size = Vector2(side, side)
	p.pivot_offset = p.size / 2.0
	return p


## 游戏字：白字 + 细的深蓝描边 + 轻投影
static func label(text: String, font_size: int, color: Color = Color.WHITE) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", Color(NAVY, 0.9))
	l.add_theme_constant_override("outline_size", maxi(5, font_size / 5))
	l.add_theme_color_override("font_shadow_color", Color(0.02, 0.1, 0.3, 0.4))
	l.add_theme_constant_override("shadow_offset_x", 0)
	l.add_theme_constant_override("shadow_offset_y", maxi(2, font_size / 14))
	l.add_theme_constant_override("shadow_outline_size", maxi(5, font_size / 5))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


## 圆角图片：直接放在背景上，没有边框。radius 是设计像素
static func rounded_picture(path: String, area: Vector2, radius: float) -> TextureRect:
	var pic := TextureRect.new()
	pic.texture = tex(path)
	pic.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	pic.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	pic.size = area
	var shader := Shader.new()
	shader.code = """
shader_type canvas_item;
uniform vec2 area;
uniform float radius;
void fragment() {
	vec2 p = (UV - 0.5) * area;
	vec2 q = abs(p) - (area * 0.5 - vec2(radius));
	float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
	COLOR.a *= clamp(0.5 - d, 0.0, 1.0);
}
"""
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("area", area)
	mat.set_shader_parameter("radius", radius)
	pic.material = mat
	return pic


## 浅色面板上的深色字，不描边
static func text(content: String, font_size: int, color: Color = BODY) -> Label:
	var l := label(content, font_size, color)
	l.add_theme_constant_override("outline_size", 0)
	l.add_theme_constant_override("shadow_outline_size", 0)
	l.add_theme_color_override("font_shadow_color", Color.TRANSPARENT)
	return l


## 顶部托底：一层从深蓝渐到透明的淡渐变，让悬浮在最上面的控件在任何背景上都看得清，自己不成为一条栏
static func top_scrim(width: float, height: float, strength: float = 0.5) -> TextureRect:
	var fade := Gradient.new()
	fade.colors = PackedColorArray([Color(NAVY, strength), Color(NAVY, 0.0)])
	var grad := GradientTexture2D.new()
	grad.gradient = fade
	grad.fill_from = Vector2(0, 0)
	grad.fill_to = Vector2(0, 1)
	grad.width = 8
	grad.height = 64
	var scrim := TextureRect.new()
	scrim.texture = grad
	scrim.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	scrim.stretch_mode = TextureRect.STRETCH_SCALE
	scrim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	scrim.size = Vector2(width, height)
	return scrim


## 数字胶囊：深色凹槽 + 左侧图标 + 数字，三者垂直居中。返回 { box, label }
static func capsule(icon_path: String, width: float, height: float = 56.0) -> Dictionary:
	var box := Control.new()
	box.size = Vector2(width, height)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var chip := piece("track")
	chip.size = box.size
	box.add_child(chip)
	# 图标比胶囊略大，压在左端外沿
	var side: float = height + 6.0
	var pic := icon(icon_path, side)
	pic.position = Vector2(-6, -3)
	box.add_child(pic)
	var num := label("0", int(height * 0.52))
	num.position = Vector2(side - 4, 0)
	num.size = Vector2(width - side - 8, height)
	box.add_child(num)
	return {"box": box, "label": num}


static func _button_piece(color: Color) -> String:
	if color == GREEN:
		return "btn_green"
	if color == ORANGE or color == GOLD:
		return "btn_orange"
	if color == PURPLE:
		return "btn_purple"
	if color == RED:
		return "btn_red"
	return "btn_blue"


## 按钮。color 取 BLUE / GREEN / ORANGE / PURPLE / RED
static func button(caption: String, color: Color, font_size: int = 34) -> KitButton:
	var b := KitButton.new()
	b.text = caption
	b.face.setup(_button_piece(color))
	b.add_theme_font_size_override("font_size", font_size)
	for state: String in [
		"font_color", "font_hover_color", "font_pressed_color", "font_focus_color"
	]:
		b.add_theme_color_override(state, Color.WHITE)
	b.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0.8))
	b.add_theme_color_override("font_outline_color", Color(NAVY, 0.75))
	b.add_theme_constant_override("outline_size", maxi(5, font_size / 5))
	return b


## 方形图标键（道具键）
static func tile_button() -> KitButton:
	var b := button("", BLUE)
	b.face.setup("tile")
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
