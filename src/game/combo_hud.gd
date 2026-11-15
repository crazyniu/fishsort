class_name ComboHud
extends Control
## 连击显示：小，放在顶栏正中，不挡场地：「×N 连击」和这串连击累计的金币排成一行。
## 每次命中数字弹一下、音高上行；升档换主色并在场地上沿闪一下夸奖词；6 连以上屏幕边缘发光。
## 所有文字摆正。

## 每档的 [数字填充色, 描边色, 光晕色]：蓝 → 金 → 红 → 紫
const TIERS: Array = [
	[Color("FFFFFF"), Color("1565FF"), Color("3DB8FF")],
	[Color("FFF36B"), Color("E86A00"), Color("FFC21A")],
	[Color("FFE85C"), Color("E0144A"), Color("FF4D6D")],
	[Color("FFFFFF"), Color("A316FF"), Color("F24DFF")],
]
## 五声音阶的半音数：连击越高音越高
const SCALE: Array[int] = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
const BOX_W := 340.0

var _count: Control
var _num: Label
var _word: Label
var _bar: ColorRect
var _coin_row: HBoxContainer
var _coin_num: Label
var _praise: Label
var _edge: Control
var _bar_tween: Tween
var _fade: Tween
var _edge_tween: Tween
var _coins: int = 0
var _width: float


## pos、area：场地上沿的一条区域（夸奖词用）
func _init(stage: Control, pos: Vector2, area: Vector2) -> void:
	_width = area.x
	position = Vector2.ZERO
	size = stage.size
	z_index = 70
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	# 顶栏正中（进度和关卡号两个胶囊之间）一行：×N 连击 + 金币 +N，下面一条倒计时细条
	_count = Control.new()
	_count.position = Vector2((_width - BOX_W) / 2.0, 4)
	_count.size = Vector2(BOX_W, 74)
	_count.pivot_offset = _count.size / 2.0
	_count.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_count)
	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 6)
	row.size = Vector2(BOX_W, 62)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_count.add_child(row)
	_num = UiKit.label("", 50)
	_num.custom_minimum_size = Vector2(84, 62)
	_num.pivot_offset = Vector2(42, 31)
	row.add_child(_num)
	_word = UiKit.label(tr("UI_COMBO_WORD"), 28)
	row.add_child(_word)
	_coin_row = HBoxContainer.new()
	_coin_row.add_theme_constant_override("separation", 4)
	_coin_row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	row.add_child(_coin_row)
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(10, 0)
	_coin_row.add_child(gap)
	var coin := UiKit.icon("res://assets/ui/coin.png", 38)
	coin.custom_minimum_size = Vector2(38, 38)
	coin.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	_coin_row.add_child(coin)
	_coin_num = UiKit.label("", 30, UiKit.GOLD)
	_coin_row.add_child(_coin_num)
	_bar = ColorRect.new()
	_bar.position = Vector2((BOX_W - 180.0) / 2.0, 66)
	_bar.size = Vector2(180, 5)
	_bar.pivot_offset = Vector2(90, 0)
	_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_count.add_child(_bar)
	# 夸奖词：升档时在场地上沿闪一下
	_praise = _text(self, "", 46, Vector2(0, pos.y - 46.0), Vector2(_width, 64))
	_praise.modulate.a = 0.0
	_edge = UiKit.piece("fx_edge")
	_edge.size = stage.size
	_edge.z_index = 68
	_edge.modulate.a = 0.0
	_edge.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stage.add_child(_edge)
	stage.add_child(self)
	_count.modulate.a = 0.0
	_coin_row.visible = false


func _text(parent: Control, content: String, font: int, at: Vector2, area: Vector2) -> Label:
	var l := UiKit.label(content, font)
	l.position = at
	l.size = area
	l.pivot_offset = area / 2.0
	parent.add_child(l)
	return l


## n 连击；tier 是档位下标；tier_up 时闪夸奖词 praise；window 是断连前的时长；
## coins 是这一串连击累计拿到的金币
func hit(n: int, tier: int, tier_up: bool, praise: String, window: float, coins: int) -> void:
	var c: Array = TIERS[mini(tier, TIERS.size() - 1)]
	if _fade != null:
		_fade.kill()
	_count.modulate.a = 1.0
	_num.text = "×%d" % n
	_num.add_theme_color_override("font_color", c[0])
	_num.add_theme_color_override("font_outline_color", c[1])
	_word.add_theme_color_override("font_outline_color", c[1])
	_bar.color = c[2]
	# 数字弹一下：越高弹得越大
	_num.scale = Vector2.ONE * minf(1.5 + n * 0.02, 1.9)
	(
		_num
		. create_tween()
		. tween_property(_num, "scale", Vector2.ONE, 0.22)
		. set_trans(Tween.TRANS_BACK)
		. set_ease(Tween.EASE_OUT)
	)
	var semis: int = SCALE[mini(maxi(n - 3, 0), SCALE.size() - 1)]
	Audio.sfx(&"combo", 0.8 * pow(2.0, semis / 12.0))
	_show_coins(coins)
	if tier_up:
		_tier_up(praise, c, tier)
	if tier >= 1:
		_fever(c[2], tier)
	# 倒计时条走完就断连
	if _bar_tween != null:
		_bar_tween.kill()
	_bar.scale.x = 1.0
	_bar_tween = create_tween()
	_bar_tween.tween_property(_bar, "scale:x", 0.0, window)
	_bar_tween.tween_callback(_leave)


func _show_coins(coins: int) -> void:
	if coins <= 0:
		return
	_coin_row.visible = true
	var from: int = _coins
	_coins = coins
	var tw: Tween = _coin_num.create_tween()
	tw.tween_method(
		func(v: float) -> void: _coin_num.text = "+%d" % int(round(v)),
		float(from),
		float(coins),
		0.2
	)
	Anim.bounce(_coin_num, 1.2, 0.2)


## 升档：夸奖词闪一下 + 号角声
func _tier_up(praise: String, c: Array, tier: int) -> void:
	Audio.sfx(&"tier", 1.0 + tier * 0.06)
	_praise.text = praise
	_praise.add_theme_color_override("font_color", c[0])
	_praise.add_theme_color_override("font_outline_color", c[1])
	_praise.modulate.a = 1.0
	_praise.scale = Vector2(0.4, 0.4)
	var tw: Tween = _praise.create_tween()
	tw.tween_property(_praise, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)
	tw.tween_interval(0.7)
	tw.tween_property(_praise, "modulate:a", 0.0, 0.25)


## 狂热：屏幕边缘发光并缓慢呼吸，直到断连
func _fever(glow: Color, tier: int) -> void:
	if _edge_tween != null:
		_edge_tween.kill()
	_edge.modulate = Color(glow, _edge.modulate.a)
	var top: float = minf(0.3 + tier * 0.12, 0.7)
	_edge_tween = _edge.create_tween().set_loops()
	_edge_tween.tween_property(_edge, "modulate:a", top, 0.35)
	_edge_tween.tween_property(_edge, "modulate:a", top * 0.55, 0.35)


## 连击送图鉴：礼物从金币旁弹出再淡出
func gift() -> void:
	var box := UiKit.icon("res://assets/ui/gift.png", 84)
	box.position = Vector2((_width + BOX_W) / 2.0 - 30.0, 70)
	box.pivot_offset = Vector2(42, 42)
	add_child(box)
	Anim.pop_in(box, 0.0, 0.3)
	Audio.sfx(&"card")
	var tw: Tween = box.create_tween()
	tw.tween_interval(1.3)
	tw.tween_property(box, "modulate:a", 0.0, 0.3)
	tw.tween_callback(box.queue_free)


func _leave() -> void:
	# 断连：整条淡出（金币在结算里入账）
	if _coins > 0:
		Audio.sfx(&"coins")
	_coins = 0
	if _edge_tween != null:
		_edge_tween.kill()
	_edge.create_tween().tween_property(_edge, "modulate:a", 0.0, 0.3)
	_fade = create_tween()
	_fade.tween_property(_count, "modulate:a", 0.0, 0.25)
	_fade.tween_callback(func() -> void: _coin_row.visible = false)


func _exit_tree() -> void:
	if is_instance_valid(_edge):
		_edge.queue_free()
