class_name ComboHud
extends Control
## 连击提示：一块常驻的「大数字 + 连击」牌子，每次命中就猛砸一下，
## 背后有旋转的光芒，下方一条计时槽走完就收起。夸奖词在数字上方弹出。

const STAR := "res://assets/ui/star.png"
const RAYS := 14

var _rays: Node2D
var _num: Label
var _word: Label
var _praise: Label
var _bar: Panel
var _bar_fill: ColorRect
var _bar_tween: Tween
var _fade: Tween
var _stage_ref: Control
var _shown: bool = false


func _init(stage: Control, pos: Vector2, area: Vector2) -> void:
	_stage_ref = stage
	position = pos
	size = area
	pivot_offset = area / 2.0
	z_index = 70
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	modulate.a = 0.0
	var c: Vector2 = area / 2.0 + Vector2(0, 10)
	_rays = Node2D.new()
	_rays.position = c
	for i: int in RAYS:
		var p := Polygon2D.new()
		var a: float = TAU * i / RAYS
		var w: float = TAU / RAYS * 0.28
		p.polygon = PackedVector2Array(
			[Vector2.ZERO, Vector2.from_angle(a - w) * 210.0, Vector2.from_angle(a + w) * 210.0]
		)
		p.color = Color(1, 0.9, 0.5, 0.14)
		_rays.add_child(p)
	add_child(_rays)
	_praise = UiKit.label("", 60)
	_praise.position = Vector2(0, -52)
	_praise.size = Vector2(area.x, 80)
	_praise.pivot_offset = _praise.size / 2.0
	add_child(_praise)
	_num = UiKit.label("0", 130)
	_num.position = Vector2(0, 8)
	_num.size = Vector2(area.x, 150)
	_num.pivot_offset = _num.size / 2.0
	add_child(_num)
	_word = UiKit.label(tr("UI_COMBO_WORD"), 40)
	_word.position = Vector2(0, 150)
	_word.size = Vector2(area.x, 56)
	_word.pivot_offset = _word.size / 2.0
	add_child(_word)
	_bar = Panel.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(UiKit.NAVY, 0.55)
	sb.set_corner_radius_all(7)
	_bar.add_theme_stylebox_override("panel", sb)
	_bar.size = Vector2(240, 14)
	_bar.position = Vector2((area.x - 240) / 2.0, 214)
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_bar)
	_bar_fill = ColorRect.new()
	_bar_fill.position = Vector2(3, 3)
	_bar_fill.size = Vector2(234, 8)
	_bar_fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_bar.add_child(_bar_fill)
	stage.add_child(self)


func _tint(label: Label, col: Color, outline: Color) -> void:
	label.add_theme_color_override("font_color", col)
	label.add_theme_color_override("font_outline_color", outline)
	label.add_theme_constant_override(
		"outline_size", maxi(8, label.get_theme_font_size("font_size") / 6)
	)


## n 连击；heat 0~1 越高越热；praise 非空时弹夸奖词；window 是计时槽时长
func hit(n: int, heat: float, praise: String, window: float) -> void:
	var col: Color = Color("FFE066").lerp(Color("FF8A3D"), heat)
	var edge: Color = Color("7A2B00").lerp(Color("8E0F2B"), heat)
	_num.text = str(n)
	_num.add_theme_font_size_override("font_size", int(lerpf(120, 168, heat)))
	_tint(_num, col, edge)
	_tint(_word, Color.WHITE, edge)
	_bar_fill.color = col
	if _fade != null:
		_fade.kill()
	modulate.a = 1.0
	if not _shown:
		_shown = true
		scale = Vector2(0.6, 0.6)
	# 数字猛地砸下来：先放大、再弹回，带一点歪斜
	_num.scale = Vector2(2.1, 2.1)
	_num.rotation = randf_range(-0.16, 0.16)
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_num, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)
	tw.tween_property(_num, "rotation", 0.0, 0.3).set_trans(Tween.TRANS_ELASTIC)
	tw.tween_property(self, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)
	_word.scale = Vector2(1.3, 1.3)
	tw.tween_property(_word, "scale", Vector2.ONE, 0.25).set_trans(Tween.TRANS_BACK)
	# 光芒随命中一闪并加速旋转
	_rays.scale = Vector2(0.5, 0.5)
	_rays.modulate.a = 1.0
	(
		tw
		. tween_property(_rays, "scale", Vector2(1.0 + heat * 0.4, 1.0 + heat * 0.4), 0.35)
		. set_trans(Tween.TRANS_QUAD)
		. set_ease(Tween.EASE_OUT)
	)
	_rays.rotation += 0.25
	var center: Vector2 = position + Vector2(size.x / 2.0, 80)
	Anim.burst(_stage_ref, center, 5 + int(heat * 7), STAR, 330.0, 700.0, Vector2(18, 30), 0.55, 69)
	if praise != "":
		_praise.text = praise
		_tint(_praise, Color.WHITE, Color("D6336C").lerp(Color("6C2BD9"), heat))
		_praise.modulate.a = 1.0
		_praise.scale = Vector2(2.4, 2.4)
		var pt: Tween = create_tween().set_parallel()
		pt.tween_property(_praise, "scale", Vector2.ONE, 0.35).set_trans(Tween.TRANS_BACK).set_ease(
			Tween.EASE_OUT
		)
		Anim.burst(_stage_ref, center, 16, STAR, 560.0, 900.0, Vector2(26, 44), 0.8, 69)
		Anim.shake(self, 14.0)
		Audio.sfx(&"star")
	# 计时槽：每次命中回满，然后匀速走空；走空就收起
	if _bar_tween != null:
		_bar_tween.kill()
	_bar_fill.size.x = 234.0
	_bar_tween = create_tween()
	_bar_tween.tween_property(_bar_fill, "size:x", 0.0, window)
	_bar_tween.tween_callback(_leave)


func _leave() -> void:
	_shown = false
	_praise.text = ""
	_fade = create_tween().set_parallel()
	_fade.tween_property(self, "modulate:a", 0.0, 0.25)
	_fade.tween_property(self, "scale", Vector2(0.8, 0.8), 0.25)


func _process(delta: float) -> void:
	_rays.rotation += delta * (0.5 + _num.scale.x)
