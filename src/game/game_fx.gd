class_name GameFx
extends RefCounted
## 局内的表现效果：飞行、水花、破泡、满缸、掉落、提示文字。
## 只管「怎么动」，不碰规则；位置和贴图都由 GameScreen 传进来。

const FLY_TIME := 0.36
const BUBBLE := "res://assets/ui/bubble.png"
const STAR := "res://assets/ui/star.png"

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


## 鱼先在原地一缩蓄力，再沿弧线游向目的地，一路留下小气泡；到达时触发回调
func fly(tex: Texture2D, from: Vector2, to: Vector2, delay: float, on_arrive: Callable) -> void:
	var half := Vector2(42, 42)
	var f := UiKit.icon("", 84)
	f.texture = tex
	f.z_index = 50
	# 鱼的原画朝左，往右游时翻过来
	f.flip_h = to.x > from.x + 20.0
	put(f, from - half, Vector2(84, 84))
	var ctrl: Vector2 = (from + to) / 2.0 + Vector2(0, -120)
	var trail: Array[float] = [0.0]
	var tw: Tween = f.create_tween()
	if delay > 0.0:
		tw.tween_interval(delay)
	tw.tween_property(f, "scale", Vector2(1.3, 0.78), 0.06)
	(
		tw
		. tween_method(
			func(t: float) -> void:
				var p: Vector2 = from.lerp(ctrl, t).lerp(ctrl.lerp(to, t), t)
				f.position = p - half
				# 飞行中拉长，快到时缩小钻进去
				f.scale = Vector2(lerpf(1.3, 0.62, t * t), lerpf(0.9, 0.62, t * t))
				f.rotation = sin(t * PI) * (0.4 if f.flip_h else -0.4)
				if t - trail[0] > 0.14:
					trail[0] = t
					_trail_bubble(p),
			0.0,
			1.0,
			FLY_TIME
		)
		. set_trans(Tween.TRANS_SINE)
		. set_ease(Tween.EASE_IN_OUT)
	)
	tw.tween_callback(on_arrive)
	tw.tween_callback(f.queue_free)


func _trail_bubble(at: Vector2) -> void:
	var side: float = randf_range(12, 22)
	var b := UiKit.icon(BUBBLE, side)
	b.z_index = 49
	put(b, at - Vector2(side, side) / 2.0)
	var tw: Tween = b.create_tween().set_parallel()
	tw.tween_property(b, "position:y", b.position.y - 26, 0.45)
	tw.tween_property(b, "modulate:a", 0.0, 0.45)
	tw.chain().tween_callback(b.queue_free)


## 鱼入缸：鱼缸被撞得一扁一弹，缸口溅起水花
func bowl_hit(center: Vector2, tank: Control, fish: Control) -> void:
	Anim.squash(tank)
	Anim.squash(fish, 0.2)
	Anim.burst(
		stage, center + Vector2(0, -30), 6, BUBBLE, 230.0, 900.0, Vector2(10, 20), 0.45, 47, true
	)
	Audio.sfx(&"bowl", randf_range(0.95, 1.1))
	Audio.sfx(&"splash", randf_range(0.9, 1.15))


## 满缸：旧缸带着星星飞走，新缸弹出来
func bowl_done(center: Vector2, tank: Control, fish: Control) -> void:
	Audio.sfx(&"bowl_done")
	var ghost := UiKit.icon("res://assets/ui/tank.png", 170)
	ghost.z_index = 45
	put(ghost, center - Vector2(85, 92), Vector2(170, 170))
	var tw: Tween = ghost.create_tween().set_parallel()
	(
		tw
		. tween_property(ghost, "position:y", ghost.position.y - 120, 0.42)
		. set_trans(Tween.TRANS_BACK)
		. set_ease(Tween.EASE_IN)
	)
	tw.tween_property(ghost, "scale", Vector2(1.15, 1.15), 0.42)
	tw.tween_property(ghost, "modulate:a", 0.0, 0.42).set_ease(Tween.EASE_IN)
	tw.chain().tween_callback(ghost.queue_free)
	Anim.burst(stage, center, 8, STAR, 380.0, 500.0, Vector2(28, 44), 0.6, 46)
	Anim.pop_in(tank, 0.12)
	Anim.pop_in(fish, 0.2)


## 破泡：气泡先鼓一下再炸开，薄膜向外扩散，水珠带着重力四溅，再闪几点星光
func pop(center: Vector2, r: float) -> void:
	Audio.sfx(&"pop", randf_range(0.88, 1.18))
	var fx := UiKit.icon(BUBBLE, r * 2.0)
	fx.z_index = 40
	put(fx, center - Vector2(r, r), Vector2(r, r) * 2.0)
	var tw: Tween = fx.create_tween()
	tw.tween_property(fx, "scale", Vector2(1.12, 1.12), 0.05)
	tw.set_parallel()
	tw.tween_property(fx, "scale", Vector2(1.7, 1.7), 0.22).set_trans(Tween.TRANS_QUAD).set_ease(
		Tween.EASE_OUT
	)
	tw.tween_property(fx, "modulate:a", 0.0, 0.22)
	tw.chain().tween_callback(fx.queue_free)
	Anim.burst(stage, center, 10, BUBBLE, r * 3.2, 1100.0, Vector2(12, 26), 0.5, 41)
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


## 连击字样：连击越高字越大、颜色越热；big 时再炸一圈星星
func combo(text: String, heat: float, big: bool, y: float) -> Label:
	var l := UiKit.label(
		text, int(lerpf(48, 76, heat)) + (16 if big else 0), UiKit.GOLD.lerp(UiKit.RED, heat * 0.7)
	)
	l.z_index = 70
	put(l, Vector2(0, y), Vector2(width, 110))
	l.rotation = randf_range(-0.08, 0.08)
	l.scale = Vector2(1.8, 1.8)
	var tw: Tween = l.create_tween()
	tw.tween_property(l, "scale", Vector2.ONE, 0.2).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)
	tw.tween_interval(0.7)
	tw.set_parallel()
	tw.tween_property(l, "modulate:a", 0.0, 0.25)
	tw.tween_property(l, "position:y", l.position.y - 40, 0.25)
	tw.chain().tween_callback(l.queue_free)
	if big:
		Anim.burst(
			stage, Vector2(width / 2.0, y + 55), 12, STAR, 420.0, 900.0, Vector2(26, 44), 0.7, 69
		)
		Audio.sfx(&"star")
	return l


## 一枚金币从 from 跳起再飞到 to
func coin_to(from: Vector2, to: Vector2, pitch: float, on_arrive: Callable) -> void:
	var coin := UiKit.icon("res://assets/ui/coin.png", 50)
	coin.z_index = 60
	put(coin, from - Vector2(25, 25))
	var tw: Tween = coin.create_tween()
	(
		tw
		. tween_property(coin, "position", from - Vector2(25, 95), 0.18)
		. set_trans(Tween.TRANS_QUAD)
		. set_ease(Tween.EASE_OUT)
	)
	tw.tween_property(coin, "position", to, 0.4).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_IN)
	tw.tween_callback(Audio.sfx.bind(&"coin", pitch))
	tw.tween_callback(on_arrive)
	tw.tween_callback(coin.queue_free)
