class_name UiKit
extends RefCounted
## 界面部件工厂。风格见 docs/03-美术规范.md 第 2 节：
## 界面里不出现纯色平涂的圆角块，按钮、面板、横栏、徽章、卡片全部用 assets/kit 的贴图。

const BLUE := Color("2F8FF0")
const NAVY := Color("0B2E6B")
const AQUA := Color("1CC8C8")
const GREEN := Color("58D332")
const ORANGE := Color("FF9B21")
const PURPLE := Color("8E5BD9")
const RED := Color("F0503C")
const GOLD := Color("FFC93C")
const PALE := Color("F4FBFF")

static var _cache: Dictionary = {}


static func tex(path: String) -> Texture2D:
	if not _cache.has(path):
		_cache[path] = load(path) if ResourceLoader.exists(path) else null
	return _cache[path]


static func kit(name: String) -> Texture2D:
	return tex("res://assets/kit/%s.png" % name)


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


## assets/kit 里的方形小部件（徽章、圆点、方块键）
static func pic(name: String, side: float) -> TextureRect:
	return icon("res://assets/kit/%s.png" % name, side)


## 横向三段拉伸的部件：bar、track、fill、row、shelf、btn_*
static func slice3(name: String, cap: float = -1.0) -> Slice3:
	var s := Slice3.new()
	s.texture = kit(name)
	s.cap = cap
	return s


## 九宫格拉伸的部件：panel、card、card_gold
static func nine(name: String, margin: int) -> NinePatchRect:
	var n := NinePatchRect.new()
	n.texture = kit(name)
	n.patch_margin_left = margin
	n.patch_margin_right = margin
	n.patch_margin_top = margin
	n.patch_margin_bottom = margin
	n.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return n


## 整张拉伸的部件：接近方形的小卡片、页签高亮（九宫格在小尺寸下会露出接缝）
static func stretch(name: String) -> TextureRect:
	var t := TextureRect.new()
	t.texture = kit(name)
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_SCALE
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t


## 资源胶囊：深色胶囊底 + 左侧压边的图标 + 数字。返回 { box, label }
static func capsule(icon_path: String, width: float) -> Dictionary:
	var box := Control.new()
	box.size = Vector2(width, 52)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var track := slice3("track")
	track.position = Vector2(18, 4)
	track.size = Vector2(width - 18, 46)
	box.add_child(track)
	var badge_icon := icon(icon_path, 60)
	badge_icon.position = Vector2(-6, -4)
	box.add_child(badge_icon)
	var num := label("0", 28)
	num.position = Vector2(50, 2)
	num.size = Vector2(width - 62, 46)
	box.add_child(num)
	return {"box": box, "label": num}


## 白字 + 深蓝厚描边 + 下方投影的游戏字
static func label(text: String, font_size: int, color: Color = Color.WHITE) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", font_size)
	l.add_theme_color_override("font_color", color)
	l.add_theme_color_override("font_outline_color", NAVY)
	l.add_theme_constant_override("outline_size", maxi(6, font_size / 4))
	l.add_theme_color_override("font_shadow_color", Color(0.02, 0.1, 0.3, 0.55))
	l.add_theme_constant_override("shadow_offset_x", 0)
	l.add_theme_constant_override("shadow_offset_y", maxi(2, font_size / 10))
	l.add_theme_constant_override("shadow_outline_size", maxi(6, font_size / 4))
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l


## 浅色面板上的深色正文，不描边
static func text(content: String, font_size: int) -> Label:
	var l := label(content, font_size, NAVY)
	l.add_theme_constant_override("outline_size", 0)
	l.add_theme_constant_override("shadow_outline_size", 0)
	l.add_theme_color_override("font_shadow_color", Color.TRANSPARENT)
	return l


## 半透明纯色底，只用于压暗区域（遮罩、底栏衬底），不用来做部件
static func shade(color: Color) -> ColorRect:
	var r := ColorRect.new()
	r.color = color
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return r


static func _button_tex(color: Color) -> String:
	if color == GREEN:
		return "btn_green"
	if color == ORANGE or color == GOLD:
		return "btn_orange"
	if color == PURPLE:
		return "btn_purple"
	if color == RED:
		return "btn_red"
	return "btn_blue"


## 立体果冻按钮。color 取 BLUE / GREEN / ORANGE / PURPLE / RED
static func button(caption: String, color: Color, font_size: int = 34) -> KitButton:
	var b := KitButton.new()
	b.text = caption
	b.face.texture = kit(_button_tex(color))
	b.add_theme_font_size_override("font_size", font_size)
	for state: String in [
		"font_color", "font_hover_color", "font_pressed_color", "font_focus_color"
	]:
		b.add_theme_color_override(state, Color.WHITE)
	b.add_theme_color_override("font_disabled_color", Color(1, 1, 1, 0.75))
	b.add_theme_color_override("font_outline_color", NAVY)
	b.add_theme_constant_override("outline_size", maxi(6, font_size / 4))
	return b


## 方形果冻键（道具键）
static func tile_button() -> KitButton:
	var b := button("", BLUE)
	b.face.texture = kit("tile")
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
