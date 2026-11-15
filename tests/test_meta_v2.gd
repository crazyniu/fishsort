extends TestCase

const NOW := 3_000_000


static func _cfg(name: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string("res://config/%s.json" % name))


func _setup(level: int = 20) -> Array:
	var eco := _cfg("economy")
	var save := PlayerData.create(eco)
	save["level"] = level
	return [save, eco, _cfg("species")["species"]]


func test_current_skill_chains_through_new_bowls() -> void:
	var s := play(
		level(
			[0, 1, 2],
			[{"fish": [2, 2, 2]}, {"fish": [0, 0, 0]}, {"fish": [1, 1, 1]}, {"fish": [3, 3, 3]}]
		)
	)
	var ev := Rules.use_current(s)
	var to_bowl: int = (
		ev.filter(func(e: Dictionary) -> bool: return e["t"] == &"fish_to_bowl").size()
	)
	eq(to_bowl, 9, "9 条鱼逐条入缸，事件和普通点击一样")
	eq(s.bowls_done, 3, "三个缸依次完成，新缸出现后继续")
	eq(s.status, GameState.Status.PLAYING, "还剩一个没人要的气泡，不判胜")
	eq(s.bubbles[3].count(), 3, "没人要的鱼原地不动")
	eq(s.buffer.size(), 0, "洋流不会把鱼送进暂存槽")
	eq(Rules.use_current(s), [] as Array[Dictionary], "再用没有可入缸的鱼，返回空")


func test_current_wins_when_everything_fits() -> void:
	var s := play(level([0, 1], [{"fish": [0, 1, 0]}, {"fish": [1, 0, 1]}]))
	var ev := Rules.use_current(s)
	eq(s.status, GameState.Status.WON, "全部入缸即过关")
	ok(ev.any(func(e: Dictionary) -> bool: return e["t"] == &"win"), "事件里有 win")
	eq(Rules.apply(s, {"a": "current"}), [] as Array[Dictionary], "apply 入口可用，结束后无事件")


func test_skills_unlock_grant_free_use_and_limits() -> void:
	var p := _setup(1)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	eq(Skills.try_use(save, eco, "shuffle", 0, 5)["reason"], "locked", "第 1 关没解锁")
	save["level"] = 4
	eq(Skills.sync_unlocks(save, eco), ["shuffle"] as Array[String], "第 4 关解锁洗牌")
	eq(Skills.count(save, "shuffle"), 2, "解锁送 2 个")
	eq(Skills.sync_unlocks(save, eco), [] as Array[String], "只送一次")
	save["level"] = 12
	eq(Skills.sync_unlocks(save, eco).size(), 3, "7 / 9 / 12 一起补发")
	eq(Skills.count(save, "current"), 2, "洋流 2 个")
	var r: Dictionary = Skills.try_use(save, eco, "shuffle", 0, 5)
	ok(r["ok"] and r["free"], "今天第一次免费")
	eq(Skills.count(save, "shuffle"), 2, "免费不扣库存")
	r = Skills.try_use(save, eco, "shuffle", 1, 5)
	ok(r["ok"] and not r["free"], "第二次扣库存")
	eq(Skills.count(save, "shuffle"), 1, "扣 1")
	eq(Skills.try_use(save, eco, "shuffle", 2, 5)["reason"], "limit", "每关最多 2 次")
	r = Skills.try_use(save, eco, "shuffle", 0, 6)
	ok(r["free"], "第二天免费次刷新")
	save["tools"]["blow"] = 0
	Skills.try_use(save, eco, "blow", 0, 6)
	eq(Skills.try_use(save, eco, "blow", 1, 6)["reason"], "empty", "没库存")
	save["coins"] = 1200
	ok(Skills.buy(save, eco, "current"), "买洋流")
	eq(save["coins"], 0, "洋流 1200 金币")
	for pair: Array in [["shuffle", 500], ["blow", 600], ["net", 900]]:
		eq(Skills.price(eco, pair[0]), pair[1], "技能价 %s" % pair[0])
	eq(Features.unlock_level(eco, "skill_current"), 12, "洋流 12 关解锁")


func test_features_table() -> void:
	var eco: Dictionary = _setup()[1]
	var want := {"signin": 3, "levelSelect": 5, "album": 6, "wheel": 8, "rank": 11}
	for f: String in want:
		ok(not Features.is_unlocked(eco, f, want[f] - 1), "%s 前一关未开" % f)
		ok(Features.is_unlocked(eco, f, want[f]), "%s 当关开放" % f)
	eq(
		Features.newly_unlocked(eco, 2, 6),
		["signin", "skill_shuffle", "levelSelect", "album"],
		"2→6"
	)


func test_settle_win_rewards_progress_and_first_win() -> void:
	var p := _setup(3)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	var r: Dictionary = Settle.win(
		save,
		eco,
		{"level": 3, "challenge": false, "day": 7, "now": NOW, "combo_coins": 155, "best_combo": 15}
	)
	eq(r["coins_base"], 100, "过关 100")
	eq(r["coins_best"], 150, "最高连击奖 15 × 10")
	eq(r["coins"], 100 + 155 + 150, "合计")
	eq(save["coins"], r["coins"], "已入账")
	eq(save["level"], 4, "进度推进")
	ok(r["first_win"] and r["wheel_spin"], "首胜给抽奖 +1")
	eq(save["wheel"]["extra"], 1, "抽奖次数")
	ok(
		Lives.is_unlimited(save, NOW + 599) and not Lives.is_unlimited(save, NOW + 600),
		"首胜无限生命 10 分钟"
	)
	eq(r["new_features"], ["skill_shuffle"], "第 4 关开放洗牌")
	eq(r["new_skills"], ["shuffle"] as Array[String], "并送 2 个")
	r = Settle.win(
		save, eco, {"level": 4, "challenge": true, "day": 7, "now": NOW, "best_combo": 40}
	)
	eq(r["coins_base"], 200, "挑战关 200")
	eq(r["coins_best"], 200, "最高连击奖封顶 200")
	ok(not r["first_win"], "同一天只有一次首胜")
	eq(save["week"]["cleared"], 2, "周过关数")


func test_replay_rewards_first_five_per_day() -> void:
	var p := _setup(30)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	for i: int in 5:
		var r: Dictionary = Settle.win(
			save, eco, {"level": 10, "challenge": false, "day": 4, "now": NOW}
		)
		ok(r["replay"] and r["rewarded"] and r["chest_ok"], "第 %d 次重玩有奖" % (i + 1))
		eq(r["coins_base"], 100, "重玩给金币")
	var r6: Dictionary = Settle.win(
		save, eco, {"level": 10, "challenge": false, "day": 4, "now": NOW}
	)
	ok(not r6["rewarded"] and not r6["chest_ok"] and r6["coins"] == 0, "第 6 次不给奖")
	eq(save["level"], 30, "重玩不改进度")
	var r7: Dictionary = Settle.win(
		save, eco, {"level": 10, "challenge": false, "day": 5, "now": NOW}
	)
	ok(r7["rewarded"], "第二天重新计")


func test_share_caps_and_rewards() -> void:
	var p := _setup(30)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	var rng := Rng.new(1)
	for i: int in 5:
		Lives.lose(save, eco, 20, true, NOW)
	for i: int in 3:
		eq(Share.claim(save, eco, "life", 9, NOW, rng)["life"], 1, "分享 +1 命")
	eq(Share.claim(save, eco, "life", 9, NOW, rng), {}, "生命分享每天 3 次")
	eq(Lives.count(save, eco, NOW), 3, "加了 3 条")
	eq(Share.remaining(save, eco, "life", 10), 3, "次日重置")
	eq(Share.claim(save, eco, "card", 9, NOW, rng)["coins"], 200, "稀有卡分享 200 金币")
	ok(Share.claim(save, eco, "help", 9, NOW, rng)["skill"] != "", "求助给 1 个技能")
	for i: int in 2:
		Share.claim(save, eco, "help", 9, NOW, rng)
	eq(Share.remaining(save, eco, "help", 9), 0, "求助每天 3 次")


func test_sign_in_seven_days() -> void:
	var p := _setup(30)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	var rng := Rng.new(4)
	var r: Dictionary = SignIn.claim(save, eco, species, rng, 100, NOW)
	eq(r["coins"], 200, "第 1 天 200")
	eq(SignIn.claim(save, eco, species, rng, 100, NOW), {}, "一天一次")
	eq(SignIn.claim(save, eco, species, rng, 101, NOW)["coins"], 300, "第 2 天 300")
	r = SignIn.claim(save, eco, species, rng, 102, NOW)
	eq(r["skills"].size() + r["cards"].size(), 1, "第 3 天宝箱出技能或卡")
	eq(SignIn.claim(save, eco, species, rng, 103, NOW)["coins"], 500, "第 4 天 500")
	eq(SignIn.claim(save, eco, species, rng, 104, NOW)["wheel"], 1, "第 5 天抽奖 +1")
	eq(save["wheel"]["extra"], 1, "存进抽奖次数")
	eq(SignIn.claim(save, eco, species, rng, 105, NOW)["skills"].size(), 1, "第 6 天技能 1 个")
	var coins_before: int = save["coins"]
	r = SignIn.claim(save, eco, species, rng, 110, NOW)
	eq(r["index"], 6, "断签不清零，仍是第 7 天")
	eq(save["coins"] - coins_before, 1000, "第 7 天 1000 金币")
	eq(r["cards"].size(), 1, "大宝箱一张卡")
	ok(Cards.rank(eco, r["cards"][0]["rarity"]) >= 2, "稀有以上")
	ok(Lives.unlimited_left(save, NOW) == 1800, "无限生命 30 分钟")
	eq(SignIn.claim(save, eco, species, rng, 111, NOW)["coins"], 200, "7 天一轮")


func test_sign_in_big_chest_always_rare_plus() -> void:
	var p := _setup(30)
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	var rng := Rng.new(12)
	for i: int in 200:
		var save: Dictionary = PlayerData.create(eco)
		save["level"] = 30
		save["signin"]["count"] = 6
		var r: Dictionary = SignIn.claim(save, eco, species, rng, 50, NOW)
		ok(Cards.rank(eco, r["cards"][0]["rarity"]) >= 2, "大宝箱必稀有以上")


func test_sign_in_ad_doubling() -> void:
	var p := _setup(30)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	var rng := Rng.new(4)
	var r: Dictionary = SignIn.claim(save, eco, species, rng, 100, NOW, true)
	eq(r["coins"], 400, "翻倍")
	eq(save["coins"], 400, "入账 400")
	var r2: Dictionary = SignIn.claim(save, eco, species, rng, 101, NOW)
	var d: Dictionary = SignIn.double_today(save, eco, species, rng, 101, NOW, r2)
	eq(d["coins"], 600, "先领后翻倍")
	eq(save["coins"], 400 + 600, "总额")
	eq(SignIn.double_today(save, eco, species, rng, 101, NOW, r2), {}, "每天只能翻一次")


func test_daily_counters_reset_by_day_index() -> void:
	var p := _setup(30)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	Skills.try_use(save, eco, "shuffle", 0, 3)
	save["daily"]["replay"] = 4
	save["daily"]["share"]["wheel"] = 1
	Daily.roll(save, 3)
	eq(save["daily"]["replay"], 4, "同一天不清")
	Daily.roll(save, 4)
	eq(save["daily"]["replay"], 0, "跨天清零")
	eq(save["daily"]["toolFree"], {}, "免费次清零")
	eq(save["daily"]["share"]["wheel"], 0, "分享次数清零")
	save["week"]["cleared"] = 9
	Daily.roll(save, 4 + 7)
	eq(save["week"]["cleared"], 0, "跨周清零周过关数")


func test_economy_numbers_match_design() -> void:
	var eco: Dictionary = _setup()[1]
	eq(eco["levelCoins"], 100, "过关金币")
	eq(eco["challengeCoins"], 200, "挑战关金币")
	var tiers: Array = eco["combo"]["tiers"]
	eq(tiers.map(func(t: Dictionary) -> int: return t["coins"]), [5, 10, 15, 25], "连击档")
	eq(eco["combo"]["maxCoinsPerLevel"], 400, "连击封顶")
	eq(eco["dupeCoins"]["legend"], 2500, "重复传说卡")
	eq(eco["bowlSlotCoinPrice"], 650, "缸位")
	eq(
		int(eco["freeCoin"]["amount"]) * 100 + int(eco["freeCoin"]["daily"]),
		50010,
		"商店免费金币 500 × 10"
	)
	eq(int(eco["wheel"]["coinCost"]), 1000, "抽奖单抽价")
	eq(int(eco["wheel"]["tenCost"]), 9000, "十连价")
	eq(int(eco["lives"]["buyOneCoins"]), 200, "买 1 条")
	eq(int(eco["lives"]["refillCoins"]), 800, "补满")


func test_migrate_v1_save_to_v2() -> void:
	var eco: Dictionary = _setup()[1]
	var old := {
		"version": 1,
		"level": 13,
		"coins": 40,
		"tickets": 7,
		"stars": 12,
		"tools": {"net": 1, "blow": 1, "shuffle": 3},
		"cards": {"c01": 2},
		"daily": {"day": 77, "firstWin": true, "freeCoin": 2},
		"signin": {"count": 4, "lastDay": 77},
	}
	var save := PlayerData.migrate(old, eco)
	eq(save["version"], 2, "版本 2")
	eq(save["coins"], 40 * 5 + 7 * 50, "旧金币 ×5，鱼票按 50 折金币")
	eq(save["tickets"], 0, "鱼票清零")
	eq(save["stars"], 12, "星星字段保留")
	eq(save["cards"], {"c01": 2}, "图鉴原样")
	eq(save["level"], 13, "进度保留")
	eq(save["lives"]["count"], 5, "补满命")
	eq(save["signin"]["count"], 4, "签到进度保留")
	eq(save["signin"]["doubledDay"], -1, "补新字段")
	eq(save["daily"]["day"], 77, "保留日期")
	eq(save["daily"]["share"]["life"], 0, "每日结构换新")
	eq(save["tools"]["shuffle"], 3 + 2, "已到关的技能补发解锁礼")
	eq(save["tools"]["current"], 2, "13 关已过洋流解锁线")
	var again := PlayerData.migrate(save.duplicate(true), eco)
	eq(again["coins"], save["coins"], "已是 v2 的档不会再换算")
	eq(again["tools"], save["tools"], "也不会重复发礼")
	var back: Dictionary = JSON.parse_string(JSON.stringify(save))
	eq(int(back["wheel"]["total"]), 0, "存档可直接转 JSON")
