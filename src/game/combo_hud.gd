class_name ComboHud
extends Control
## 连击演出：大数字每次命中砸下来，光环扩散、彩色火花四溅；
## 每升一档换一种主色并弹出夸奖横幅，6 连以上全屏边缘持续发光（狂热）。

## 每档的 [数字填充色, 描边色, 光晕色]：蓝 → 金 → 红 → 紫
const TIERS: Array = [
	[Color("FFFFFF"), Color("1565FF"), Color("3DB8FF")],
	[Color("FFF36B"), Color("E86A00"), Color("FFC21A")],
	[Color("FFE85C"), Color("E0144A"), Color("FF4D6D")],
	[Color("FFFFFF"), Color("A316FF"), Color("F24DFF")],
]
## 五声音阶的半音数：连击越高音越高
const SCALE: Array[int] = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]

var _glow: Control
var _depth: Label
var _num: Label
var _word: Label
var _praise: Label
var _bar: ColorRect
var _edge: Control
var _bar_tween: Tween
var _fade: Tween
var _edge_tween: Tween
var _stage: Control
var _mid: Vector2
var _shown: bool = false


func _init(stage: Control, pos: Vector2, area: Vector2) -> void:
	_stage = stage
	position = pos
	size = area
	pivot_offset = area / 2.0
	rotation = -0.06
	z_index = 70
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	modulate.a = 0.0
	_mid = Vector2(area.x / 2.0, 104)
	_glow = UiKit.badge("fx_glow", 420)
	_glow.position = _mid - Vector2(210, 210)
	add_child(_glow)
	_depth = _big("0", 150, Vector2(0, 20))
	_num = _big("0", 150, Vector2(0, 12))
	_word = _big(tr("UI_COMBO_WORD"), 44, Vector2(0, 168))
	_word.size.y = 60
	_word.pivot_offset = _word.size / 2.0
	_praise = _big("", 76, Vector2(0, -78))
	_praise.size.y = 96
	_praise.pivot_offset = _praise.size / 2.0
	_bar = ColorRect.new()
	_bar.size = Vector2(220, 8)
	_bar.position = Vector2((area.x - 220) / 2.0, 232)
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_bar)
	stage.add_child(self)
	# 全屏边缘光放在舞台上，盖住整个画面
	_edge = UiKit.piece("fx_edge")
	_edge.size = Vector2(stage.size.x + 800, stage.size.y)
	_edge.position = Vector2(-400, 0)
	_edge.z_index = 68
	_edge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_edge.modulate.a = 0.0
	stage.add_child(_edge)


func _big(text: String, font: int, pos: Vector2) -> Label:
	var l := UiKit.label(text, font)
	l.position = pos
	l.size = Vector2(size.x, 180)
	l.pivot_offset = l.size / 2.0
	add_child(l)
	return l


func _paint(l: Label, fill: Color, edge: Color, width: int) -> void:
	l.add_theme_color_override("font_color", fill)
	l.add_theme_color_override("font_outline_color", edge)
	l.add_theme_constant_override("outline_size", width)
	l.add_theme_color_override("font_shadow_color", Color(edge.darkened(0.6), 0.6))


## n 连击；tier 是档位下标；tier_up 时弹夸奖词 praise；window 是断连前的时长
func hit(n: int, tier: int, tier_up: bool, praise: String, window: float) -> void:
	var c: Array = TIERS[mini(tier, TIERS.size() - 1)]
	var fill: Color = c[0]
	var edge: Color = c[1]
	var glow: Color = c[2]
	var font: int = mini(150 + n * 3, 200)
	for l: Label in [_num, _depth]:
		l.text = str(n)
		l.add_theme_font_size_override("font_size", font)
	_paint(_num, fill, edge, 26)
	# 下面垫一层深色的同字，做出厚度
	_paint(_depth, edge.darkened(0.5), edge.darkened(0.5), 26)
	_paint(_word, Color.WHITE, edge, 12)
	_bar.color = glow
	_glow.modulate = Color(glow, 0.75)
	if _fade != null:
		_fade.kill()
	modulate.a = 1.0
	if not _shown:
		_shown = true
		scale = Vector2(0.5, 0.5)
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(self, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)
	# 数字从大砸到原位，先压扁再回弹
	for l: Label in [_num, _depth]:
		l.scale = Vector2(2.4, 2.4)
		l.rotation = randf_range(-0.14, 0.14)
		tw.tween_property(l, "scale", Vector2(1.12, 0.86), 0.11).set_ease(Tween.EASE_IN)
		tw.tween_property(l, "rotation", 0.0, 0.2)
		(
			tw
			. tween_property(l, "scale", Vector2.ONE, 0.2)
			. set_delay(0.11)
			. set_trans(Tween.TRANS_ELASTIC)
			. set_ease(Tween.EASE_OUT)
		)
	_word.scale = Vector2(1.35, 1.35)
	tw.tween_property(_word, "scale", Vector2.ONE, 0.22).set_trans(Tween.TRANS_BACK)
	_glow.scale = Vector2(0.55, 0.55)
	tw.tween_property(_glow, "scale", Vector2(1.15, 1.15), 0.3).set_ease(Tween.EASE_OUT)
	tw.tween_property(_glow, "modulate:a", 0.4, 0.5)
	_ring(glow, 1.7 + tier * 0.25)
	_sparks([fill, glow, Color.WHITE, edge.lightened(0.3)], 10 + tier * 5, 240.0 + tier * 50.0)
	var semis: int = SCALE[clampi(n - 3, 0, SCALE.size() - 1)]
	Audio.sfx(&"combo", 0.8 * pow(2.0, semis / 12.0))
	if tier_up:
		_tier_up(praise, edge, glow, tier)
	_fever(glow, tier)
	# 计时条：每次命中回满，走空就断连收起
	if _bar_tween != null:
		_bar_tween.kill()
	_bar.scale.x = 1.0
	_bar.pivot_offset = Vector2(110, 4)
	_bar_tween = create_tween()
	_bar_tween.tween_property(_bar, "scale:x", 0.0, window)
	_bar_tween.tween_callback(_leave)


func _ring(color: Color, reach: float) -> void:
	var ring := UiKit.badge("fx_ring", 260)
	ring.position = _mid - Vector2(130, 130)
	ring.modulate = color
	ring.scale = Vector2(0.3, 0.3)
	add_child(ring)
	move_child(ring, 1)
	var tw: Tween = ring.create_tween().set_parallel()
	(
		tw
		. tween_property(ring, "scale", Vector2(reach, reach), 0.42)
		. set_ease(Tween.EASE_OUT)
		. set_trans(Tween.TRANS_CUBIC)
	)
	tw.tween_property(ring, "modulate:a", 0.0, 0.42).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(ring.queue_free)


## 放射状的彩色光条，外加几颗闪光
func _sparks(colors: Array, count: int, reach: float) -> void:
	for i: int in count:
		var bit := ColorRect.new()
		bit.color = colors[i % colors.size()]
		bit.size = Vector2(randf_range(26, 46), 7)
		bit.pivot_offset = Vector2(0, 3.5)
		var a: float = TAU * i / count + randf_range(-0.2, 0.2)
		bit.rotation = a
		bit.position = _mid + Vector2.from_angle(a) * 70.0
		bit.mouse_filter = Control.MOUSE_FILTER_IGNORE
		add_child(bit)
		var tw: Tween = bit.create_tween().set_parallel()
		var to: Vector2 = _mid + Vector2.from_angle(a) * reach * randf_range(0.7, 1.15)
		tw.tween_property(bit, "position", to, 0.36).set_ease(Tween.EASE_OUT).set_trans(
			Tween.TRANS_CUBIC
		)
		tw.tween_property(bit, "scale", Vector2(0.1, 0.4), 0.36).set_ease(Tween.EASE_IN)
		tw.chain().tween_callback(bit.queue_free)
	for i: int in 4:
		var star := UiKit.badge("fx_spark", randf_range(36, 64))
		star.position = (
			_mid + Vector2(randf_range(-230, 230), randf_range(-110, 110)) - star.size / 2.0
		)
		star.modulate = colors[i % colors.size()]
		star.scale = Vector2.ZERO
		add_child(star)
		var tw: Tween = star.create_tween()
		tw.tween_interval(randf() * 0.15)
		tw.tween_property(star, "scale", Vector2.ONE, 0.12)
		tw.parallel().tween_property(star, "rotation", 0.8, 0.3)
		tw.tween_property(star, "scale", Vector2.ZERO, 0.18)
		tw.tween_callback(star.queue_free)


func _tier_up(praise: String, edge: Color, glow: Color, tier: int) -> void:
	_praise.text = praise
	_paint(_praise, Color.WHITE, edge, 16)
	_praise.modulate.a = 1.0
	_praise.scale = Vector2(3.0, 3.0)
	_praise.position.x = -260.0
	var tw: Tween = create_tween().set_parallel()
	tw.tween_property(_praise, "scale", Vector2.ONE, 0.26).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)
	tw.tween_property(_praise, "position:x", 0.0, 0.2).set_ease(Tween.EASE_OUT)
	tw.chain().tween_interval(0.9)
	tw.chain().tween_property(_praise, "modulate:a", 0.0, 0.25)
	_ring(Color.WHITE, 2.6)
	_sparks([glow, Color.WHITE], 22, 380.0)
	Anim.shake(self, 10.0 + tier * 5.0)
	Audio.sfx(&"tier", 1.0 + tier * 0.06)
	# 全屏闪一下本档的颜色
	var flash := ColorRect.new()
	flash.color = Color(glow, 0.3)
	flash.size = _edge.size
	flash.position = _edge.position
	flash.z_index = 67
	flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_stage.add_child(flash)
	Anim.fade_out_free(flash, 0.3)


## 狂热：第二档起边缘光持续呼吸
func _fever(glow: Color, tier: int) -> void:
	if _edge_tween != null:
		_edge_tween.kill()
	_edge.modulate = Color(glow, _edge.modulate.a)
	if tier < 1:
		_edge.modulate.a = 0.0
		return
	var high: float = minf(0.55 + tier * 0.12, 0.9)
	_edge.modulate.a = high
	_edge_tween = _edge.create_tween().set_loops()
	_edge_tween.tween_property(_edge, "modulate:a", high * 0.5, 0.4)
	_edge_tween.tween_property(_edge, "modulate:a", high, 0.4)


## 连击送图鉴：礼物从数字旁弹出再落下去
func gift() -> void:
	var box := UiKit.icon("res://assets/ui/gift.png", 110)
	box.position = _mid + Vector2(150, -70)
	box.pivot_offset = Vector2(55, 55)
	add_child(box)
	Anim.pop_in(box, 0.0, 0.3)
	var tip := UiKit.label(tr("UI_COMBO_CARD"), 34, UiKit.GOLD)
	tip.size = Vector2(320, 46)
	tip.position = _mid + Vector2(45, 44)
	add_child(tip)
	Anim.pop_in(tip, 0.1, 0.25)
	_sparks([UiKit.GOLD, Color.WHITE], 14, 300.0)
	Audio.sfx(&"card")
	for n: Control in [box, tip]:
		var tw: Tween = n.create_tween()
		tw.tween_interval(1.3)
		tw.tween_property(n, "modulate:a", 0.0, 0.3)
		tw.tween_callback(n.queue_free)


func _leave() -> void:
	_shown = false
	if _edge_tween != null:
		_edge_tween.kill()
	_edge.create_tween().tween_property(_edge, "modulate:a", 0.0, 0.3)
	_fade = create_tween().set_parallel()
	_fade.tween_property(self, "modulate:a", 0.0, 0.25)
	_fade.tween_property(self, "scale", Vector2(0.7, 0.7), 0.25)


func _exit_tree() -> void:
	if is_instance_valid(_edge):
		_edge.queue_free()
