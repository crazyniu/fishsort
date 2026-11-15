extends TestCase
## 掉落关：见 docs/01-玩法设计.md 第 2.5 节。

const WON := GameState.Status.WON
const PLAYING := GameState.Status.PLAYING


func _drop_level(orders: Array, bubbles: Array, cap: int) -> GameState:
	var lv: LevelData = level(orders, bubbles)
	lv.field_cap = cap
	return play(lv)


func _types(events: Array[Dictionary]) -> Array:
	var out: Array = []
	for e: Dictionary in events:
		out.append(e["t"])
	return out


func test_only_first_cap_bubbles_start_on_field() -> void:
	var s := _drop_level(
		[0, 1, 2], [{"fish": [0, 0, 0]}, {"fish": [1, 1, 1]}, {"fish": [2, 2, 2]}], 2
	)
	eq(Rules.open_bubbles(s), [0, 1] as Array[int], "开局只有前 2 个气泡在场")
	ok(not Rules.is_open(s, 2), "候场的气泡不能点")
	ok(Rules.tap(s, 2, 0).is_empty(), "点候场气泡里的鱼无效")
	eq(s.queued_count(), 1, "候场 1 个")


func test_pop_brings_next_bubble_in_order() -> void:
	var s := _drop_level(
		[0, 1, 2, 3],
		[{"fish": [0, 0, 0]}, {"fish": [1, 1, 1]}, {"fish": [2, 2, 2]}, {"fish": [3, 3, 3]}],
		2
	)
	Rules.tap(s, 0, 0)
	Rules.tap(s, 0, 1)
	var ev: Array[Dictionary] = Rules.tap(s, 0, 2)
	ok(_types(ev).has(&"bubble_drop"), "破泡后发出落下事件")
	eq(Rules.open_bubbles(s), [1, 2] as Array[int], "队头的 2 号气泡落下，3 号还在候场")
	ok(not Rules.is_open(s, 3), "队列按顺序落下")


func test_win_needs_empty_queue() -> void:
	var s := _drop_level([0, 1], [{"fish": [0, 0, 0]}, {"fish": [1, 1, 1]}], 1)
	for k: int in 3:
		Rules.tap(s, 0, k)
	eq(s.status, PLAYING, "场上清空但候场还有鱼，不算过关")
	for k: int in 3:
		Rules.tap(s, 1, k)
	eq(s.status, WON, "候场的也救完才过关")


func test_net_reaches_queue_without_dropping() -> void:
	var s := _drop_level([0, 1], [{"fish": [1, 1, 1]}, {"fish": [0, 0, 0]}], 1)
	var ev: Array[Dictionary] = Rules.use_net(s, 0)
	eq(s.bowls_done, 1, "渔网捞到候场气泡里的鱼")
	ok(not _types(ev).has(&"bubble_pop"), "候场气泡被捞空不发破裂事件")
	eq(Rules.open_bubbles(s), [0] as Array[int], "场上的气泡没变")
	for k: int in 3:
		Rules.tap(s, 0, k)
	eq(s.status, WON, "被捞空的候场气泡不会再落下，直接过关")


func test_generated_drop_level_is_valid_and_repeatable() -> void:
	var p: Dictionary = {
		"species": 6,
		"fish": 60,
		"layers": 1,
		"slack": 1,
		"cap": 8,
		"per_min": 2,
		"per_max": 4,
		"scramble": 12
	}
	var a: LevelData = LevelGen.generate(p, 4242)
	var b: LevelData = LevelGen.generate(p, 4242)
	ok(a != null, "能生成掉落关")
	if a == null:
		return
	eq(a.field_cap, 8, "场上容量写入关卡")
	eq(LevelCheck.errors(a), [] as Array[String], "生成的掉落关通过校验")
	eq(a.to_json(), b.to_json(), "同种子生成相同的掉落关")
