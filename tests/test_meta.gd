extends TestCase


static func _cfg(name: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string("res://config/%s.json" % name))


func test_finish_level_rewards_and_progress() -> void:
	var eco := _cfg("economy")
	var save := PlayerData.create(eco)
	var r := Meta.finish_level(save, eco, 1, false, 100)
	eq(save["level"], 2, "进度推进")
	eq(save["coins"], 20, "普通关金币")
	eq(r["tickets"], 1, "每日首胜送鱼票")
	r = Meta.finish_level(save, eco, 5, true, 100)
	eq(save["level"], 2, "重玩其它关不推进进度")
	eq(r["tickets"], 3, "挑战关鱼票，首胜只算一次")
	Meta.double_coins(save, eco, r)
	eq(save["coins"], 20 + 40 + 40, "看广告双倍")
	eq(save["week"]["cleared"], 2, "周过关数")
	Meta.finish_level(save, eco, 2, false, 107)
	eq(save["week"]["cleared"], 1, "跨周清零")


func test_fails_unlock_easier_variants() -> void:
	var eco := _cfg("economy")
	var save := PlayerData.create(eco)
	eq(Meta.fail_level(save, eco, 7), 0, "失败 1 次仍是普通")
	eq(Meta.fail_level(save, eco, 7), 1, "失败 2 次换易化变体")
	Meta.fail_level(save, eco, 7)
	eq(Meta.fail_level(save, eco, 7), 2, "失败 4 次再降一档")
	eq(Meta.ease_for(save, eco, 8), 0, "换一关重新计")


func test_card_pity_and_duplicates() -> void:
	var eco := _cfg("economy")
	var species: Array = _cfg("species")["species"]
	var save := PlayerData.create(eco)
	var rng := Rng.new(3)
	var dry: int = 0
	for i: int in 400:
		var c := Meta.draw_card(save, eco, species, "levelCard", rng)
		dry = 0 if c["is_new"] else dry + 1
		var owned_low: int = (
			(save["cards"] as Dictionary)
			. keys()
			. filter(func(k: String) -> bool: return k[0] == "c")
			. size()
		)
		if owned_low < 30:
			ok(dry < 3, "保底：普通集齐前不会连续 3 张都是重复卡")
	ok(int(save["coins"]) > 0, "重复卡换金币")
	ok(
		not (save["cards"] as Dictionary).keys().any(
			func(k: String) -> bool: return k[0] == "e" or k[0] == "l"
		),
		"过关卡不出史诗传说"
	)
	eq(Meta.draw_card(save, eco, species, "ticketPack", rng), {}, "鱼票不够不能开珍稀卡包")
	save["tickets"] = 10
	var card := Meta.draw_card(save, eco, species, "ticketPack", rng)
	eq(save["tickets"], 0, "开包扣 10 张鱼票")
	ok(card["rarity"] != "common", "珍稀卡包不出普通卡")


func test_sign_in_once_per_day_and_cycles() -> void:
	var eco := _cfg("economy")
	var signin := _cfg("signin")
	var save := PlayerData.create(eco)
	eq(Meta.sign_in(save, signin, 10)["coins"], 50, "第 1 天奖励")
	eq(Meta.sign_in(save, signin, 10), {}, "一天只能签一次")
	for d: int in range(20, 26):
		Meta.sign_in(save, signin, d)
	eq(Meta.sign_in(save, signin, 30)["coins"], 50, "断签不清零，7 天后循环")


func test_build_scene_spends_stars_and_gives_chest() -> void:
	var eco := _cfg("economy")
	var scenes := _cfg("scenes")
	var save := PlayerData.create(eco)
	ok(not Meta.build_step(save, scenes), "没有星星不能建")
	save["stars"] = 100
	for i: int in 10:
		Meta.build_step(save, scenes)
	eq(save["scene"], 1, "10 步建完进入下一个场景")
	eq(save["tickets"], 10, "场景宝箱送鱼票")


func test_interstitial_frequency_cap() -> void:
	var eco := _cfg("economy")
	var ads := _cfg("ads")
	var save := PlayerData.create(eco)
	ok(not Meta.should_show_interstitial(save, ads, 5, 1000.0), "第 8 关之前不弹")
	ok(Meta.should_show_interstitial(save, ads, 8, 1000.0), "满足条件时弹")
	Meta.mark_interstitial(save, 8, 1000.0)
	ok(not Meta.should_show_interstitial(save, ads, 9, 2000.0), "至少隔 2 关")
	ok(not Meta.should_show_interstitial(save, ads, 10, 1050.0), "至少隔 90 秒")
	Meta.mark_rewarded(save, 1990.0)
	ok(not Meta.should_show_interstitial(save, ads, 10, 2000.0), "刚看完激励视频则跳过")


func test_old_save_gets_new_fields() -> void:
	var eco := _cfg("economy")
	var save := PlayerData.migrate({"level": 9, "coins": 77, "tools": {"net": 3}}, eco)
	eq(save["level"], 9, "保留旧进度")
	eq(save["tools"]["blow"], 1, "补齐缺失字段")
	eq(save["version"], PlayerData.VERSION, "版本号更新")


func test_combo_tiers_and_card() -> void:
	var cfg: Dictionary = _cfg("economy")["combo"]
	var combo := Combo.new()
	var rng := Rng.new(1)
	var last: Dictionary = {}
	for i: int in 15:
		last = combo.hit(i * 0.5, cfg, rng)
		if i == 1:
			eq(last["tier"], -1, "2 连还不算连击")
		if i == 2:
			ok(last["tier_up"] and last["coins"] == 1, "3 连进第一档")
	eq(last["tier"], 3, "15 连到最高档")
	ok(combo.card_won, "15 连必送图鉴")
	ok(combo.coins <= int(cfg["maxCoinsPerLevel"]), "连击金币不超上限")
	eq(combo.best_bonus(cfg), 30, "最高连击奖 = 15 × 2")
	eq(combo.hit(100.0, cfg, rng)["count"], 1, "超时后重新计数")
