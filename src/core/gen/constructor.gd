class_name Constructor
extends RefCounted
## 「按解构造」：一边模拟一条合法打法，一边决定每条鱼的种类。
## 直接调用 Rules 推进，所以锁链、冰封等障碍自动被考虑在内。

const LOOKAHEAD := 6


## base 中待定的鱼用 GameState.UNASSIGNED 标记。不修改 base。
## 返回 { ok, assign: { [气泡, 下标] 的编码: 鱼种 }, taps: [[气泡, 下标], ...] }
static func construct(base: GameState, rng: Rng, slack: int) -> Dictionary:
	var s: GameState = base.clone()
	var assign: Dictionary = {}
	var taps: Array = []
	var future_chance: float = 0.25 + 0.12 * slack
	while s.status == GameState.Status.PLAYING:
		# 回流位里有当前缸要的鱼就先拿
		var took := false
		for k: int in s.return_fish.size():
			if Rules.find_slot(s, s.return_fish[k]) >= 0:
				Rules.tap(s, GameState.RETURN_BUBBLE, k)
				taps.append([GameState.RETURN_BUBBLE, k])
				took = true
				break
		if took:
			continue
		var open: Array[int] = Rules.open_bubbles(s)
		if open.is_empty():
			return {"ok": false}
		var b: int = rng.pick(open)
		var bub: GameState.Bubble = s.bubbles[b]
		var k: int = bub.fish.size() - 1
		while bub.fish[k] == GameState.REMOVED:
			k -= 1
		if bub.fish[k] == GameState.UNASSIGNED:
			var sp: int = -1
			if s.buffer.size() < slack and rng.randf() < future_chance:
				sp = _future_species(s, rng)
			if sp < 0:
				sp = _active_species(s, rng)
			if sp < 0:
				return {"ok": false}
			bub.fish[k] = sp
			assign[key(b, k)] = sp
		Rules.tap(s, b, k)
		taps.append([b, k])
	return {"ok": s.status == GameState.Status.WON, "assign": assign, "taps": taps}


static func key(b: int, k: int) -> int:
	return b * 16 + k


## 当前缸还缺的鱼种（扣掉回流位里已经有的）
static func _active_species(s: GameState, rng: Rng) -> int:
	var cands: Array[int] = []
	for i: int in s.open_slots:
		var bowl: GameState.Bowl = s.slots[i]
		if bowl == null:
			continue
		var need: int = bowl.cap - bowl.count - s.return_fish.count(bowl.species)
		for n: int in need:
			cands.append(bowl.species)
	if cands.is_empty():
		return -1
	return rng.pick(cands)


## 挑一个「稍后才用得上」的鱼种，它会先占暂存槽
static func _future_species(s: GameState, rng: Rng) -> int:
	var active: Dictionary = {}
	for i: int in s.open_slots:
		if s.slots[i] != null:
			active[(s.slots[i] as GameState.Bowl).species] = true
	var seen: Dictionary = {}
	var cands: Array[int] = []
	for j: int in range(s.next_order, mini(s.orders.size(), s.next_order + LOOKAHEAD)):
		var sp: int = s.orders[j]["s"]
		if active.has(sp) or seen.has(sp):
			continue
		seen[sp] = true
		if s.buffer.count(sp) + s.return_fish.count(sp) < int(s.orders[j]["cap"]):
			cands.append(sp)
	if cands.is_empty():
		return -1
	return rng.pick(cands)


## 洗牌道具：场上剩余的鱼重新分布成低难度可解局面。成功返回 true
static func reshuffle(s: GameState, rng: Rng) -> bool:
	var blank: GameState = s.clone()
	for bub: GameState.Bubble in blank.bubbles:
		bub.pairs = []
		for k: int in bub.fish.size():
			if bub.fish[k] != GameState.REMOVED:
				bub.fish[k] = GameState.UNASSIGNED
	for attempt: int in 20:
		var res: Dictionary = construct(blank, rng, 0)
		if res["ok"]:
			var assign: Dictionary = res["assign"]
			for b: int in s.bubbles.size():
				var bub: GameState.Bubble = s.bubbles[b]
				bub.pairs = []
				for k: int in bub.fish.size():
					if bub.fish[k] != GameState.REMOVED:
						bub.fish[k] = assign[key(b, k)]
			return true
	return false
