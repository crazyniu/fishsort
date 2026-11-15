class_name WinFx
extends Control
## 过关演出：白闪 → 旋转光芒 → 两侧彩纸炮 + 三发烟花 → 金币喷涌。
## 只有 1 秒多，随后调用方直接给出结算页（标题、星星、图鉴、奖励都在那一页）。

const COLORS: Array[Color] = [
	Color("FFD23A"),
	Color("FF4D6D"),
	Color("3DDCFF"),
	Color("7CFF6B"),
	Color("C06BFF"),
	Color("FFFFFF")
]
const GRAVITY := 1500.0

var _bits: Array[Dictionary] = []
var _spin: float = 0.0
var _rays: float = 0.0
var _center: Vector2


static func play(host: Control, coin_target: Vector2) -> WinFx:
	var fx := WinFx.new()
	fx.size = host.size
	fx.z_index = 95
	fx.mouse_filter = Control.MOUSE_FILTER_IGNORE
	host.add_child(fx)
	fx._run(coin_target)
	return fx


func _run(coin_target: Vector2) -> void:
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
	# 两侧彩纸炮 + 三发烟花，标题和星星交给随后的结算页
	_cannon(Vector2(-20, size.y * 0.78), Vector2(560, -1300), 90)
	_cannon(Vector2(size.x + 20, size.y * 0.78), Vector2(-560, -1300), 90)
	var spots: Array[Vector2] = [Vector2(0.28, 0.3), Vector2(0.74, 0.24), Vector2(0.5, 0.42)]
	for i: int in spots.size():
		get_tree().create_timer(0.08 + i * 0.22).timeout.connect(
			_firework.bind(spots[i] * size, COLORS[i * 2 % COLORS.size()], 1.0 + i * 0.1)
		)
	# 金币从中间喷出，再飞进金币栏
	Audio.sfx(&"coins")
	for i: int in 20:
		var coin := UiKit.icon("res://assets/ui/coin.png", 54)
		coin.position = _center - Vector2(27, 27)
		coin.scale = Vector2.ZERO
		add_child(coin)
		var spread: Vector2 = (
			_center
			+ Vector2.from_angle(TAU * i / 20.0 + randf() * 0.4) * randf_range(120, 240)
			- Vector2(27, 27)
		)
		var ct: Tween = coin.create_tween()
		ct.tween_interval(0.2 + i * 0.015)
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
		ct.chain().tween_callback(coin.queue_free)


## 一发烟花：亮光一闪、光环扩散、一圈同色火星炸开
func _firework(at: Vector2, color: Color, pitch: float) -> void:
	Audio.sfx(&"firework", pitch)
	var glow := UiKit.badge("fx_glow", 520)
	glow.position = at - Vector2(260, 260)
	glow.modulate = color.lightened(0.3)
	add_child(glow)
	Anim.fade_out_free(glow, 0.5)
	var ring := UiKit.badge("fx_ring", 240)
	ring.position = at - Vector2(120, 120)
	ring.modulate = color
	ring.scale = Vector2(0.2, 0.2)
	add_child(ring)
	var tw: Tween = ring.create_tween().set_parallel()
	tw.tween_property(ring, "scale", Vector2(2.6, 2.6), 0.5).set_ease(Tween.EASE_OUT)
	tw.tween_property(ring, "modulate:a", 0.0, 0.5)
	tw.chain().tween_callback(ring.queue_free)
	for i: int in 44:
		var a: float = TAU * i / 44.0 + randf() * 0.1
		(
			_bits
			. append(
				{
					"p": at,
					"v": Vector2.from_angle(a) * randf_range(420, 900),
					"r": a,
					"vr": 0.0,
					"c": color if i % 3 else Color.WHITE,
					"s": Vector2(22, 7),
					"life": randf_range(0.7, 1.2),
				}
			)
		)


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
