class_name Anim
extends RefCounted
## 通用界面动画。所有动画都绑定在节点自己的 Tween 上，节点销毁时自动停止。


## 从 0 弹出到原大小
static func pop_in(node: Control, delay: float = 0.0, time: float = 0.3) -> void:
	node.scale = Vector2.ZERO
	var tw: Tween = node.create_tween()
	if delay > 0.0:
		tw.tween_interval(delay)
	tw.tween_property(node, "scale", Vector2.ONE, time).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)


## 放大一下再弹回，表示「收到了」
static func bounce(node: Control, amount: float = 1.18, time: float = 0.22) -> void:
	var tw: Tween = node.create_tween()
	tw.tween_property(node, "scale", Vector2(amount, amount), time * 0.35)
	tw.tween_property(node, "scale", Vector2.ONE, time * 0.65).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)


## 上下漂浮，循环
static func bob(node: Control, amp: float, period: float, phase: float = 0.0) -> void:
	var home: float = node.position.y
	var tw: Tween = node.create_tween()
	tw.tween_interval(phase * period)
	tw.tween_callback(func() -> void: _bob_loop(node, home, amp, period))


static func _bob_loop(node: Control, home: float, amp: float, period: float) -> void:
	var tw: Tween = node.create_tween().set_loops()
	(
		tw
		. tween_property(node, "position:y", home - amp, period / 2.0)
		. set_trans(Tween.TRANS_SINE)
		. set_ease(Tween.EASE_IN_OUT)
	)
	(
		tw
		. tween_property(node, "position:y", home + amp, period / 2.0)
		. set_trans(Tween.TRANS_SINE)
		. set_ease(Tween.EASE_IN_OUT)
	)


## 左右摆动，循环（鱼的摆尾）
static func wiggle(node: Control, degrees: float, period: float, phase: float = 0.0) -> void:
	var rad: float = deg_to_rad(degrees)
	node.rotation = -rad
	var tw: Tween = node.create_tween()
	tw.tween_interval(phase * period)
	tw.tween_callback(
		func() -> void:
			var loop: Tween = node.create_tween().set_loops()
			(
				loop
				. tween_property(node, "rotation", rad, period / 2.0)
				. set_trans(Tween.TRANS_SINE)
				. set_ease(Tween.EASE_IN_OUT)
			)
			(
				loop
				. tween_property(node, "rotation", -rad, period / 2.0)
				. set_trans(Tween.TRANS_SINE)
				. set_ease(Tween.EASE_IN_OUT)
			)
	)


## 呼吸式缩放，循环（引导玩家去点）
static func pulse(node: Control, amount: float = 1.06, period: float = 1.1) -> void:
	var tw: Tween = node.create_tween().set_loops()
	tw.tween_property(node, "scale", Vector2(amount, amount), period / 2.0).set_trans(
		Tween.TRANS_SINE
	)
	tw.tween_property(node, "scale", Vector2.ONE, period / 2.0).set_trans(Tween.TRANS_SINE)


static func shake(node: Control, strength: float = 8.0) -> void:
	var home: float = node.position.x
	var tw: Tween = node.create_tween()
	for dx: float in [strength, -strength, strength * 0.6, -strength * 0.6, 0.0]:
		tw.tween_property(node, "position:x", home + dx, 0.04)


static func fade_out_free(node: CanvasItem, time: float = 0.2) -> void:
	var tw: Tween = node.create_tween()
	tw.tween_property(node, "modulate:a", 0.0, time)
	tw.tween_callback(node.queue_free)


## 按钮按下缩小、松开弹回，并播放点击音
static func press_fx(btn: BaseButton) -> void:
	btn.button_down.connect(
		func() -> void:
			btn.pivot_offset = btn.size / 2.0
			btn.create_tween().tween_property(btn, "scale", Vector2(0.92, 0.92), 0.06)
	)
	btn.button_up.connect(
		func() -> void:
			(
				btn
				. create_tween()
				. tween_property(btn, "scale", Vector2.ONE, 0.18)
				. set_trans(Tween.TRANS_BACK)
				. set_ease(Tween.EASE_OUT)
			)
	)
	btn.pressed.connect(func() -> void: Audio.sfx(&"click"))


## 数字滚动到目标值
static func count_to(label: Label, from: int, to: int, time: float = 0.5) -> void:
	if from == to:
		label.text = str(to)
		return
	var tw: Tween = label.create_tween()
	tw.tween_method(func(v: float) -> void: label.text = str(int(v)), float(from), float(to), time)
	bounce(label, 1.25, 0.3)


## 彩纸：从顶部洒下一批彩色小方块
static func confetti(parent: Control, width: float, count: int = 60) -> void:
	var colors: Array[Color] = [UiKit.CORAL, UiKit.MINT, UiKit.LEMON, UiKit.BERRY, UiKit.GREEN]
	for i: int in count:
		var bit := ColorRect.new()
		bit.color = colors[i % colors.size()]
		bit.size = Vector2(randf_range(10, 18), randf_range(14, 26))
		bit.position = Vector2(randf_range(0, width), randf_range(-200, -20))
		bit.rotation = randf_range(0, TAU)
		bit.z_index = 120
		bit.mouse_filter = Control.MOUSE_FILTER_IGNORE
		parent.add_child(bit)
		var time: float = randf_range(1.4, 2.6)
		var tw: Tween = bit.create_tween().set_parallel()
		tw.tween_property(
			bit,
			"position",
			bit.position + Vector2(randf_range(-120, 120), parent.size.y + 300),
			time
		)
		tw.tween_property(bit, "rotation", bit.rotation + randf_range(-8, 8), time)
		tw.chain().tween_callback(bit.queue_free)
