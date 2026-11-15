extends TestCase


func test_same_seed_same_level() -> void:
	var p: Dictionary = {
		"species": 6, "fish": 60, "layers": 3, "slack": 2, "chain": 1, "timer": 1, "fog": 0.25
	}
	eq(LevelGen.generate(p, 123).to_json(), LevelGen.generate(p, 123).to_json(), "同种子输出一致")


func test_generated_levels_pass_check() -> void:
	var sets: Array = [
		{"species": 3, "fish": 9, "layers": 1, "slack": 0},
		{"species": 6, "fish": 60, "layers": 3, "slack": 2, "chain": 2, "timer": 1},
		{
			"species": 8,
			"fish": 90,
			"layers": 4,
			"slack": 2,
			"chain": 1,
			"ice": 2,
			"big": 1,
			"pairs": 2,
			"fog": 0.3
		},
	]
	for p: Dictionary in sets:
		for seed_value: int in 5:
			var lv: LevelData = LevelGen.generate(p, seed_value + 1)
			ok(lv != null, "能生成 %s" % p)
			if lv != null:
				eq(LevelCheck.errors(lv), [] as Array[String], "生成的关卡通过校验 %s" % p)
				eq(LevelCheck.replay(LevelData.from_json(lv.to_json()))["won"], true, "存取后参考解仍通关")


func test_broken_level_is_rejected() -> void:
	var lv: LevelData = LevelGen.generate({"species": 4, "fish": 24, "layers": 2, "slack": 1}, 7)
	lv.bubbles[0]["fish"][0] = (int(lv.bubbles[0]["fish"][0]) + 1) % 4
	ok(not LevelCheck.errors(lv).is_empty(), "鱼数对不上订单的关卡被拒绝")
