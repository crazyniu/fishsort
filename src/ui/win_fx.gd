class_name WinFx
extends Control
## 过关演出：白闪 → 旋转光芒 → 大字砸下 → 三颗星依次亮起 → 两侧彩纸炮 → 金币喷涌。
## 整段约 1.8 秒，结束后由调用方弹出结算弹窗。

const COLORS: Array[Color] = [
	Color("FFC93C"),
	Color("4CC42E"),
	Color("2F8FF0"),
	Color("F0503C"),
	Color("A274E6"),
	Color("FFFFFF")
]
const GRAVITY := 1500.0

var _bits: Array[Dictionary] = []
var _spin: float = 0.0
var _rays: float = 0.0
var _center: Vector2


static func play(host: Control, title: String, coin_target: Vector2) -> WinFx:
	var fx := WinFx.new()
	fx.size = host.size
	fx.z_index = 95
	fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.add_child(fx)
	fx._run(title, coin_target)
	return fx


func _run(title: String, coin_target: Vector2) -> void:
	_center = Vector2(size.x / 2.0, size.y * 0.36)
	Audio.sfx(&"whoosh")
	Audio.sfx(&"win")
	# 白闪
	var flash := ColorRect.new()
	flash.color = Color(1, 1, 1, 0.75)
	flash.size = size
	flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(flash)
	Anim.fade_out_free(flash, 0.3)
	# 光芒展开
	create_tween().tween_property(self, "_rays", 1.0, 0.45).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)
	# 大字从 3 倍砸到原大，再回弹
	var word := UiKit.label(title, 132, UiKit.GOLD)
	word.size = Vector2(size.x, 190)
	word.position = Vector2(0, _center.y - 95)
	word.pivot_offset = word.size / 2.0
	word.scale = Vector2(3.2, 3.2)
	word.modulate.a = 0.0
	add_child(word)
	var tw: Tween = word.create_tween()
	tw.set_parallel()
	tw.tween_property(word, "scale", Vector2.ONE, 0.32).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)
	tw.tween_property(word, "modulate:a", 1.0, 0.12)
	tw.chain().tween_callback(func() -> void: Anim.pulse(word, 1.06, 0.7))
	# 砸下的瞬间两侧开炮
	get_tree().create_timer(0.22).timeout.connect(
		func() -> void:
			_cannon(Vector2(-20, size.y * 0.78), Vector2(520, -1250), 80)
			_cannon(Vector2(size.x + 20, size.y * 0.78), Vector2(-520, -1250), 80)
	)
	get_tree().create_timer(0.75).timeout.connect(
		func() -> void: _cannon(_center, Vector2(0, -700), 70, 620.0)
	)
	# 三颗星依次亮起
	for i: int in 3:
		var star := UiKit.icon("res://assets/ui/star.png", 120 if i == 1 else 96)
		star.position = Vector2(
			size.x / 2.0 + (i - 1) * 150 - star.size.x / 2.0,
			_center.y - 190 - (36 if i == 1 else 0)
		)
		star.scale = Vector2.ZERO
		star.rotation = -0.6
		add_child(star)
		var st: Tween = star.create_tween()
		st.tween_interval(0.45 + i * 0.16)
		st.tween_callback(Audio.sfx.bind(&"star", 1.0 + i * 0.12))
		st.set_parallel()
		st.tween_property(star, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_BACK).set_ease(
			Tween.EASE_OUT
		)
		st.tween_property(star, "rotation", 0.0, 0.3)
	# 金币从中间喷出，再飞进金币栏
	for i: int in 14:
		var coin := UiKit.icon("res://assets/ui/coin.png", 54)
		coin.position = _center - Vector2(27, 27)
		coin.scale = Vector2.ZERO
		add_child(coin)
		var spread: Vector2 = (
			_center
			+ Vector2.from_angle(TAU * i / 14.0 + randf() * 0.4) * randf_range(120, 240)
			- Vector2(27, 27)
		)
		var ct: Tween = coin.create_tween()
		ct.tween_interval(0.55 + i * 0.02)
		ct.set_parallel()
		ct.tween_property(coin, "scale", Vector2.ONE, 0.18)
		ct.tween_property(coin, "position", spread, 0.3).set_trans(Tween.TRANS_QUAD).set_ease(
			Tween.EASE_OUT
		)
		ct.chain().tween_interval(0.12 + i * 0.02)
		(
			ct
			. chain()
			. tween_property(coin, "position", coin_target - Vector2(27, 27), 0.38)
			. set_trans(Tween.TRANS_QUAD)
			. set_ease(Tween.EASE_IN)
		)
		ct.chain().tween_callback(Audio.sfx.bind(&"coin", 1.0 + i * 0.03))
		ct.chain().tween_callback(coin.queue_free)


## 朝 velocity 方向喷一批彩纸，spread 是速度的随机幅度
func _cannon(from: Vector2, velocity: Vector2, count: int, spread: float = 420.0) -> void:
	for i: int in count:
		(
			_bits
			. append(
				{
					"p": from,
					"v":
					(
						velocity * randf_range(0.55, 1.15)
						+ Vector2(randf_range(-spread, spread), randf_range(-spread, spread) * 0.6)
					),
					"r": randf() * TAU,
					"vr": randf_range(-9.0, 9.0),
					"c": COLORS[i % COLORS.size()],
					"s": Vector2(randf_range(10, 20), randf_range(16, 30)),
					"life": randf_range(1.8, 3.0),
				}
			)
		)


func _process(delta: float) -> void:
	_spin += delta * 0.5
	for b: Dictionary in _bits:
		# 空气阻力让彩纸先冲后飘
		b["v"] = (b["v"] as Vector2) * (1.0 - 1.6 * delta) + Vector2(0, GRAVITY * 0.45) * delta
		b["p"] = (b["p"] as Vector2) + (b["v"] as Vector2) * delta
		b["r"] = float(b["r"]) + float(b["vr"]) * delta
		b["life"] = float(b["life"]) - delta
	_bits = _bits.filter(
		func(b: Dictionary) -> bool:
			return float(b["life"]) > 0.0 and (b["p"] as Vector2).y < size.y + 60
	)
	queue_redraw()


func _draw() -> void:
	# 旋转光芒：从中心向外渐隐的扇形
	if _rays > 0.0:
		var reach: float = maxf(size.x, size.y) * 0.75 * _rays
		for i: int in 12:
			var a: float = _spin + TAU * i / 12.0
			var pts := PackedVector2Array(
				[
					_center,
					_center + Vector2.from_angle(a - 0.13) * reach,
					_center + Vector2.from_angle(a + 0.13) * reach
				]
			)
			var cols := PackedColorArray(
				[
					Color(1, 0.95, 0.6, 0.55 * _rays),
					Color(1, 0.9, 0.4, 0.0),
					Color(1, 0.9, 0.4, 0.0)
				]
			)
			draw_polygon(pts, cols)
	for b: Dictionary in _bits:
		var s: Vector2 = b["s"]
		# 用横向缩放模拟纸片翻转
		draw_set_transform(b["p"], b["r"], Vector2(cos(float(b["r"]) * 2.0), 1.0))
		draw_rect(Rect2(-s / 2.0, s), Color(b["c"], minf(1.0, float(b["life"]) * 2.0)))
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
