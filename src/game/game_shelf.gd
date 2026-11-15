class_name GameShelf
extends RefCounted
## 木架：4 个缸位、缸里的鱼、缸下挂的订单卡，以及满缸的整段演出。
## 逻辑上的缸换得比画面快（动画不挡操作），所以这里按订单号记每个缸的画面，
## 并告诉 GameScreen 新缸什么时候落到位，让飞向它的鱼晚一点出发。

const TANK := "res://assets/ui/tank.png"
const SHELF_Y := 78.0
const PLANK_Y := SHELF_Y + 142.0
const CARD_SIZE := Vector2(108, 46)
const CLOSED := Color(0.62, 0.78, 1.0, 0.62)

var _stage: Control
var _fx: GameFx
var _tex: Callable
## 订单号 → 画面 { root, tank, fish_box, card, num, pic, timer, slot, species, cap, shown, expected }
var _views: Dictionary = {}
## 每个缸位当前（逻辑上）的订单号，-1 = 空
var _order: Array[int] = [-1, -1, -1, -1]
## 每个缸位：新缸落到位的时刻、最后一条在路上的鱼抵达的时刻（秒，_now() 的刻度）
var _ready_at: Array[float] = [0.0, 0.0, 0.0, 0.0]
var _last_arrival: Array[float] = [0.0, 0.0, 0.0, 0.0]
## 没开的缸位：{ tank, plus }
var _closed: Array[Dictionary] = []
var _streak: int = 0
var _streak_at: float = -100.0


func _now() -> float:
	return Time.get_ticks_msec() / 1000.0


func pos(i: int) -> Vector2:
	return Vector2(105 + i * 180, SHELF_Y + 86)


## 鱼飞进缸的落点：玻璃缸的中心
func target(i: int) -> Vector2:
	return pos(i) + Vector2(0, 8)


## tex：鱼种槽位 → 贴图；on_press：点了第 i 个缸位
func build(
	stage: Control, fx: GameFx, s: GameState, tex: Callable, intro: bool, on_press: Callable
) -> void:
	_stage = stage
	_fx = fx
	_tex = tex
	_views.clear()
	_closed.clear()
	_fx.put(UiKit.piece("shelf"), Vector2(12, PLANK_Y), Vector2(fx.width - 24, 30))
	for i: int in GameState.MAX_SLOTS:
		_order[i] = -1
		_ready_at[i] = 0.0
		_last_arrival[i] = 0.0
		var shut: Dictionary = {}
		if i >= s.open_slots:
			shut = _make_closed(i)
		_closed.append(shut)
		var hot := UiKit.hotspot(pos(i) - Vector2(80, 86), Vector2(160, 230))
		hot.pressed.connect(on_press.bind(i))
		stage.add_child(hot)
		var bowl: GameState.Bowl = s.slots[i] if i < s.open_slots else null
		if bowl == null:
			continue
		var view: Dictionary = _make_view(i, bowl.order, bowl.species, bowl.cap)
		view["expected"] = bowl.count
		for k: int in bowl.count:
			_add_fish(view)
		_set_num(view)
		if intro:
			_drop_in(view, 0.1 + 0.08 * i)


func _make_closed(i: int) -> Dictionary:
	var c: Vector2 = pos(i)
	var tank := UiKit.icon(TANK, 160)
	tank.modulate = CLOSED
	var gray := GameFx.tint_material()
	gray.set_shader_parameter("gray", 1.0)
	tank.material = gray
	_fx.put(tank, c - Vector2(80, 86))
	var plus := UiKit.badge("plus", 52)
	_fx.put(plus, c - Vector2(26, 16))
	Anim.pulse(plus, 1.12)
	return {"tank": tank, "plus": plus}


func _make_view(i: int, order: int, species: int, cap: int) -> Dictionary:
	var c: Vector2 = pos(i)
	# root 没有尺寸，原点就是缸心：整体缩放、下落都围绕缸心
	var root := Control.new()
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.z_index = 2
	_fx.put(root, c)
	var tank := UiKit.icon(TANK, 160)
	tank.position = -Vector2(80, 86)
	tank.material = GameFx.tint_material()
	root.add_child(tank)
	var fish_box := Control.new()
	fish_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	fish_box.position = Vector2(0, 8)
	root.add_child(fish_box)
	var timer := UiKit.label("", 26, UiKit.GOLD)
	timer.position = Vector2(-60, -82)
	timer.size = Vector2(120, 30)
	timer.pivot_offset = timer.size / 2.0
	timer.visible = false
	root.add_child(timer)
	# 订单卡：两根细绳挂在木架下面，深色实底，生物图 + 进度
	var card := Control.new()
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card.size = CARD_SIZE
	card.pivot_offset = Vector2(CARD_SIZE.x / 2.0, 0)
	card.position = Vector2(-CARD_SIZE.x / 2.0, PLANK_Y + 40.0 - c.y)
	root.add_child(card)
	for x: float in [22.0, CARD_SIZE.x - 25.0]:
		var rope := ColorRect.new()
		rope.color = Color("8A4B1E")
		rope.size = Vector2(3, 12)
		rope.position = Vector2(x, -11)
		rope.mouse_filter = Control.MOUSE_FILTER_IGNORE
		card.add_child(rope)
	var face := UiKit.piece("track")
	face.size = CARD_SIZE
	card.add_child(face)
	var pic := UiKit.icon("", 40)
	pic.texture = _tex.call(species)
	pic.position = Vector2(8, 3)
	card.add_child(pic)
	var num := UiKit.label("", 24)
	num.position = Vector2(48, 0)
	num.size = Vector2(CARD_SIZE.x - 54, CARD_SIZE.y)
	num.pivot_offset = num.size / 2.0
	card.add_child(num)
	var view: Dictionary = {
		"root": root,
		"tank": tank,
		"fish_box": fish_box,
		"card": card,
		"num": num,
		"timer": timer,
		"slot": i,
		"species": species,
		"cap": cap,
		"shown": 0,
		"expected": 0,
	}
	_views[order] = view
	_order[i] = order
	_set_num(view)
	return view


func _set_num(view: Dictionary) -> void:
	(view["num"] as Label).text = "%d/%d" % [view["shown"], view["cap"]]


## 缸里第 k 条鱼的位置（相对玻璃缸中心）和边长
func _fish_spot(k: int, cap: int) -> Array:
	if cap <= 3:
		var spots: Array[Vector2] = [Vector2(-25, 14), Vector2(25, 14), Vector2(0, -16)]
		return [spots[k % 3], 48.0]
	var cols: int = 3
	var col: int = k % cols
	var row: int = k / cols
	return [Vector2((col - 1) * 30.0, 18.0 - row * 30.0), 36.0]


func _add_fish(view: Dictionary) -> TextureRect:
	var spot: Array = _fish_spot(view["shown"], view["cap"])
	var side: float = spot[1]
	var f := UiKit.icon("", side)
	f.texture = _tex.call(view["species"])
	f.position = (spot[0] as Vector2) - Vector2(side, side) / 2.0
	f.material = (view["tank"] as Control).material
	# 左右两条面对面
	f.flip_h = int(view["shown"]) % 2 == 0
	(view["fish_box"] as Control).add_child(f)
	view["shown"] = int(view["shown"]) + 1
	return f


func _alive(order: int) -> bool:
	return _views.has(order) and is_instance_valid(_views[order]["root"])


## 新缸和订单卡从上方落下，落地轻弹
func _drop_in(view: Dictionary, delay: float) -> void:
	var root: Control = view["root"]
	var home: float = root.position.y
	root.position.y = home - 330.0
	_fx.fall_in(root, home, delay, GameCfg.num("bowlDone", "dropSeconds"), _on_landed.bind(root))
	var slot: int = view["slot"]
	_ready_at[slot] = maxf(_ready_at[slot], _now() + delay + GameCfg.num("bowlDone", "dropSeconds"))


func _on_landed(root: Control) -> void:
	Audio.sfx(&"land", randf_range(1.2, 1.4))
	_fx.ring_small(root.position + Vector2(0, 52))


# ---------- GameScreen 按规则事件调用 ----------


## 现在出发的鱼最早还要等几秒才能抵达第 slot 个缸（新缸还没落到位）
func wait_for(slot: int) -> float:
	return maxf(0.0, _ready_at[slot] - _now())


## 一条鱼已经出发飞向第 slot 个缸，arrive_in 秒后到。返回它要进的订单号，抵达时传给 arrive
func send(slot: int, arrive_in: float) -> int:
	var order: int = _order[slot]
	_last_arrival[slot] = maxf(_last_arrival[slot], _now() + arrive_in)
	if _alive(order):
		_views[order]["expected"] = int(_views[order]["expected"]) + 1
	return order


## 鱼到了：缸里多一条，鱼缸一弹，订单卡数字跳一下。返回画面上是否真的多了一条
func arrive(order: int) -> bool:
	if not _alive(order):
		return false
	var view: Dictionary = _views[order]
	_fx.splash(pos(view["slot"]))
	Anim.squash(view["tank"])
	if int(view["shown"]) >= int(view["expected"]) or int(view["shown"]) >= int(view["cap"]):
		return false
	var f: TextureRect = _add_fish(view)
	Anim.pop_in(f, 0.0, 0.2)
	_set_num(view)
	var num: Label = view["num"]
	num.add_theme_color_override("font_color", UiKit.GOLD)
	Anim.bounce(num, 1.45, 0.3)
	var tw: Tween = num.create_tween()
	tw.tween_interval(0.3)
	tw.tween_callback(num.add_theme_color_override.bind("font_color", Color.WHITE))
	return true


## 第 slot 个缸满了：等最后一条鱼到了开始演出。返回从现在到炸开还有几秒
func done(slot: int) -> float:
	var order: int = _order[slot]
	_order[slot] = -1
	# 玩家比动画快（这个缸还没落到位就已经满了）时，演出压缩着播，免得越积越慢
	var pace: float = 0.45 if _ready_at[slot] > _now() else 1.0
	var wait: float = maxf(0.0, _last_arrival[slot] - _now())
	var burst_in: float = wait + GameCfg.num("bowlDone", "dropAt") * pace
	_ready_at[slot] = _now() + burst_in
	if _alive(order):
		var view: Dictionary = _views[order]
		var root: Control = view["root"]
		var tw: Tween = root.create_tween()
		tw.tween_interval(wait + 0.02)
		tw.tween_callback(_complete.bind(view, order, pace))
	return burst_in


## 满缸演出：订单卡打勾 → 鱼抖动 → 发白光膨胀 → 炸成光点、亮光扫过木架、夸奖
func _complete(view: Dictionary, order: int, pace: float) -> void:
	var root: Control = view["root"]
	var shake: float = GameCfg.num("bowlDone", "shake") * pace
	var swell: float = GameCfg.num("bowlDone", "swell") * pace
	root.z_index = 3
	_check(view)
	Audio.sfx(&"tick")
	for f: Control in (view["fish_box"] as Control).get_children():
		var home: Vector2 = f.position
		var ftw: Tween = f.create_tween()
		ftw.tween_interval(0.05)
		var steps: int = maxi(2, int(shake / 0.1))
		for i: int in steps:
			var side: float = 1.0 if i % 2 == 0 else -1.0
			ftw.tween_property(f, "rotation", 0.3 * side, 0.05)
			ftw.parallel().tween_property(f, "position", home + Vector2(5 * side, -3), 0.05)
			ftw.tween_property(f, "rotation", -0.12 * side, 0.05)
			ftw.parallel().tween_property(f, "position", home, 0.05)
	var mat: ShaderMaterial = (view["tank"] as Control).material
	var tw: Tween = root.create_tween()
	tw.tween_interval(0.05 + shake)
	tw.tween_callback(Audio.sfx.bind(&"swell"))
	tw.tween_method(func(v: float) -> void: mat.set_shader_parameter("white", v), 0.0, 1.0, swell)
	tw.parallel().tween_property(root, "scale", Vector2(1.24, 1.24), swell).set_ease(Tween.EASE_IN)
	tw.tween_callback(_burst.bind(view, order))


## 订单卡上的数字换成一个绿色的勾
func _check(view: Dictionary) -> void:
	var num: Label = view["num"]
	num.visible = false
	var tick := Line2D.new()
	tick.points = PackedVector2Array([Vector2(-11, 0), Vector2(-3, 9), Vector2(13, -10)])
	tick.width = 7.0
	tick.default_color = Color("6BE04A")
	tick.joint_mode = Line2D.LINE_JOINT_ROUND
	tick.begin_cap_mode = Line2D.LINE_CAP_ROUND
	tick.end_cap_mode = Line2D.LINE_CAP_ROUND
	tick.position = num.position + num.size / 2.0
	tick.scale = Vector2.ZERO
	(view["card"] as Control).add_child(tick)
	var tw: Tween = tick.create_tween()
	tw.tween_property(tick, "scale", Vector2(1.5, 1.5), 0.1)
	tw.tween_property(tick, "scale", Vector2.ONE, 0.12)
	Anim.bounce(view["card"], 1.15, 0.25)


func _burst(view: Dictionary, order: int) -> void:
	_views.erase(order)
	var slot: int = view["slot"]
	var c: Vector2 = pos(slot)
	(view["root"] as Control).queue_free()
	_fx.burst_light(c)
	_fx.sweep(Rect2(12, PLANK_Y, _fx.width - 24, 30))
	# 短时间里连着满缸，夸奖词逐级升
	var now: float = _now()
	var cfg: Dictionary = GameCfg.d()["praise"]
	_streak = _streak + 1 if now - _streak_at < float(cfg["streakSeconds"]) else 1
	_streak_at = now
	var keys: Array = cfg["keys"]
	_fx.praise(_stage.tr(keys[mini(_streak, keys.size()) - 1]), c + Vector2(0, -4))


## 新订单补到第 slot 个缸位：新缸等旧缸炸开后从上方落下
func incoming(slot: int, order: int, species: int, cap: int) -> void:
	var view: Dictionary = _make_view(slot, order, species, cap)
	# _drop_in 会把到位时刻再往后推一个下落时长
	_drop_in(view, maxf(0.0, _ready_at[slot] - _now()))


## 开了一个新缸位：暗缸和加号弹走
func open_slot(slot: int) -> void:
	if slot >= _closed.size() or _closed[slot].is_empty():
		return
	for n: Control in _closed[slot].values():
		if is_instance_valid(n):
			Anim.fade_out_free(n, 0.2)
	_closed[slot] = {}
	_fx.ring(pos(slot), Color("9FE8FF"), 1.4)
	_ready_at[slot] = _now() + 0.15


## 所有鱼缸什么时候都演完：从现在起还要几秒
func busy_for() -> float:
	var until: float = 0.0
	for i: int in GameState.MAX_SLOTS:
		until = maxf(until, _ready_at[i] - _now())
	return maxf(until, 0.0)


## 限时缸的倒计时；text 为空则隐藏
func set_timer(slot: int, text: String, urgent: bool) -> void:
	if not _alive(_order[slot]):
		return
	var timer: Label = _views[_order[slot]]["timer"]
	timer.visible = text != ""
	if text == timer.text:
		return
	timer.text = text
	# 最后 10 秒变色并逐秒跳动
	if urgent:
		timer.add_theme_color_override("font_color", UiKit.ORANGE)
		Anim.bounce(timer, 1.3)
		Audio.sfx(&"click", 1.4)


## 渔网等待选缸、过关庆祝时，所有鱼缸一起动一下
func nudge_all(squash: bool) -> void:
	for view: Dictionary in _views.values():
		if not is_instance_valid(view["root"]):
			continue
		if squash:
			Anim.squash(view["tank"], 0.2)
		else:
			Anim.bounce(view["tank"], 1.12, 0.4)
