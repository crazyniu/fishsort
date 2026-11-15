class_name GameField
extends RefCounted
## 气泡场：摆气泡、按状态刷新、判断点到了哪条鱼、破泡 / 落下 / 洗牌的表现。
## 气泡节点 node 的位置只归落下和挤开的动画管；待机漂浮只动里面的 body。
## 点击判定一律用 node 当前的真实位置。

const DIM := Color(0.55, 0.62, 0.74)
const SILHOUETTE := Color(0.03, 0.16, 0.2, 0.8)
const BUBBLE := "res://assets/ui/bubble.png"

var _stage: Control
var _fx: GameFx
var _tex: Callable
var _on_tap: Callable
var _top: float
var _bubbles: Array[Dictionary] = []
var _return_box: Control
## 逻辑上已经走了、画面上还在排队等出发的鱼（洋流）：键是 气泡 * 100 + 序号
var _held: Dictionary = {}
## 逻辑上已经落下、画面上还没轮到落的气泡
var _deferred: Dictionary = {}


func _init(stage: Control, fx: GameFx, tex: Callable, on_tap: Callable) -> void:
	_stage = stage
	_fx = fx
	_tex = tex
	_on_tap = on_tap


## top / bottom 是气泡场在舞台上的上下边界；intro 时气泡成批从上方落下
func build(lv: LevelData, s: GameState, top: float, bottom: float, intro: bool) -> void:
	_top = top
	var avail: float = bottom - top
	var field_w: float = minf(_fx.width, avail / LevelGen.FIELD_H)
	var origin := Vector2(
		(_fx.width - field_w) / 2.0, top + (avail - field_w * LevelGen.FIELD_H) / 2.0
	)
	_bubbles.clear()
	_held.clear()
	_deferred.clear()
	var centers: Array[Vector2] = []
	var radii: Array[float] = []
	var covered: bool = false
	for d: Dictionary in lv.bubbles:
		radii.append(float(d["r"]) * field_w)
		centers.append(origin + Vector2(d["x"], d["y"]) * field_w)
		covered = covered or not (d["under"] as Array).is_empty()
	# 没有遮挡关系的关卡（平铺、掉落）：把气泡放大到铺满场地，再推开到互不重叠。
	# 有遮挡的关卡重叠是规则的一部分，保持原样
	if not covered:
		var on_field: int = lv.field_cap if lv.field_cap > 0 else radii.size()
		_fit(centers, radii, mini(on_field, radii.size()), Rect2(0, top, _fx.width, avail))
	for idx: int in lv.bubbles.size():
		_bubbles.append(_make_bubble(lv.bubbles[idx], centers[idx], radii[idx]))
	_return_box = _fx.put(Control.new(), Vector2.ZERO)
	_return_box.z_index = 20
	_return_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	refresh(s, false)
	if intro:
		_intro(s)


## 放大气泡让开局在场的 n 个占掉场地的 fill 比例，然后迭代推开重叠、收回边界内
func _fit(centers: Array[Vector2], radii: Array[float], n: int, area: Rect2) -> void:
	var cfg: Dictionary = GameCfg.d()["field"]
	var sum: float = 0.0
	for i: int in n:
		sum += PI * radii[i] * radii[i]
	if sum <= 0.0:
		return
	var k: float = clampf(
		sqrt(float(cfg["fill"]) * area.size.x * area.size.y / sum), 1.0, float(cfg["maxScale"])
	)
	for i: int in radii.size():
		radii[i] *= k
	var gap: float = float(cfg["gap"])
	for step: int in int(cfg["relaxSteps"]):
		for i: int in n:
			for j: int in range(i + 1, n):
				var delta: Vector2 = centers[j] - centers[i]
				var dist: float = delta.length()
				var need: float = radii[i] + radii[j] + gap
				if dist >= need:
					continue
				# 圆心重合时按下标给一个固定方向，结果可复现
				var dir: Vector2 = delta / dist if dist > 0.01 else Vector2.from_angle(i * 2.4)
				var push: Vector2 = dir * (need - dist) * 0.5
				centers[i] -= push
				centers[j] += push
		for i: int in n:
			var m: float = radii[i] + gap
			centers[i].x = clampf(centers[i].x, area.position.x + m, area.end.x - m)
			centers[i].y = clampf(centers[i].y, area.position.y + m, area.end.y - m)


func _make_bubble(d: Dictionary, center: Vector2, r: float) -> Dictionary:
	var node := Control.new()
	node.z_index = int(d["layer"]) + 1
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fx.put(node, center)
	# 漂浮动画只动 body：node 的位置由掉落等逻辑控制，两者不能抢同一个属性
	var body := Control.new()
	body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	node.add_child(body)
	var skin := UiKit.icon(BUBBLE, r * 2.0)
	skin.position = -Vector2(r, r)
	skin.modulate.a = 0.8
	body.add_child(skin)
	var n: int = (d["fish"] as Array).size()
	var fs: float = clampf(r * (0.95 if n == 1 else 0.8 if n <= 3 else 0.68), 44.0, 150.0)
	var fish_nodes: Array[TextureRect] = []
	var offsets: Array[Vector2] = []
	for k: int in n:
		var off := Vector2.ZERO
		if n > 1:
			off = Vector2.from_angle(TAU * k / n - PI / 2.0) * r * (0.36 if n == 2 else 0.46)
		var f := UiKit.icon("", fs)
		f.position = off - Vector2(fs, fs) / 2.0
		body.add_child(f)
		# 每条鱼按自己的节奏摆尾
		Anim.wiggle(f, 7.0, randf_range(1.2, 2.0), randf())
		Anim.drift(f, randf_range(3.0, 6.0), randf_range(3.0, 5.0), randf())
		fish_nodes.append(f)
		offsets.append(off)
	# 结伴鱼：两条鱼之间拴一根粉色的绳
	var links: Array = []
	for pair: Array in d.get("pairs", []):
		var a: Vector2 = offsets[int(pair[0])]
		var rope := ColorRect.new()
		rope.color = Color("FF7AB6")
		rope.size = Vector2(a.distance_to(offsets[int(pair[1])]), 8)
		rope.position = a - Vector2(0, 4)
		rope.pivot_offset = Vector2(0, 4)
		rope.rotation = a.angle_to_point(offsets[int(pair[1])])
		rope.mouse_filter = Control.MOUSE_FILTER_IGNORE
		body.add_child(rope)
		body.move_child(rope, 1)
		links.append([rope, int(pair[0]), int(pair[1])])
	var ice := UiKit.icon("res://assets/ui/ice.png", r * 1.5)
	ice.position = -Vector2(r, r) * 0.75
	ice.modulate.a = 0.75
	body.add_child(ice)
	var lock := UiKit.icon("res://assets/ui/lock.png", r * 1.1)
	lock.position = -Vector2(r, r) * 0.55
	body.add_child(lock)
	var lock_n := UiKit.label("", int(r * 0.5))
	lock_n.position = Vector2(-r * 0.5, -r * 0.1)
	lock_n.size = Vector2(r * 0.8, r * 0.6)
	body.add_child(lock_n)
	# 气泡轻轻上下漂
	Anim.bob(body, randf_range(3.0, 6.0), randf_range(2.4, 3.6), randf())
	return {
		"node": node,
		"fish": fish_nodes,
		"links": links,
		"offsets": offsets,
		"home": center,
		"r": r,
		"fs": fs,
		"ice": ice,
		"lock": lock,
		"lock_n": lock_n,
		"open": false,
	}


## 开局：场上的气泡从下往上分批落下，落地轻弹
func _intro(s: GameState) -> void:
	var cfg: Dictionary = GameCfg.d()["intro"]
	var order: Array[int] = []
	for b: int in _bubbles.size():
		if s.bubbles[b].on_field and s.bubbles[b].count() > 0:
			order.append(b)
	order.sort_custom(
		func(a: int, b: int) -> bool:
			return (_bubbles[a]["home"] as Vector2).y > (_bubbles[b]["home"] as Vector2).y
	)
	var per: int = maxi(1, int(cfg["batchSize"]))
	var fall: float = GameCfg.num("drop", "fallSeconds")
	for rank: int in order.size():
		var batch: int = rank / per
		var delay: float = (
			float(cfg["startDelay"]) + batch * float(cfg["batchGap"]) + (rank % per) * 0.03
		)
		var view: Dictionary = _bubbles[order[rank]]
		var node: Control = view["node"]
		var home: Vector2 = view["home"]
		node.position.y = -float(view["r"]) - 40.0
		var land: Callable = Callable()
		if rank % per == 0:
			land = Audio.sfx.bind(&"land", 0.9 + 0.06 * batch)
		_fx.fall_in(node, home.y, delay, fall, land)


func _visible(b: int) -> bool:
	return (_bubbles[b]["node"] as Control).visible


## 气泡 b 现在画在哪（落下途中也是真实位置）
func center(b: int) -> Vector2:
	return (_bubbles[b]["node"] as Control).position


func radius(b: int) -> float:
	return _bubbles[b]["r"]


func fish_pos(b: int, k: int) -> Vector2:
	if b == GameState.RETURN_BUBBLE:
		return return_pos(k)
	return center(b) + (_bubbles[b]["offsets"] as Array[Vector2])[k]


## 渔网捞鱼的出发点：还在候场队列里的气泡没有画面，鱼从屏幕上方飞进来
func source_pos(b: int, k: int) -> Vector2:
	if b != GameState.RETURN_BUBBLE and not _visible(b):
		return Vector2((_bubbles[b]["home"] as Vector2).x, -40.0)
	return fish_pos(b, k)


func return_pos(k: int) -> Vector2:
	return Vector2(52 + (k % 8) * 90, _top + 46 + (k / 8) * 88)


func refresh(s: GameState, animate: bool = true) -> void:
	var open: Array[int] = Rules.open_bubbles(s)
	for b: int in _bubbles.size():
		var view: Dictionary = _bubbles[b]
		var bub: GameState.Bubble = s.bubbles[b]
		var node: Control = view["node"]
		var waiting: bool = _holds(b)
		node.visible = ((bub.count() > 0 and bub.on_field) or waiting) and not _deferred.has(b)
		if not node.visible:
			continue
		var is_open: bool = open.has(b) or waiting
		if is_open and not view["open"] and animate:
			# 刚露出来：由暗变亮并鼓一下
			node.create_tween().tween_property(node, "modulate", Color.WHITE, 0.3)
			Anim.bounce(node, 1.1, 0.3)
		else:
			node.modulate = Color.WHITE if is_open else DIM
		view["open"] = is_open
		var fish_nodes: Array[TextureRect] = view["fish"]
		for k: int in fish_nodes.size():
			var f: TextureRect = fish_nodes[k]
			f.visible = bub.fish[k] >= 0 or _held.has(b * 100 + k)
			if bub.fish[k] >= 0:
				f.texture = _tex.call(bub.fish[k])
				# 迷雾泡：被挡住时只露剪影
				f.modulate = SILHOUETTE if bub.fog and not is_open else Color.WHITE
		for link: Array in view["links"]:
			(link[0] as Control).visible = bub.fish[link[1]] >= 0 and bub.fish[link[2]] >= 0
		(view["ice"] as Control).visible = bub.frozen
		(view["lock"] as Control).visible = bub.chain > 0
		(view["lock_n"] as Label).visible = bub.chain > 0
		(view["lock_n"] as Label).text = str(bub.chain)
	_refresh_return(s)


func _holds(b: int) -> bool:
	for key: int in _held:
		if key / 100 == b:
			return true
	return false


## 洋流：这条鱼逻辑上已经进缸了，但画面上先留在气泡里等轮到它
func hold(b: int, k: int, species: int) -> void:
	if b < 0:
		return
	_held[b * 100 + k] = true
	# 候场的气泡还没刷新过贴图，这里补上
	((_bubbles[b]["fish"] as Array[TextureRect])[k]).texture = _tex.call(species)


func release(b: int, k: int) -> void:
	_held.erase(b * 100 + k)


## 洋流：这个气泡逻辑上已经补落了，画面上等轮到它再落
func defer(b: int) -> void:
	_deferred[b] = true


## 回流位（吹泡吹回来的鱼）：一排可以直接点的小气泡
func _refresh_return(s: GameState) -> void:
	var had: int = _return_box.get_child_count() / 3
	for c: Node in _return_box.get_children():
		c.queue_free()
	for k: int in s.return_fish.size():
		var p: Vector2 = return_pos(k)
		var skin := UiKit.icon(BUBBLE, 84)
		skin.position = p - Vector2(42, 42)
		skin.modulate.a = 0.8
		_return_box.add_child(skin)
		var f := UiKit.icon("", 60)
		f.texture = _tex.call(s.return_fish[k])
		f.position = p - Vector2(30, 30)
		_return_box.add_child(f)
		var hot := UiKit.hotspot(p - Vector2(42, 42), Vector2(84, 84))
		hot.pressed.connect(_on_tap.bind(GameState.RETURN_BUBBLE, k))
		_return_box.add_child(hot)
		if k >= had:
			Anim.pop_in(skin, 0.04 * (k - had))
			Anim.pop_in(f, 0.04 * (k - had))


## 点在 p：返回 [气泡, 鱼]；没点中能点的鱼则返回 [-1, -1]
func pick(s: GameState, p: Vector2) -> Array[int]:
	var best: Array[int] = [-1, -1]
	var best_d: float = INF
	for b: int in Rules.open_bubbles(s):
		var view: Dictionary = _bubbles[b]
		for k: int in s.bubbles[b].fish.size():
			if s.bubbles[b].fish[k] < 0:
				continue
			var d: float = p.distance_to(fish_pos(b, k))
			if d < float(view["fs"]) * 0.62 and d < best_d:
				best_d = d
				best = [b, k]
	return best


## 点到了不能点的气泡：晃一下提示。返回是否点到了
func reject(s: GameState, p: Vector2) -> bool:
	var top: int = -1
	for b: int in _bubbles.size():
		var live: bool = s.bubbles[b].count() > 0 and s.bubbles[b].on_field
		if live and p.distance_to(center(b)) < radius(b):
			var z: int = (_bubbles[b]["node"] as Control).z_index
			if top < 0 or z > (_bubbles[top]["node"] as Control).z_index:
				top = b
	if top < 0 or Rules.is_open(s, top):
		return false
	Anim.shake(_bubbles[top]["node"])
	Audio.sfx(&"error")
	return true


## 气泡破裂：碎成小泡沫，旁边的气泡被震得晃一下
func pop(b: int) -> void:
	var c: Vector2 = center(b)
	var r: float = radius(b)
	_fx.pop(c, r)
	for i: int in _bubbles.size():
		var near: bool = c.distance_to(center(i)) < r + radius(i) + 30.0
		if i != b and near and _visible(i):
			Anim.bounce(_bubbles[i]["node"], 1.05, 0.25)


## 掉落关：新气泡从屏幕上方落到刚空出来的位置，落地轻弹，把周围的气泡挤开一点
func drop_in(b: int, freed: int) -> void:
	_deferred.erase(b)
	var view: Dictionary = _bubbles[b]
	var node: Control = view["node"]
	if freed >= 0:
		view["home"] = _bubbles[freed]["home"]
	var home: Vector2 = view["home"]
	node.position = Vector2(home.x, -radius(b) - 40.0)
	var cfg: Dictionary = GameCfg.d()["drop"]
	_fx.fall_in(node, home.y, float(cfg["delay"]), float(cfg["fallSeconds"]), _landed.bind(b))


func _landed(b: int) -> void:
	var c: Vector2 = _bubbles[b]["home"]
	var push: float = GameCfg.num("drop", "nudge")
	Audio.sfx(&"land", randf_range(0.95, 1.1))
	_fx.ring_small(c + Vector2(0, radius(b) * 0.8))
	for i: int in _bubbles.size():
		if i == b or not _visible(i):
			continue
		var home: Vector2 = _bubbles[i]["home"]
		if c.distance_to(home) > radius(b) + radius(i) + 36.0:
			continue
		# 被挤开再回到原位；只有已经停稳的气泡才参与，免得和它自己的下落抢位置
		var node: Control = _bubbles[i]["node"]
		if not node.position.is_equal_approx(home):
			continue
		var dir: Vector2 = (home - c).normalized() if home != c else Vector2.UP
		var tw: Tween = node.create_tween()
		tw.tween_property(node, "position", home + dir * push, 0.09).set_ease(Tween.EASE_OUT)
		tw.tween_property(node, "position", home, 0.26).set_trans(Tween.TRANS_BACK).set_ease(
			Tween.EASE_OUT
		)


## 锁或冰块从气泡上脱落
func shed(path: String, b: int) -> void:
	_fx.drop(path, center(b), radius(b))


## 洗牌：每个气泡转一圈，把换鱼的瞬间盖过去
func spin_all() -> void:
	for view: Dictionary in _bubbles:
		var node: Control = view["node"]
		node.rotation = -TAU
		node.scale = Vector2(0.5, 0.5)
		var tw: Tween = node.create_tween().set_parallel()
		tw.tween_property(node, "rotation", 0.0, 0.5).set_ease(Tween.EASE_OUT)
		tw.tween_property(node, "scale", Vector2.ONE, 0.5).set_trans(Tween.TRANS_BACK)
