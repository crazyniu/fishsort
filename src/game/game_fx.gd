class_name GameFx
extends RefCounted
## 局内的表现效果：飞行、水花、破泡、满缸、掉落、提示文字。
## 只管「怎么动」，不碰规则；位置和贴图都由 GameScreen 传进来。

const BUBBLE := "res://assets/ui/bubble.png"
const STAR := "res://assets/ui/star.png"
const TINT_SHADER := """
shader_type canvas_item;
uniform float white = 0.0;
uniform float gray = 0.0;
void fragment() {
	vec4 c = COLOR;
	float g = dot(c.rgb, vec3(0.3, 0.59, 0.11));
	c.rgb = mix(c.rgb, vec3(g * 0.8 + 0.1), gray);
	c.rgb = mix(c.rgb, vec3(1.0), white);
	COLOR = c;
}
"""

var stage: Control
var width: float


func _init(stage_node: Control, stage_width: float) -> void:
	stage = stage_node
	width = stage_width


func put(node: Control, pos: Vector2, area: Vector2 = Vector2.ZERO) -> Control:
	node.position = pos
	if area != Vector2.ZERO:
		node.size = area
		node.pivot_offset = area / 2.0
	stage.add_child(node)
	return node


## 鱼先在原地一弹（点击的反馈），等 delay 秒后沿弧线游向目的地，身后拖一条蓝白闪光尾迹；
## 到达时触发回调。side 是出发时的显示边长，time 是飞行时长
func fly(
	tex: Texture2D,
	from: Vector2,
	to: Vector2,
	delay: float,
	on_arrive: Callable,
	side: float = 84.0,
	time: float = -1.0
) -> void:
	var fly_time: float = time if time > 0.0 else GameCfg.num("fly", "seconds")
	var pop: float = GameCfg.num("fly", "tapPop")
	var half := Vector2(side, side) / 2.0
	var f := UiKit.icon("", side)
	f.texture = tex
	f.z_index = 50
	# 鱼的原画朝左，往右游时翻过来
	f.flip_h = to.x > from.x + 20.0
	put(f, from - half, Vector2(side, side))
	var lift: float = clampf(from.distance_to(to) * 0.3, 40.0, 130.0)
	var ctrl: Vector2 = (from + to) / 2.0 + Vector2(0, -lift)
	var big: float = 84.0 / side
	var tail := _tail()
	var last: Array[float] = [0.0]
	var tw: Tween = f.create_tween()
	tw.tween_property(f, "scale", Vector2(1.35, 1.35), pop * 0.45).set_ease(Tween.EASE_OUT)
	tw.tween_property(f, "scale", Vector2(1.15, 0.9), pop * 0.55)
	if delay > 0.0:
		tw.tween_interval(delay)
	(
		tw
		. tween_method(
			func(t: float) -> void:
				var p: Vector2 = from.lerp(ctrl, t).lerp(ctrl.lerp(to, t), t)
				f.position = p - half
				# 飞行中拉长，快到时缩小钻进去
				var grow: float = lerpf(1.0, big, minf(t * 3.0, 1.0))
				f.scale = Vector2(lerpf(1.25, 0.6, t * t), lerpf(0.92, 0.6, t * t)) * grow
				f.rotation = sin(t * PI) * (0.4 if f.flip_h else -0.4)
				_tail_step(tail, p)
				if t - last[0] > 0.1:
					last[0] = t
					_trail_spark(p),
			0.0,
			1.0,
			fly_time
		)
		. set_trans(Tween.TRANS_SINE)
		. set_ease(Tween.EASE_IN_OUT)
	)
	tw.tween_callback(on_arrive)
	tw.tween_callback(Anim.fade_out_free.bind(tail, 0.18))
	tw.tween_callback(f.queue_free)


## 尾迹：一条前粗后细、由白到蓝渐隐的光带
func _tail() -> Line2D:
	var line := Line2D.new()
	line.width = 16.0
	line.z_index = 49
	line.joint_mode = Line2D.LINE_JOINT_ROUND
	line.begin_cap_mode = Line2D.LINE_CAP_ROUND
	line.end_cap_mode = Line2D.LINE_CAP_ROUND
	var curve := Curve.new()
	curve.add_point(Vector2(0.0, 0.1))
	curve.add_point(Vector2(1.0, 1.0))
	line.width_curve = curve
	var grad := Gradient.new()
	grad.set_color(0, Color(0.35, 0.75, 1.0, 0.0))
	grad.set_color(1, Color(1.0, 1.0, 1.0, 0.85))
	grad.add_point(0.6, Color(0.6, 0.9, 1.0, 0.6))
	line.gradient = grad
	stage.add_child(line)
	return line


func _tail_step(line: Line2D, p: Vector2) -> void:
	if not is_instance_valid(line):
		return
	line.add_point(p)
	if line.get_point_count() > 9:
		line.remove_point(0)


func _trail_spark(at: Vector2) -> void:
	var side: float = randf_range(26, 46)
	var b := UiKit.badge("fx_spark", side)
	b.z_index = 49
	b.modulate = Color("BFEBFF") if randf() < 0.5 else Color.WHITE
	put(b, at + Vector2(randf_range(-10, 10), randf_range(-10, 10)) - Vector2(side, side) / 2.0)
	var tw: Tween = b.create_tween().set_parallel()
	tw.tween_property(b, "scale", Vector2(0.2, 0.2), 0.36)
	tw.tween_property(b, "rotation", 0.9, 0.36)
	tw.tween_property(b, "modulate:a", 0.0, 0.36).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(b.queue_free)


## 点击处的一圈水波
func ripple(at: Vector2) -> void:
	for i: int in 2:
		var r := UiKit.badge("fx_ring", 120)
		r.z_index = 48
		r.modulate = Color(0.8, 0.95, 1.0, 0.9 - i * 0.3)
		put(r, at - Vector2(60, 60))
		r.scale = Vector2(0.25, 0.25)
		var tw: Tween = r.create_tween()
		tw.tween_interval(i * 0.07)
		tw.tween_property(r, "scale", Vector2.ONE * (1.0 + i * 0.25), 0.3).set_ease(Tween.EASE_OUT)
		tw.parallel().tween_property(r, "modulate:a", 0.0, 0.3).set_ease(Tween.EASE_IN)
		tw.tween_callback(r.queue_free)


## 鱼入缸：缸口溅起水花和小气泡
func splash(center: Vector2) -> void:
	Anim.burst(
		stage, center + Vector2(0, -34), 7, BUBBLE, 240.0, 900.0, Vector2(10, 20), 0.45, 47, true
	)
	ring_small(center + Vector2(0, -30))
	Audio.sfx(&"bowl", randf_range(0.95, 1.1))
	Audio.sfx(&"splash", randf_range(0.9, 1.15))


func ring_small(at: Vector2) -> void:
	var r := UiKit.badge("fx_ring", 90)
	r.z_index = 47
	r.modulate = Color(1, 1, 1, 0.7)
	put(r, at - Vector2(45, 45))
	r.scale = Vector2(0.3, 0.2)
	var tw: Tween = r.create_tween().set_parallel()
	tw.tween_property(r, "scale", Vector2(1.3, 0.5), 0.25).set_ease(Tween.EASE_OUT)
	tw.tween_property(r, "modulate:a", 0.0, 0.25).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(r.queue_free)


## 满缸最后一步：鱼缸炸成一片光点
func burst_light(center: Vector2) -> void:
	Audio.sfx(&"bowl_done")
	var glow := UiKit.badge("fx_glow", 300)
	glow.z_index = 46
	put(glow, center - Vector2(150, 150))
	glow.scale = Vector2(0.5, 0.5)
	var tw: Tween = glow.create_tween().set_parallel()
	tw.tween_property(glow, "scale", Vector2(1.5, 1.5), 0.3).set_ease(Tween.EASE_OUT)
	tw.tween_property(glow, "modulate:a", 0.0, 0.3).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(glow.queue_free)
	ring(center, Color.WHITE, 1.6)
	var tints: Array[Color] = [Color.WHITE, Color("FFF3A0"), Color("BFEBFF")]
	for i: int in 16:
		var side: float = randf_range(26, 54)
		var bit := UiKit.badge("fx_spark", side)
		bit.z_index = 47
		bit.modulate = tints[i % tints.size()]
		put(bit, center - Vector2(side, side) / 2.0)
		var dir: Vector2 = Vector2.from_angle(TAU * i / 16.0 + randf_range(-0.2, 0.2))
		var to: Vector2 = bit.position + dir * randf_range(80, 190)
		var life: float = randf_range(0.4, 0.62)
		var fly_tw: Tween = bit.create_tween().set_parallel()
		fly_tw.tween_property(bit, "position", to, life).set_ease(Tween.EASE_OUT).set_trans(
			Tween.TRANS_CUBIC
		)
		fly_tw.tween_property(bit, "rotation", randf_range(-1.5, 1.5), life)
		fly_tw.tween_property(bit, "scale", Vector2(0.1, 0.1), life).set_ease(Tween.EASE_IN)
		fly_tw.chain().tween_callback(bit.queue_free)


## 一道亮光从左到右扫过 rect（木架）
func sweep(rect: Rect2) -> void:
	var clip := Control.new()
	clip.clip_contents = true
	clip.z_index = 44
	clip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	put(clip, rect.position, rect.size)
	var bar := UiKit.badge("fx_glow", 10)
	bar.size = Vector2(220, rect.size.y * 3.0)
	bar.position = Vector2(-220, -rect.size.y)
	clip.add_child(bar)
	var tw: Tween = bar.create_tween()
	tw.tween_property(bar, "position:x", rect.size.x, 0.45).set_ease(Tween.EASE_IN_OUT)
	tw.tween_callback(clip.queue_free)


## 满缸夸奖：摆正的描边大字，弹出来跳一下再淡出
func praise(text: String, at: Vector2) -> void:
	var l := UiKit.label(text, 46, Color("FFF36B"))
	l.add_theme_color_override("font_outline_color", Color("E0501A"))
	l.add_theme_constant_override("outline_size", 14)
	l.z_index = 75
	var x: float = clampf(at.x - 130, 4, width - 264)
	put(l, Vector2(x, at.y - 34), Vector2(260, 68))
	l.scale = Vector2.ZERO
	var tw: Tween = l.create_tween()
	tw.tween_property(l, "scale", Vector2(1.25, 1.25), 0.14).set_ease(Tween.EASE_OUT)
	tw.tween_property(l, "scale", Vector2.ONE, 0.12)
	tw.tween_property(l, "position:y", l.position.y - 18, 0.12).set_ease(Tween.EASE_OUT)
	tw.tween_property(l, "position:y", l.position.y, 0.12).set_ease(Tween.EASE_IN)
	tw.tween_interval(0.2)
	tw.tween_property(l, "modulate:a", 0.0, 0.2)
	tw.tween_callback(l.queue_free)


## 从上方落到 to_y：下落 → 落地压扁 → 轻弹一下。node 的缩放和位置在此期间归这里管
func fall_in(node: Control, to_y: float, delay: float, time: float, on_land: Callable) -> void:
	var tw: Tween = node.create_tween()
	if delay > 0.0:
		tw.tween_interval(delay)
	tw.tween_property(node, "position:y", to_y, time).set_trans(Tween.TRANS_QUAD).set_ease(
		Tween.EASE_IN
	)
	if on_land.is_valid():
		tw.tween_callback(on_land)
	tw.tween_property(node, "scale", Vector2(1.12, 0.86), 0.06)
	tw.tween_property(node, "position:y", to_y - 14.0, 0.1).set_ease(Tween.EASE_OUT)
	tw.parallel().tween_property(node, "scale", Vector2(0.97, 1.04), 0.1)
	tw.tween_property(node, "position:y", to_y, 0.1).set_ease(Tween.EASE_IN)
	tw.tween_property(node, "scale", Vector2.ONE, 0.14).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)


## 让贴图变白（满缸发光）或变灰（未解锁）的材质；用 set_tint 调参数
static func tint_material() -> ShaderMaterial:
	var sh := Shader.new()
	sh.code = TINT_SHADER
	var m := ShaderMaterial.new()
	m.shader = sh
	return m


## 破泡：薄膜鼓一下向外散开，碎成一圈小泡沫，再闪几点星光
func pop(center: Vector2, r: float) -> void:
	Audio.sfx(&"pop", randf_range(0.88, 1.18))
	var fx := UiKit.icon(BUBBLE, r * 2.0)
	fx.z_index = 40
	put(fx, center - Vector2(r, r), Vector2(r, r) * 2.0)
	var tw: Tween = fx.create_tween()
	tw.tween_property(fx, "scale", Vector2(1.12, 1.12), 0.05)
	tw.set_parallel()
	tw.tween_property(fx, "scale", Vector2(1.6, 1.6), 0.2).set_trans(Tween.TRANS_QUAD).set_ease(
		Tween.EASE_OUT
	)
	tw.tween_property(fx, "modulate:a", 0.0, 0.2)
	tw.chain().tween_callback(fx.queue_free)
	# 小泡沫：从气泡边缘出发向外漂开，越漂越小
	var count: int = 9
	for i: int in count:
		var side: float = randf_range(14, 30)
		var foam := UiKit.icon(BUBBLE, side)
		foam.z_index = 41
		var dir: Vector2 = Vector2.from_angle(TAU * i / count + randf_range(-0.25, 0.25))
		put(foam, center + dir * r * 0.7 - Vector2(side, side) / 2.0)
		var to: Vector2 = foam.position + dir * r * randf_range(0.5, 1.0) + Vector2(0, -16)
		var life: float = randf_range(0.36, 0.55)
		var ftw: Tween = foam.create_tween().set_parallel()
		ftw.tween_property(foam, "position", to, life).set_ease(Tween.EASE_OUT).set_trans(
			Tween.TRANS_CUBIC
		)
		ftw.tween_property(foam, "scale", Vector2(0.3, 0.3), life).set_ease(Tween.EASE_IN)
		ftw.tween_property(foam, "modulate:a", 0.0, life).set_ease(Tween.EASE_IN)
		ftw.chain().tween_callback(foam.queue_free)
	Anim.burst(stage, center, 4, STAR, r * 2.0, 300.0, Vector2(16, 26), 0.4, 42)


## 锁或冰块从气泡上掉下去
func drop(path: String, center: Vector2, r: float) -> void:
	var side: float = r * 1.1
	var fx := UiKit.icon(path, side)
	fx.z_index = 42
	put(fx, center - Vector2(side, side) / 2.0, Vector2(side, side))
	var tw: Tween = fx.create_tween().set_parallel()
	(
		tw
		. tween_property(fx, "position:y", fx.position.y + 140, 0.5)
		. set_trans(Tween.TRANS_QUAD)
		. set_ease(Tween.EASE_IN)
	)
	tw.tween_property(fx, "rotation", 0.9, 0.5)
	tw.tween_property(fx, "modulate:a", 0.0, 0.5).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(fx.queue_free)


func toast(text: String, y: float) -> void:
	var l := UiKit.label(text, 30)
	l.z_index = 90
	put(l, Vector2(0, y), Vector2(width, 50))
	Anim.pop_in(l, 0.0, 0.2)
	var tw: Tween = l.create_tween()
	tw.tween_interval(1.5)
	tw.tween_property(l, "modulate:a", 0.0, 0.3)
	tw.tween_callback(l.queue_free)


## 金币数字「+N」从命中处冒出来往上飘
func gain(text: String, at: Vector2) -> void:
	var l := UiKit.label(text, 40, UiKit.GOLD)
	l.z_index = 72
	put(l, at - Vector2(60, 70), Vector2(120, 50))
	l.scale = Vector2(0.3, 0.3)
	var tw: Tween = l.create_tween().set_parallel()
	tw.tween_property(l, "scale", Vector2.ONE, 0.18).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)
	tw.tween_property(l, "position:y", l.position.y - 70, 0.7).set_ease(Tween.EASE_OUT)
	tw.tween_property(l, "modulate:a", 0.0, 0.25).set_delay(0.45)
	tw.chain().tween_callback(l.queue_free)


## 渔网：从道具键甩出一张大网，划弧线扣到鱼缸上再收走
func net_swing(from: Vector2, to: Vector2) -> void:
	var net := UiKit.icon("res://assets/ui/tool_net.png", 220)
	net.z_index = 80
	put(net, from - Vector2(110, 110), Vector2(220, 220))
	net.scale = Vector2(0.3, 0.3)
	net.rotation = -1.2
	Audio.sfx(&"net")
	var top: Vector2 = Vector2((from.x + to.x) / 2.0, minf(from.y, to.y) - 60) - Vector2(110, 110)
	var tw: Tween = net.create_tween()
	tw.tween_property(net, "position", top, 0.24).set_trans(Tween.TRANS_QUAD).set_ease(
		Tween.EASE_OUT
	)
	tw.parallel().tween_property(net, "scale", Vector2(1.25, 1.25), 0.24)
	tw.parallel().tween_property(net, "rotation", 0.3, 0.24)
	(
		tw
		. tween_property(net, "position", to - Vector2(110, 110), 0.2)
		. set_trans(Tween.TRANS_QUAD)
		. set_ease(Tween.EASE_IN)
	)
	tw.parallel().tween_property(net, "rotation", 1.0, 0.2)
	tw.tween_callback(ring.bind(to, Color.WHITE, 2.2))
	tw.tween_property(net, "scale", Vector2(0.8, 0.8), 0.12)
	tw.tween_property(net, "modulate:a", 0.0, 0.2)
	tw.tween_callback(net.queue_free)


## 吹泡：一串小泡泡从道具键飘向回流位，最后鼓出一个大泡
func blow(from: Vector2, to: Vector2) -> void:
	Audio.sfx(&"blow")
	for i: int in 12:
		var bub := UiKit.icon(BUBBLE, randf_range(26, 54))
		bub.z_index = 80
		put(bub, from - bub.size / 2.0)
		bub.scale = Vector2.ZERO
		var mid: Vector2 = (from + to) / 2.0 + Vector2(randf_range(-160, 160), randf_range(-60, 60))
		var tw: Tween = bub.create_tween()
		tw.tween_interval(i * 0.04)
		tw.tween_property(bub, "scale", Vector2.ONE, 0.1)
		tw.parallel().tween_property(bub, "position", mid, 0.28).set_ease(Tween.EASE_OUT)
		tw.tween_property(bub, "position", to - bub.size / 2.0, 0.26).set_ease(Tween.EASE_IN)
		tw.tween_property(bub, "scale", Vector2.ZERO, 0.08)
		tw.tween_callback(bub.queue_free)
	stage.get_tree().create_timer(0.62).timeout.connect(ring.bind(to, Color("9FE8FF"), 2.4))


## 洗牌：场地中央一个大风车转起来，带一圈水花
func whirl(center: Vector2) -> void:
	var wheel := UiKit.icon("res://assets/ui/tool_shuffle.png", 300)
	wheel.z_index = 80
	put(wheel, center - Vector2(150, 150), Vector2(300, 300))
	wheel.scale = Vector2(0.2, 0.2)
	var tw: Tween = wheel.create_tween().set_parallel()
	tw.tween_property(wheel, "rotation", TAU * 2.5, 0.7).set_ease(Tween.EASE_OUT)
	tw.tween_property(wheel, "scale", Vector2(1.3, 1.3), 0.35).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)
	tw.tween_property(wheel, "modulate:a", 0.0, 0.25).set_delay(0.45)
	tw.chain().tween_callback(wheel.queue_free)
	ring(center, Color.WHITE, 3.4)
	Anim.burst(stage, center, 18, BUBBLE, 620.0, 300.0, Vector2(22, 46), 0.7, 79)


## 一圈向外扩散的光环
func ring(at: Vector2, color: Color, reach: float) -> void:
	var r := UiKit.badge("fx_ring", 200)
	r.z_index = 79
	r.modulate = color
	put(r, at - Vector2(100, 100))
	r.scale = Vector2(0.2, 0.2)
	var tw: Tween = r.create_tween().set_parallel()
	tw.tween_property(r, "scale", Vector2(reach, reach), 0.45).set_ease(Tween.EASE_OUT).set_trans(
		Tween.TRANS_CUBIC
	)
	tw.tween_property(r, "modulate:a", 0.0, 0.45).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(r.queue_free)


## 提示：在该点的鱼上套一个呼吸的光圈，返回节点由调用方负责清掉
func hint(at: Vector2) -> Control:
	var r := UiKit.badge("fx_ring", 120)
	r.z_index = 45
	r.modulate = Color("FFF36B")
	put(r, at - Vector2(60, 60))
	r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	Anim.pulse(r, 1.25, 0.8)
	return r
