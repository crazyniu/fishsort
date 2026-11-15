class_name LevelCheck
extends RefCounted
## 关卡校验：结构不变量 + 回放参考解证明可解。


## 返回 { won, peak: 暂存峰值, steps: { 订单下标: 该缸在架期间的点击数 } }
static func replay(lv: LevelData) -> Dictionary:
	var s: GameState = GameState.from_level(lv)
	var active: Dictionary = {}
	var steps: Dictionary = {}
	var peak: int = 0
	var events: Array[Dictionary] = Rules.start(s)
	var i: int = 0
	while true:
		for e: Dictionary in events:
			if e["t"] == &"bowl_in":
				active[e["order"]] = 0
			elif e["t"] == &"bowl_done":
				steps[e["order"]] = active[e["order"]]
				active.erase(e["order"])
		peak = maxi(peak, s.buffer.size())
		if i >= lv.ref.size() or s.status != GameState.Status.PLAYING:
			break
		var t: Array = lv.ref[i]
		i += 1
		events = Rules.tap(s, t[0], t[1])
		# 结伴鱼的第二条已被第一条带走时，这一步是空操作
		if not events.is_empty():
			for o: int in active:
				active[o] += 1
	return {"won": s.status == GameState.Status.WON, "peak": peak, "steps": steps}


static func errors(lv: LevelData) -> Array[String]:
	var out: Array[String] = []
	var need: Dictionary = {}
	for o: Dictionary in lv.orders:
		need[o["s"]] = int(need.get(o["s"], 0)) + int(o["cap"])
	var have: Dictionary = {}
	var layer: Dictionary = {}
	for b: Dictionary in lv.bubbles:
		layer[b["id"]] = b["layer"]
	for idx: int in lv.bubbles.size():
		var b: Dictionary = lv.bubbles[idx]
		var fish: Array = b["fish"]
		if b["id"] != idx:
			out.append("气泡 id 与下标不一致: %d" % idx)
		if fish.size() < 1 or fish.size() > LevelGen.MAX_PER_BUBBLE:
			out.append("气泡 %d 的鱼数 %d 不在 1–5" % [idx, fish.size()])
		for f: int in fish:
			if f < 0 or f >= lv.palette:
				out.append("气泡 %d 有非法鱼种 %d" % [idx, f])
			have[f] = int(have.get(f, 0)) + 1
		for u: int in b["under"]:
			if not layer.has(u) or layer[u] >= b["layer"]:
				out.append("气泡 %d 压住了不比它低的气泡 %d" % [idx, u])
		for dep: int in b["ice"]:
			if dep == idx or not layer.has(dep):
				out.append("气泡 %d 的冰封依赖非法" % idx)
			elif not (lv.bubbles[dep]["ice"] as Array).is_empty():
				out.append("气泡 %d 的冰封依赖 %d 自身也被冰封" % [idx, dep])
	if need != have:
		out.append("各鱼种数量与订单容量不一致: 需要 %s 实有 %s" % [need, have])
	if out.is_empty() and not replay(lv)["won"]:
		out.append("参考解回放未通关")
	return out
