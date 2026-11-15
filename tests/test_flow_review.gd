extends TestCase
## 玩法流程检查（issue #34）的修复：关卡循环、每日挑战、排行周奖、收藏开放前不掉卡、图鉴只算首通

const NOW := 4_000_000


static func _cfg(name: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string("res://config/%s.json" % name))


func _setup(level: int) -> Array:
	var eco := _cfg("economy")
	var save := PlayerData.create(eco)
	save["level"] = level
	return [save, eco, _cfg("species")["species"]]


func test_level_file_loops_second_half_keeping_challenge_slots() -> void:
	eq(Meta.level_file(1, 120), 1, "120 关内原样")
	eq(Meta.level_file(120, 120), 120, "第 120 关")
	eq(Meta.level_file(121, 120), 61, "第 121 关用第 61 关，不回教学关")
	eq(Meta.level_file(180, 120), 120, "第 180 关用第 120 关")
	eq(Meta.level_file(181, 120), 61, "再循环")
	for id: int in range(121, 600):
		var f: int = Meta.level_file(id, 120)
		ok(f >= 61 and f <= 120, "第 %d 关 → %d 在后半段" % [id, f])
		eq(f % 5 == 0, id % 5 == 0, "第 %d 关的挑战关位置对齐" % id)


func test_daily_challenge_win_adds_combo_coins() -> void:
	var p := _setup(20)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	var r: Dictionary = DailyChallenge.win(save, eco, p[2], 100, 0, Rng.new(1), 120)
	eq(save["coins"], 500 + 120, "每日宝箱金币 + 连击金币")
	var combo: Array = (r["prizes"] as Array).filter(
		func(x: Dictionary) -> bool: return x.get("combo", false)
	)
	eq(combo.size(), 1, "开奖里单列连击金币")
	eq(int(combo[0]["amount"]), 120, "数量")
	var save2: Dictionary = PlayerData.create(eco)
	save2["level"] = 20
	var r2: Dictionary = DailyChallenge.win(save2, eco, p[2], 100, 0, Rng.new(1))
	var listed: bool = (r2["prizes"] as Array).any(
		func(x: Dictionary) -> bool: return x.get("combo", false)
	)
	ok(not listed, "没连击金币不列")


func test_daily_challenge_free_try_counts_only_after_first_step() -> void:
	var p := _setup(20)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	ok(DailyChallenge.can_start_free(save, 100), "当天能免费进")
	ok(DailyChallenge.can_start_free(save, 100), "进来不走不记次数，仍然免费")
	eq(DailyChallenge.tries(save, 100), 0, "没走步不算一次")
	ok(DailyChallenge.enter(save, eco, 100, "free"), "第一步时记上免费次")
	ok(not DailyChallenge.can_start_free(save, 100), "走过之后再进要付费")
	DailyChallenge.win(save, eco, p[2], 101, 0, Rng.new(1))
	ok(not DailyChallenge.can_start_free(save, 101), "过关后当天不能再进")


func test_weekly_rank_order_and_reward_tiers() -> void:
	var eco: Dictionary = _setup(20)[1]
	var rows: Array = []
	for i: int in 12:
		rows.append({"name": str(i), "score": 100 - i * 5})
	eq(WeeklyRank.rank_of(rows, 200), 1, "最多第一")
	eq(WeeklyRank.rank_of(rows, 100), 1, "同分自己在前")
	eq(WeeklyRank.rank_of(rows, 99), 2, "第二")
	eq(WeeklyRank.rank_of(rows, 1), 13, "垫底")
	var sorted: Array = WeeklyRank.sorted(rows, {"name": "me", "score": 90})
	eq(sorted.size(), 13, "插进自己")
	ok(sorted[2].get("me", false), "90 分排第 3（同分在前）")
	ok(not rows.any(func(r: Dictionary) -> bool: return r.get("me", false)), "不改传入的榜单")
	eq(int(WeeklyRank.reward_for(eco, 1, 5)["coins"]), 3000, "第 1 名金币")
	eq(int(WeeklyRank.reward_for(eco, 1, 5)["tools"]), 2, "第 1 名每种技能 2 个")
	eq(int(WeeklyRank.reward_for(eco, 2, 5)["coins"]), 2000, "第 2 名")
	eq(int(WeeklyRank.reward_for(eco, 3, 5)["tools"]), 1, "第 3 名送技能")
	eq(int(WeeklyRank.reward_for(eco, 3, 5)["coins"]), 1500, "第 3 名金币")
	eq(int(WeeklyRank.reward_for(eco, 4, 5)["coins"]), 800, "第 4 名")
	eq(int(WeeklyRank.reward_for(eco, 10, 5)["coins"]), 800, "第 10 名")
	eq(int(WeeklyRank.reward_for(eco, 11, 5)["coins"]), 300, "其余上榜")
	ok(not WeeklyRank.reward_for(eco, 11, 5).has("tools"), "其余不送技能")
	eq(WeeklyRank.reward_for(eco, 1, 0), {}, "上周没过关不上榜")


func test_weekly_rank_settles_once_per_week() -> void:
	var p := _setup(30)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	var rows: Array = [{"name": "a", "score": 50}, {"name": "b", "score": 3}]
	# 第 4 天是周一（1970-01-05），上一周是第 0 周
	var mon: int = 4 + 7 * 100
	Daily.roll(save, mon - 1)
	save["week"]["cleared"] = 9
	var r: Dictionary = WeeklyRank.settle(save, eco, rows, mon, NOW)
	eq(int(r["rank"]), 2, "上周 9 关排第 2")
	eq(int(r["score"]), 9, "按上周的过关数")
	eq(save["coins"], 2000, "第 2 名 2000 金币")
	eq(save["tools"]["shuffle"], 1, "每种技能 +1")
	eq(save["week"]["cleared"], 0, "本周从 0 算")
	eq(WeeklyRank.settle(save, eco, rows, mon, NOW), {}, "同一周只结算一次")
	eq(WeeklyRank.settle(save, eco, rows, mon + 3, NOW), {}, "周中再进也不发")
	eq(WeeklyRank.settle(save, eco, rows, mon + 7, NOW), {}, "上周 0 关不上榜")
	# 隔了一周没玩：上上周的成绩不算
	save["week"]["cleared"] = 20
	eq(WeeklyRank.settle(save, eco, rows, mon + 21, NOW), {}, "中间断了一周，不算")


func test_weekly_rank_not_settled_before_rank_unlocks() -> void:
	var p := _setup(10)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	Daily.roll(save, 10)
	save["week"]["cleared"] = 8
	eq(WeeklyRank.settle(save, eco, [], 10 + 7, NOW), {}, "第 11 关前不结算")
	eq(save["coins"], 0, "不发金币")
	save["level"] = 11
	eq(WeeklyRank.settle(save, eco, [], 10 + 7, NOW), {}, "这周已经算过（没开放），不补发")


func test_weekly_rank_save_fields_default_and_migrate() -> void:
	var eco: Dictionary = _cfg("economy")
	var save: Dictionary = PlayerData.create(eco)
	eq(save["week"]["paid"], -1, "新存档默认没结算过")
	eq(save["week"]["lastCleared"], 0, "上周过关数默认 0")
	var old: Dictionary = {"version": 2, "level": 30, "week": {"id": 5, "cleared": 3}}
	PlayerData.migrate(old, eco)
	eq(old["week"]["paid"], -1, "旧存档补上 paid")
	eq(old["week"]["lastId"], -1, "旧存档补上 lastId")
	eq(old["week"]["cleared"], 3, "原有过关数保留")


func test_no_cards_before_album_opens() -> void:
	var p := _setup(3)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	var rng := Rng.new(3)
	for i: int in 300:
		var r: Dictionary = LevelChest.open(save, eco, species, 3, i % 5 == 4, rng)
		ok(r["kind"] != "card", "收藏没开放，宝箱不出卡")
	eq((save["cards"] as Dictionary).size(), 0, "一张卡都没进")
	save["level"] = 6
	save["chest"]["dry"] = 0
	eq(LevelChest.open(save, eco, species, 6, true, rng)["kind"], "card", "第 6 关起挑战关出卡")
	# 连击：收藏没开放不送卡
	var cfg: Dictionary = eco["combo"]
	var combo := Combo.new()
	for i: int in 25:
		ok(not combo.hit(i * 0.5, cfg, rng, false)["card"], "不送卡")
	ok(not combo.card_won, "连击没送卡")


func test_sign_in_cards_become_coins_before_album_opens() -> void:
	var p := _setup(3)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	var rng := Rng.new(8)
	save["signin"]["count"] = 6
	var r: Dictionary = SignIn.claim(save, eco, species, rng, 50, NOW)
	eq(r["cards"].size(), 0, "大宝箱不发卡")
	var extra: int = int(r["coins"]) - 1000
	ok(extra >= int(eco["dupeCoins"]["rare"]), "卡换成稀有以上的重复卡金币：%d" % extra)
	eq(save["coins"], r["coins"], "金币入账")
	eq((save["cards"] as Dictionary).size(), 0, "一张卡都没进")
	for i: int in 50:
		var s: Dictionary = PlayerData.create(eco)
		s["level"] = 5
		s["signin"]["count"] = 2
		var d3: Dictionary = SignIn.claim(s, eco, species, rng, 60, NOW)
		eq(d3["cards"].size(), 0, "第 3 天宝箱不发卡")
		ok(d3["skills"].size() == 1 or int(d3["coins"]) > 0, "改发技能或金币")


func test_dex_counts_only_first_clear_and_daily() -> void:
	var save: Dictionary = PlayerData.create(_cfg("economy"))
	save["level"] = 30
	ok(Dex.counts_win(save, 30, false), "通过当前进度的关算")
	ok(not Dex.counts_win(save, 12, false), "重玩旧关不算")
	ok(Dex.counts_win(save, 15, true), "每日挑战算")
