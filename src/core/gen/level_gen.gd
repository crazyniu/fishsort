class_name LevelGen
extends RefCounted
## 关卡生成器，见 docs/02-关卡设计.md 第 4 节。

## 气泡场高宽比，与局内界面的场地区域一致
const FIELD_H := 1.1
const MAX_PER_BUBBLE := 5
const ATTEMPTS := 40


## p: { species, fish, layers, slack, chain, timer, fog, ice, big, pairs, challenge }
static func generate(p: Dictionary, seed_value: int) -> LevelData:
	var rng := Rng.new(seed_value)
	for attempt: int in ATTEMPTS:
		# 后一半尝试去掉锁链和冰封，保证总能出关卡
		var lv: LevelData = _attempt(p, rng, attempt >= ATTEMPTS / 2)
		if lv != null:
			lv.level_seed = seed_value
			return lv
	return null


static func _attempt(p: Dictionary, rng: Rng, plain: bool) -> LevelData:
	var lv := LevelData.new()
	var ns: int = p["species"]
	var total: int = p["fish"]
	lv.palette = ns
	lv.challenge = p.get("challenge", false)
	lv.orders = _make_orders(rng, ns, total, p.get("big", 0))
	lv.bubbles = _make_bubbles(rng, total, p["layers"])
	if not plain:
		_add_chain(rng, lv, p.get("chain", 0))
		_add_ice(rng, lv, p.get("ice", 0))
	var fog: float = p.get("fog", 0.0)
	for b: Dictionary in lv.bubbles:
		b["fog"] = fog > 0.0 and b["layer"] < int(p["layers"]) - 1 and rng.randf() < fog

	var s: GameState = GameState.from_level(lv)
	Rules.start(s)
	var res: Dictionary = Constructor.construct(s, rng, p.get("slack", 0))
	if not res["ok"]:
		return null
	var assign: Dictionary = res["assign"]
	for b: int in lv.bubbles.size():
		var fish: Array = lv.bubbles[b]["fish"]
		for k: int in fish.size():
			fish[k] = assign[Constructor.key(b, k)]
	lv.ref = res["taps"]

	_add_pairs(rng, lv, p.get("pairs", 0))
	_add_timers(rng, lv, p.get("timer", 0))
	if not LevelCheck.replay(lv)["won"]:
		return null
	return lv


static func _make_orders(rng: Rng, ns: int, total: int, big: int) -> Array[Dictionary]:
	big = mini(big, (total - 6) / 6)
	var n: int = (total - 6 * big) / 3 + big
	var species: Array[int] = []
	for i: int in n:
		species.append(i % ns)
	# 相邻两个缸尽量不同种
	for attempt: int in 200:
		rng.shuffle(species)
		var ok := true
		for i: int in n - 1:
			if species[i] == species[i + 1]:
				ok = false
				break
		if ok:
			break
	var out: Array[Dictionary] = []
	for i: int in n:
		out.append({"s": species[i], "cap": 3, "timer": 0})
	var placed: int = 0
	while placed < big:
		var i: int = rng.range_i(mini(2, n - 1), n - 1)
		if out[i]["cap"] == 3:
			out[i]["cap"] = 6
			placed += 1
	return out


static func _make_bubbles(rng: Rng, total: int, layers: int) -> Array[Dictionary]:
	var nb: int = clampi(roundi(total / 3.0), ceili(total / float(MAX_PER_BUBBLE)), total)
	var caps: Array[int] = []
	for i: int in nb:
		caps.append(1)
	for i: int in total - nb:
		var room: Array[int] = []
		for j: int in nb:
			if caps[j] < MAX_PER_BUBBLE:
				room.append(j)
		caps[rng.pick(room)] += 1
	var out: Array[Dictionary] = []
	for i: int in nb:
		var layer: int = i * layers / nb
		var r: float = 0.085 + 0.011 * caps[i]
		var x: float = 0.5
		var y: float = 0.5
		for attempt: int in 60:
			x = r + rng.randf() * (1.0 - 2.0 * r)
			y = r + rng.randf() * (FIELD_H - 2.0 * r)
			var clash := false
			for o: Dictionary in out:
				if (
					o["layer"] == layer
					and Vector2(x, y).distance_to(Vector2(o["x"], o["y"])) < (r + o["r"]) * 0.9
				):
					clash = true
					break
			if not clash:
				break
		var fish: Array[int] = []
		for k: int in caps[i]:
			fish.append(GameState.UNASSIGNED)
		var under: Array[int] = []
		for o: Dictionary in out:
			if (
				o["layer"] < layer
				and Vector2(x, y).distance_to(Vector2(o["x"], o["y"])) < (r + o["r"]) * 0.75
			):
				under.append(o["id"])
		(
			out
			. append(
				{
					"id": i,
					"x": snappedf(x, 0.001),
					"y": snappedf(y, 0.001),
					"r": snappedf(r, 0.001),
					"layer": layer,
					"fish": fish,
					"under": under,
					"chain": 0,
					"fog": false,
					"ice": [] as Array[int],
					"pairs": [],
				}
			)
		)
	return out


static func _add_chain(rng: Rng, lv: LevelData, count: int) -> void:
	for i: int in count:
		var b: Dictionary = rng.pick(lv.bubbles)
		if b["chain"] == 0:
			b["chain"] = rng.range_i(1, 2)


static func _add_ice(rng: Rng, lv: LevelData, count: int) -> void:
	var depended: Dictionary = {}
	for i: int in count:
		var b: Dictionary = rng.pick(lv.bubbles)
		if b["chain"] > 0 or not (b["ice"] as Array).is_empty() or depended.has(b["id"]):
			continue
		# 依赖的邻居必须不比自己低、自己没被冰封，否则可能互相等待
		var best: int = -1
		var best_d: float = INF
		for o: Dictionary in lv.bubbles:
			if o["id"] == b["id"] or o["layer"] < b["layer"] or not (o["ice"] as Array).is_empty():
				continue
			var d: float = Vector2(b["x"], b["y"]).distance_to(Vector2(o["x"], o["y"]))
			if d < best_d:
				best_d = d
				best = o["id"]
		if best >= 0:
			(b["ice"] as Array).append(best)
			depended[best] = true


## 参考解里同一个气泡连续被点的两条鱼可以系成结伴鱼，不改变解法
static func _add_pairs(rng: Rng, lv: LevelData, count: int) -> void:
	if count <= 0:
		return
	var cands: Array[int] = []
	for i: int in lv.ref.size() - 1:
		if lv.ref[i][0] >= 0 and lv.ref[i][0] == lv.ref[i + 1][0]:
			cands.append(i)
	rng.shuffle(cands)
	var used: Dictionary = {}
	var added: int = 0
	for i: int in cands:
		if added >= count:
			break
		if used.has(i) or used.has(i + 1):
			continue
		used[i] = true
		used[i + 1] = true
		(lv.bubbles[lv.ref[i][0]]["pairs"] as Array).append([lv.ref[i][1], lv.ref[i + 1][1]])
		added += 1


static func _add_timers(rng: Rng, lv: LevelData, count: int) -> void:
	if count <= 0:
		return
	var steps: Dictionary = LevelCheck.replay(lv)["steps"]
	var cands: Array[int] = []
	for i: int in range(2, lv.orders.size()):
		if steps.get(i, 99) <= 20:
			cands.append(i)
	rng.shuffle(cands)
	for i: int in mini(count, cands.size()):
		var o: int = cands[i]
		lv.orders[o]["timer"] = clampi(int(steps[o]) * 3 + 15, 45, 90)
