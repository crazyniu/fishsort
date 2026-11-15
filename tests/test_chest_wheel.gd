extends TestCase

const NOW := 2_000_000


static func _cfg(name: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string("res://config/%s.json" % name))


func _setup(level: int = 20) -> Array:
	var eco := _cfg("economy")
	var save := PlayerData.create(eco)
	save["level"] = level
	return [save, eco, _cfg("species")["species"]]


func test_chest_normal_odds() -> void:
	var p := _setup()
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	var rng := Rng.new(11)
	var n: int = 6000
	var kinds := {"coins": 0, "skill": 0, "card": 0}
	var rar := {}
	var cards: int = 0
	var cmin: int = 999
	var cmax: int = 0
	for i: int in n:
		var save: Dictionary = PlayerData.create(eco)
		save["level"] = 20
		save["chest"]["dry"] = 0
		var r: Dictionary = LevelChest.open(save, eco, species, 20, false, rng)
		kinds[r["kind"]] += 1
		if r["kind"] == "coins":
			cmin = mini(cmin, int(r["coins"]))
			cmax = maxi(cmax, int(r["coins"]))
		if r["kind"] == "card":
			cards += 1
			rar[r["card"]["rarity"]] = int(rar.get(r["card"]["rarity"], 0)) + 1
	ok(absf(kinds["coins"] / float(n) - 0.35) < 0.03, "安慰金币约 35%%：%s" % kinds)
	ok(absf(kinds["skill"] / float(n) - 0.12) < 0.025, "技能约 12%%：%s" % kinds)
	ok(absf(kinds["card"] / float(n) - 0.53) < 0.03, "卡约 53%%：%s" % kinds)
	ok(cmin >= 30 and cmax <= 80, "安慰金币 30–80")
	ok(absf(rar["common"] / float(cards) - 0.70) < 0.04, "普通卡约 70%%：%s" % rar)
	ok(absf(rar["uncommon"] / float(cards) - 0.22) < 0.04, "精良约 22%%：%s" % rar)
	ok(rar.get("rare", 0) / float(cards) < 0.09, "稀有约 6%%：%s" % rar)


func test_chest_challenge_always_card_with_rare_boost() -> void:
	var p := _setup()
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	var rng := Rng.new(5)
	var n: int = 6000
	var rare_plus: int = 0
	var rare_plus_normal: int = 0
	for i: int in n:
		var save: Dictionary = PlayerData.create(eco)
		var r: Dictionary = LevelChest.open(save, eco, species, 30, true, rng)
		eq(r["kind"], "card", "挑战关必出卡")
		if Cards.rank(eco, r["card"]["rarity"]) >= 2:
			rare_plus += 1
	for i: int in n:
		var rarity: String = Cards.roll_rarity(eco, eco["chest"]["cardRates"], rng)
		if Cards.rank(eco, rarity) >= 2:
			rare_plus_normal += 1
	# 稀有以上 8% → 翻倍后权重 16 / 108 ≈ 14.8%
	ok(absf(rare_plus / float(n) - 0.148) < 0.025, "挑战关稀有以上约 14.8%%：%d" % rare_plus)
	ok(rare_plus > rare_plus_normal * 1.6, "明显高于普通档")


func test_chest_pity_exactly_after_four_dry() -> void:
	var p := _setup()
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	# 先拥有一部分卡，保底必须给未拥有的
	for i: int in 20:
		save["cards"][species[i]["id"]] = 1
	var rng := Rng.new(9)
	var dry: int = 0
	for i: int in 400:
		var before: int = (save["cards"] as Dictionary).size()
		var r: Dictionary = LevelChest.open(save, eco, species, 20, false, rng)
		if r["kind"] == "card":
			dry = 0
		else:
			dry += 1
		ok(dry <= 4, "连续没出卡不超过 4 关")
		if r["pity"]:
			ok(r["card"]["is_new"], "保底给的是未拥有的卡")
			eq((save["cards"] as Dictionary).size(), before + 1, "图鉴 +1")
		if (save["cards"] as Dictionary).size() >= species.size():
			break
	# 精确规则：dry = 4 时必定出卡
	save["chest"]["dry"] = 4
	eq(LevelChest.open(save, eco, species, 20, false, Rng.new(1))["kind"], "card", "第 5 关必出卡")


func test_chest_ad_once_per_level_and_no_skill_before_unlock() -> void:
	var p := _setup(2)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	var rng := Rng.new(2)
	eq(LevelChest.open_ad(save, eco, species, 2, false, rng), {}, "没开过本关的箱子不能开广告箱")
	LevelChest.open(save, eco, species, 2, false, rng)
	ok(not LevelChest.open_ad(save, eco, species, 2, false, rng).is_empty(), "广告箱一次")
	eq(LevelChest.open_ad(save, eco, species, 2, false, rng), {}, "同一关只能一次")
	LevelChest.open(save, eco, species, 3, false, rng)
	ok(not LevelChest.open_ad(save, eco, species, 3, false, rng).is_empty(), "新一关又有一次")
	for i: int in 300:
		var r: Dictionary = LevelChest.open(save, eco, species, 3, false, rng)
		ok(r["kind"] != "skill", "技能没解锁时不出技能")


func test_wheel_odds_derive_from_config() -> void:
	var eco: Dictionary = _setup()[1]
	var odds: Array[Dictionary] = Wheel.odds(eco)
	var total: float = 0.0
	var by_id := {}
	for o: Dictionary in odds:
		total += float(o["percent"])
		by_id[o["id"]] = o["percent"]
	ok(absf(total - 100.0) < 0.0001, "概率总和 100")
	ok(absf(by_id["coin200"] - 28.0) < 0.001 and absf(by_id["coin2000"] - 3.0) < 0.001, "金币档")
	ok(absf(by_id["card_epic"] - 1.3) < 0.001 and absf(by_id["card_legend"] - 0.2) < 0.001, "卡档")
	ok(absf(by_id["skill"] - 15.0) < 0.001 and absf(by_id["life15"] - 3.0) < 0.001, "技能和无限生命")


func test_wheel_sampling_matches_table() -> void:
	var p := _setup(30)
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	var rng := Rng.new(77)
	var counts := {}
	var n: int = 8000
	for i: int in n:
		var save: Dictionary = PlayerData.create(eco)
		save["level"] = 30
		save["coins"] = 1000
		var r: Dictionary = Wheel.spin(save, eco, species, rng, 5, NOW, "coins")
		counts[r["prize"]] = int(counts.get(r["prize"], 0)) + 1
	for o: Dictionary in Wheel.odds(eco):
		var got: float = counts.get(o["id"], 0) / float(n) * 100.0
		ok(
			absf(got - float(o["percent"])) < 1.8,
			"%s 期望 %.1f%% 实际 %.1f%%" % [o["id"], o["percent"], got]
		)


func test_wheel_spin_sources_and_limits() -> void:
	var p := _setup(30)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	var rng := Rng.new(3)
	eq(Wheel.spins_left(save, eco, 10), 1, "每天 1 次免费")
	ok(not Wheel.spin(save, eco, species, rng, 10, NOW, "spin").is_empty(), "用免费次")
	eq(Wheel.spin(save, eco, species, rng, 10, NOW, "spin"), {}, "没次数了")
	eq(Wheel.spin(save, eco, species, rng, 10, NOW, "coins"), {}, "金币不够")
	eq(Wheel.spins_left(save, eco, 11), 1, "第二天重新有免费次")
	# 首胜 +1
	var r: Dictionary = Settle.win(
		save, eco, {"level": 29, "challenge": false, "day": 11, "now": NOW}
	)
	ok(r["first_win"], "首胜")
	eq(Wheel.spins_left(save, eco, 11), 2, "首胜 +1")
	# 分享 +1，每天 1 次
	ok(not Share.claim(save, eco, "wheel", 11, NOW, rng).is_empty(), "分享 +1")
	eq(Share.claim(save, eco, "wheel", 11, NOW, rng), {}, "分享每天 1 次")
	eq(Wheel.spins_left(save, eco, 11), 3, "3 次")
	# 广告 +1，每天 3 次
	for i: int in 3:
		ok(Wheel.claim_ad(save, eco, 11), "广告 +1")
	ok(not Wheel.claim_ad(save, eco, 11), "广告每天 3 次")
	eq(Wheel.spins_left(save, eco, 11), 6, "6 次")
	ok(Wheel.claim_ad(save, eco, 12), "第二天重置")


func test_wheel_hard_pity_exactly_30() -> void:
	var p := _setup(30)
	var save: Dictionary = p[0]
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	var rng := Rng.new(123)
	save["coins"] = 100_000_000
	var dry: int = 0
	for i: int in 3000:
		var r: Dictionary = Wheel.spin(save, eco, species, rng, 5, NOW, "coins")
		var epic: bool = r["card"] != {} and Cards.rank(eco, r["card"]["rarity"]) >= 3
		if epic:
			dry = 0
		else:
			dry += 1
		ok(dry <= 30, "连续 30 次没出史诗以上，下一次必出（dry=%d）" % dry)
	save["wheel"]["dry"] = 30
	var forced: Dictionary = Wheel.spin(save, eco, species, rng, 5, NOW, "coins")
	ok(forced["pity"] and Cards.rank(eco, forced["card"]["rarity"]) >= 3, "dry=30 必出史诗以上")
	eq(save["wheel"]["dry"], 0, "出后清零")
	save["wheel"]["dry"] = 29
	ok(not Wheel.spin(save, eco, species, rng, 5, NOW, "coins")["pity"], "dry=29 还不是保底")


func test_wheel_ten_pull_guarantee_and_cost() -> void:
	var p := _setup(30)
	var eco: Dictionary = p[1]
	var species: Array = p[2]
	var rng := Rng.new(8)
	var poor: Dictionary = PlayerData.create(eco)
	poor["coins"] = 8999
	eq(Wheel.ten_pull(poor, eco, species, rng, 5, NOW), {}, "9000 才能十连")
	for i: int in 300:
		var save: Dictionary = PlayerData.create(eco)
		save["level"] = 30
		save["coins"] = 9000
		var r: Dictionary = Wheel.ten_pull(save, eco, species, rng, 5, NOW)
		eq(save["coins"] >= 0, true, "不透支")
		eq(r["results"].size(), 10, "十次")
		var good: bool = (r["results"] as Array).any(
			func(x: Dictionary) -> bool:
				return x["card"] != {} and Cards.rank(eco, x["card"]["rarity"]) >= 2
		)
		ok(good, "十连至少一张稀有以上")
