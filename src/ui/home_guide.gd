class_name HomeGuide
extends RefCounted
## 新功能开放后在主页上的提示：目标上先有一把锁抖一下、弹开，金光迸出，
## 随后一圈光环一直脉动，指着该点的地方。没有弹窗、没有字；点到目标后由调用方收掉。

const LOCK := "res://assets/ui/lock.png"
const GLOW := "res://assets/kit/fx_glow.png"
const RING := "res://assets/kit/fx_ring.png"
const SPARK := "res://assets/kit/fx_spark.png"


## 在 center 处（parent 的坐标）放解锁动画，返回光环所在的节点，用完 Anim.fade_out_free 收掉。
## target 是被解锁的入口（有就让它从灰色亮起并弹一下），页签没有节点可传
static func play(parent: Control, center: Vector2, target: Control, side: float) -> Control:
	var cfg: Dictionary = GameCfg.d()["unlockGuide"]
	var root := Control.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.z_index = 60
	root.position = center
	parent.add_child(root)
	var lock := UiKit.icon(LOCK, side * 0.5)
	lock.position = -lock.size / 2.0
	root.add_child(lock)
	if target != null:
		target.modulate = Color(0.62, 0.68, 0.76)
	var tw: Tween = root.create_tween()
	tw.tween_interval(float(cfg["delay"]))
	tw.tween_callback(Anim.shake.bind(lock, 6.0))
	tw.tween_interval(float(cfg["lockSeconds"]))
	tw.tween_callback(_burst.bind(root, lock, target, side, cfg))
	return root


static func _burst(
	root: Control, lock: Control, target: Control, side: float, cfg: Dictionary
) -> void:
	Audio.sfx(&"unlock")
	# 锁弹开落下
	var fall: Tween = lock.create_tween().set_parallel()
	(
		fall
		. tween_property(lock, "position:y", lock.position.y + side * 0.9, 0.5)
		. set_trans(Tween.TRANS_QUAD)
		. set_ease(Tween.EASE_IN)
	)
	fall.tween_property(lock, "rotation", 0.6, 0.5)
	fall.tween_property(lock, "modulate:a", 0.0, 0.5)
	fall.chain().tween_callback(lock.queue_free)
	if target != null:
		target.create_tween().tween_property(target, "modulate", Color.WHITE, 0.3)
		Anim.bounce(target, 1.25, 0.4)
	# 金光 + 火花
	var glow := UiKit.icon(GLOW, side * 2.0)
	glow.position = -glow.size / 2.0
	glow.modulate = Color(UiKit.GOLD, 0.0)
	root.add_child(glow)
	var gt: Tween = glow.create_tween()
	gt.tween_property(glow, "modulate:a", 0.8, 0.15)
	gt.tween_property(glow, "modulate:a", 0.0, 0.6)
	gt.tween_callback(glow.queue_free)
	Anim.burst(root, Vector2.ZERO, int(cfg["sparks"]), SPARK, 260.0, 300.0, Vector2(14, 30), 0.8)
	# 光环：一直脉动，直到玩家点了目标
	var ring := UiKit.icon(RING, side * 1.5)
	ring.position = -ring.size / 2.0
	ring.modulate = Color(UiKit.GOLD, 0.9)
	root.add_child(ring)
	Anim.pop_in(ring, 0.2, 0.3)
	var loop: Tween = ring.create_tween()
	loop.tween_interval(0.6)
	loop.tween_callback(Anim.pulse.bind(ring, 1.18, 0.8))
