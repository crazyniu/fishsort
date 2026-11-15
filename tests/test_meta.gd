extends TestCase


static func _cfg(name: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string("res://config/%s.json" % name))


func test_fails_unlock_easier_variants() -> void:
	var eco := _cfg("economy")
	var save := PlayerData.create(eco)
	eq(Meta.fail_level(save, eco, 7), 0, "失败 1 次仍是普通")
	eq(Meta.fail_level(save, eco, 7), 1, "失败 2 次换易化变体")
	Meta.fail_level(save, eco, 7)
	eq(Meta.fail_level(save, eco, 7), 2, "失败 4 次再降一档")
	eq(Meta.ease_for(save, eco, 8), 0, "换一关重新计")


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
	eq(save["tools"]["blow"], 2, "补齐缺失字段，且第 9 关的老玩家补发吹泡解锁礼")
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
			ok(last["tier_up"] and last["coins"] == 5, "3 连进第一档")
	eq(last["tier"], 3, "15 连到最高档")
	ok(combo.card_won, "15 连必送图鉴")
	ok(combo.coins <= int(cfg["maxCoinsPerLevel"]), "连击金币不超上限")
	eq(combo.coins, 15 + 40 + 75 + 25, "3–5 连 5 币，6–9 连 10 币，10–14 连 15 币，15 连 25 币")
	eq(combo.best_bonus(cfg), 150, "最高连击奖 = 15 × 10")
	eq(combo.hit(100.0, cfg, rng)["count"], 1, "超时后重新计数")
