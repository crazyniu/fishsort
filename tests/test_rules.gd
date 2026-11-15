extends TestCase

const WON := GameState.Status.WON
const LOST := GameState.Status.LOST
const PLAYING := GameState.Status.PLAYING


func test_target_fish_goes_to_bowl_others_to_buffer() -> void:
	var s := play(level([0, 1, 2], [{"fish": [0, 2, 0, 0, 1]}, {"fish": [1, 1, 2, 2]}]))
	Rules.tap(s, 0, 0)
	eq((s.slots[0] as GameState.Bowl).count, 1, "目标鱼进缸")
	Rules.tap(s, 0, 1)
	eq(s.buffer, [2] as Array[int], "非目标鱼进暂存槽")


func test_full_bowl_brings_next_and_buffer_chains() -> void:
	var s := play(level([0, 1, 2], [{"fish": [2, 2, 0, 0, 0]}, {"fish": [1, 1, 1, 2]}]))
	Rules.tap(s, 0, 0)
	Rules.tap(s, 0, 1)
	for k: int in [2, 3, 4]:
		Rules.tap(s, 0, k)
	eq(s.bowls_done, 1, "满 3 条送走")
	eq(s.buffer.size(), 0, "新缸出现后暂存槽的鱼自动入缸")
	eq((s.slots[0] as GameState.Bowl).species, 2, "空位补上队列里的下一个缸")
	eq((s.slots[0] as GameState.Bowl).count, 2, "两条暂存鱼都进了新缸")


func test_win_when_everything_rescued() -> void:
	var s := play(level([0], [{"fish": [0, 0, 0]}]))
	for k: int in 3:
		Rules.tap(s, 0, k)
	eq(s.status, WON, "救完即胜利")


func test_covered_bubble_opens_after_pop() -> void:
	var s := play(
		level([0, 1], [{"fish": [1, 1, 1]}, {"fish": [0, 0, 0], "under": [0], "layer": 1}])
	)
	ok(not Rules.is_open(s, 0), "被压住的气泡不能点")
	ok(Rules.tap(s, 0, 0).is_empty(), "点被压住的鱼无效")
	for k: int in 3:
		Rules.tap(s, 1, k)
	ok(Rules.is_open(s, 0), "上层破裂后下层开放")


func test_buffer_full_loses_and_revive_blows_back() -> void:
	var s := play(
		level([0, 1, 2], [{"fish": [2, 2, 2]}, {"fish": [0, 0, 0, 1]}, {"fish": [1, 1]}], 3)
	)
	for k: int in 3:
		Rules.tap(s, 0, k)
	eq(s.status, LOST, "暂存槽满即失败")
	eq(s.lose_reason, GameState.LoseReason.BUFFER_FULL, "失败原因")
	Rules.revive(s)
	eq(s.status, PLAYING, "复活后继续")
	eq(s.return_fish.size(), 3, "复活把暂存鱼吹回回流位")
	ok(Rules.revive(s).is_empty(), "每关只能复活一次")
	Rules.tap(s, GameState.RETURN_BUBBLE, 0)
	eq(s.buffer.size(), 1, "回流位的鱼可以再点")


func test_chain_unlocks_after_bowls_done() -> void:
	var s := play(level([0, 1], [{"fish": [0, 0, 0]}, {"fish": [1, 1, 1], "chain": 1}]))
	ok(not Rules.is_open(s, 1), "锁链泡不能点")
	for k: int in 3:
		Rules.tap(s, 0, k)
	ok(Rules.is_open(s, 1), "完成 1 个缸后解锁")


func test_ice_melts_when_neighbour_pops() -> void:
	var s := play(level([0, 1], [{"fish": [0, 0, 0]}, {"fish": [1, 1, 1], "ice": [0]}]))
	ok(not Rules.is_open(s, 1), "冰封泡不能点")
	for k: int in 3:
		Rules.tap(s, 0, k)
	ok(Rules.is_open(s, 1), "邻居破裂后解冻")


func test_stuck_loses_and_revive_frees() -> void:
	var s := play(level([0, 1, 1], [{"fish": [0, 0, 1]}, {"fish": [0, 1, 1, 1, 1, 1], "chain": 3}]))
	for k: int in 3:
		Rules.tap(s, 0, k)
	eq(s.lose_reason, GameState.LoseReason.STUCK, "无鱼可点判负")
	Rules.revive(s)
	ok(Rules.is_open(s, 1), "复活解开锁链")


func test_pair_takes_both_fish() -> void:
	var s := play(level([0, 1], [{"fish": [0, 1, 0, 0, 1, 1], "pairs": [[0, 1]]}]))
	Rules.tap(s, 0, 0)
	eq(s.bubbles[0].count(), 4, "结伴鱼一起走")
	eq((s.slots[1] as GameState.Bowl).count, 1, "第二条各自结算去向")


func test_timer_expires_and_revive_adds_time() -> void:
	var s := play(level([{"s": 0, "timer": 10}], [{"fish": [0, 0, 0]}]))
	Rules.tick(s, 9.0)
	eq(s.status, PLAYING, "未到时不失败")
	Rules.tick(s, 2.0)
	eq(s.lose_reason, GameState.LoseReason.TIMEOUT, "超时失败")
	Rules.revive(s)
	eq((s.slots[0] as GameState.Bowl).timer, Rules.REVIVE_EXTRA_SECONDS, "复活加时")


func test_unlock_bowl_pulls_next_order() -> void:
	var s := play(level([0, 1, 2], [{"fish": [0, 0, 0, 1, 1]}, {"fish": [1, 2, 2, 2]}]))
	eq(s.slots[2], null, "第 3 缸位默认关闭")
	Rules.unlock_bowl(s)
	eq((s.slots[2] as GameState.Bowl).species, 2, "开启后立即上缸")


func test_net_fills_bowl_from_covered_bubbles() -> void:
	var s := play(
		level([0, 1], [{"fish": [0, 0, 0]}, {"fish": [1, 1, 1], "under": [0], "layer": 1}])
	)
	Rules.use_net(s, 0)
	eq(s.bowls_done, 1, "渔网捞出被压住的鱼并补满")
	eq(s.bubbles[0].count(), 0, "被捞空的气泡破裂")


func test_blow_moves_buffer_to_return_slot() -> void:
	var s := play(level([0, 1, 2], [{"fish": [2, 2, 0, 0, 0]}, {"fish": [1, 1, 1, 2]}]))
	Rules.tap(s, 0, 0)
	Rules.tap(s, 0, 1)
	Rules.use_blow(s)
	eq(s.buffer.size(), 0, "暂存槽清空")
	eq(s.return_fish, [2, 2] as Array[int], "鱼回到回流位")


func test_shuffle_keeps_counts_and_stays_solvable() -> void:
	var lv: LevelData = LevelGen.generate({"species": 6, "fish": 60, "layers": 3, "slack": 2}, 42)
	var s := play(lv)
	# 先乱点几步制造一个中途局面
	var rng := Rng.new(5)
	for i: int in 12:
		var b: int = rng.pick(Rules.open_bubbles(s))
		for k: int in s.bubbles[b].fish.size():
			if s.bubbles[b].fish[k] >= 0:
				Rules.tap(s, b, k)
				break
	if s.status != PLAYING:
		return
	var before: Dictionary = _counts(s)
	ok(not Rules.use_shuffle(s, 99).is_empty(), "洗牌成功")
	eq(_counts(s), before, "各鱼种数量不变")
	var blank: GameState = s.clone()
	ok(Constructor.construct(blank, Rng.new(1), 0)["ok"], "洗牌后仍可解")


func _counts(s: GameState) -> Dictionary:
	var c: Dictionary = {}
	for bub: GameState.Bubble in s.bubbles:
		for f: int in bub.fish:
			if f >= 0:
				c[f] = int(c.get(f, 0)) + 1
	return c
