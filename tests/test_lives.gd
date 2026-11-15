extends TestCase

const T0 := 1_000_000


static func _cfg(name: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string("res://config/%s.json" % name))


func _fresh() -> Array:
	var eco := _cfg("economy")
	return [PlayerData.create(eco), eco]


func test_lives_regen_one_per_20_minutes() -> void:
	var p := _fresh()
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	eq(Lives.count(save, eco, T0), 5, "新档满命")
	ok(Lives.lose(save, eco, 10, true, T0), "第 10 关失败扣命")
	ok(Lives.lose(save, eco, 10, true, T0 + 10), "再扣")
	eq(Lives.count(save, eco, T0 + 10), 3, "扣了两条")
	eq(Lives.seconds_to_next(save, eco, T0 + 600), 600, "10 分钟后还差 10 分钟")
	eq(Lives.count(save, eco, T0 + 1199), 3, "不到 20 分钟不恢复")
	eq(Lives.count(save, eco, T0 + 1200), 4, "满 20 分钟 +1")
	eq(Lives.count(save, eco, T0 + 1200 + 1199), 4, "计时从上一次恢复点接着算")
	eq(Lives.count(save, eco, T0 + 100 * 3600), 5, "离线很久只恢复到上限")
	eq(Lives.seconds_to_next(save, eco, T0 + 100 * 3600), 0, "满命没有倒计时")


func test_lives_regen_across_partial_jump() -> void:
	var p := _fresh()
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	for i: int in 5:
		Lives.lose(save, eco, 10, true, T0)
	eq(Lives.count(save, eco, T0), 0, "扣光")
	ok(not Lives.can_start(save, eco, 10, T0), "没命不能开始")
	ok(Lives.can_start(save, eco, 5, T0), "第 1–5 关不看命")
	eq(Lives.count(save, eco, T0 + 3 * 1200 + 5), 3, "跳过 3 个周期恢复 3 条")
	eq(Lives.seconds_to_next(save, eco, T0 + 3 * 1200 + 5), 1195, "余数留着继续算")


func test_lives_clock_going_backwards_does_not_regen() -> void:
	var p := _fresh()
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	Lives.lose(save, eco, 10, true, T0)
	Lives.lose(save, eco, 10, true, T0)
	eq(Lives.count(save, eco, T0 + 600), 3, "10 分钟")
	eq(Lives.count(save, eco, T0 - 7200), 3, "时间倒退 2 小时：不恢复")
	eq(Lives.seconds_to_next(save, eco, T0 - 7200), 600, "已攒的 10 分钟进度保留")
	eq(Lives.count(save, eco, T0 - 7200 + 599), 3, "倒退后正常走")
	eq(Lives.count(save, eco, T0 - 7200 + 600), 4, "再满 10 分钟才 +1")


func test_lives_no_loss_cases() -> void:
	var p := _fresh()
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	ok(not Lives.lose(save, eco, 5, true, T0), "第 5 关以内不扣")
	ok(not Lives.lose(save, eco, 20, false, T0), "一步没动不扣")
	eq(Lives.count(save, eco, T0), 5, "仍是满命")
	Lives.grant_unlimited(save, 600, T0)
	ok(not Lives.lose(save, eco, 20, true, T0 + 599), "无限生命期间不扣")
	ok(Lives.is_unlimited(save, T0 + 599), "窗口内")
	ok(not Lives.is_unlimited(save, T0 + 600), "窗口过期")
	ok(Lives.lose(save, eco, 20, true, T0 + 600), "过期后照常扣")
	Lives.grant_unlimited(save, 900, T0 + 700)
	Lives.grant_unlimited(save, 900, T0 + 800)
	eq(Lives.unlimited_left(save, T0 + 800), 1700, "窗口顺延叠加")


func test_lives_buy() -> void:
	var p := _fresh()
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	save["coins"] = 5000
	ok(not Lives.buy_one(save, eco, T0), "满命不能买")
	for i: int in 3:
		Lives.lose(save, eco, 10, true, T0)
	ok(Lives.buy_one(save, eco, T0), "买 1 条")
	eq(save["coins"], 4800, "200 金币一条")
	eq(Lives.count(save, eco, T0), 3, "2 + 1")
	ok(Lives.buy_refill(save, eco, T0), "补满")
	eq(save["coins"], 4000, "800 金币补满")
	eq(Lives.count(save, eco, T0), 5, "满命")
	save["coins"] = 100
	Lives.lose(save, eco, 10, true, T0)
	ok(not Lives.buy_one(save, eco, T0), "金币不够")
	eq(save["coins"], 100, "不够不扣")
