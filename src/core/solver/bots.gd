class_name Bots
extends RefCounted
## 用来估计难度的机器人，见 docs/02-关卡设计.md 第 5 节。

const MAX_STEPS := 2000


## kind: "greedy" 或 "random"。slots: 开几个缸位
static func play(lv: LevelData, kind: String, rng: Rng, slots: int) -> bool:
	return _run(lv, kind, rng, slots, [])


## 用贪心机器人找一条 2 缸位、不用道具的通关步骤，找不到返回空数组
static func solve(lv: LevelData, tries: int) -> Array:
	for i: int in tries:
		var taps: Array = []
		if _run(lv, "greedy", Rng.new(i * 104729 + 31), 2, taps):
			return taps
	return []


static func _run(lv: LevelData, kind: String, rng: Rng, slots: int, taps: Array) -> bool:
	var s: GameState = GameState.from_level(lv)
	s.open_slots = slots
	Rules.start(s)
	var guard: int = 0
	while s.status == GameState.Status.PLAYING and guard < MAX_STEPS:
		guard += 1
		var opts: Array = []
		for k: int in s.return_fish.size():
			opts.append([GameState.RETURN_BUBBLE, k, s.return_fish[k], 1])
		for b: int in Rules.open_bubbles(s):
			var bub: GameState.Bubble = s.bubbles[b]
			var left: int = bub.count()
			for k: int in bub.fish.size():
				if bub.fish[k] >= 0:
					opts.append([b, k, bub.fish[k], left])
		if opts.is_empty():
			break
		var choice: Array = rng.pick(opts) if kind == "random" else _greedy(s, opts, rng)
		taps.append([choice[0], choice[1]])
		Rules.tap(s, choice[0], choice[1])
	return s.status == GameState.Status.WON


## 有目标鱼就点（优先快要破的泡），否则点最快用得上的鱼。同分时随机挑，
## 这样同一关多跑几局能得到胜率而不是非 0 即 100
static func _greedy(s: GameState, opts: Array, rng: Rng) -> Array:
	var best: Array = []
	var best_score: int = 1 << 60
	for o: Array in opts:
		var sp: int = o[2]
		var score: int
		if Rules.find_slot(s, sp) >= 0:
			score = o[3]
		else:
			var soon: int = 99
			for j: int in range(s.next_order, s.orders.size()):
				if s.orders[j]["s"] == sp:
					soon = j - s.next_order
					break
			score = 1000 + (0 if s.buffer.has(sp) else 10000) + soon * 10 + int(o[3])
		if score < best_score:
			best_score = score
			best = [o]
		elif score == best_score:
			best.append(o)
	return rng.pick(best)


## 胜率百分比
static func rate(lv: LevelData, kind: String, slots: int, runs: int) -> int:
	var wins: int = 0
	for i: int in runs:
		if play(lv, kind, Rng.new(i * 7919 + 13), slots):
			wins += 1
	return wins * 100 / runs
