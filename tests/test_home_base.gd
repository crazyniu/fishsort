extends TestCase
## 家园「重建海湾」与星星，见 docs/01 第 5.12 节

const NOW := 3_000_000


static func _eco() -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string("res://config/economy.json"))


func _win(save: Dictionary, eco: Dictionary, level: int, challenge: bool) -> Dictionary:
	return Settle.win(save, eco, {"level": level, "challenge": challenge, "day": 7, "now": NOW})


func test_stars_first_clear_only() -> void:
	var eco := _eco()
	var save := PlayerData.create(eco)
	save["level"] = 4
	eq(HomeBase.stars(save), 0, "新档 0 颗")
	eq(_win(save, eco, 4, false)["stars"], 1, "首次通过普通关 1 颗")
	eq(_win(save, eco, 5, true)["stars"], 2, "首次通过挑战关 2 颗")
	eq(HomeBase.stars(save), 3, "已入账")
	eq(_win(save, eco, 4, false)["stars"], 0, "重玩不给")
	eq(HomeBase.stars(save), 3, "重玩后不变")


func test_area_table_matches_design() -> void:
	var eco := _eco()
	eq(HomeBase.area_count(eco), 5, "5 个区域")
	var unlocks: Array = []
	for i: int in HomeBase.area_count(eco):
		eq(HomeBase.step_count(eco, i), 5, "每区 5 步")
		unlocks.append(HomeBase.unlock_level(eco, i))
	eq(unlocks, [30, 50, 70, 90, 110], "区域开放关")
	eq(HomeBase.unlock_level(eco, 0), Features.unlock_level(eco, "homeBase"), "第一区随页签开放")
	eq(HomeBase.total_cost(eco), {"stars": 65, "coins": 66000}, "总花费 65 星 6.6 万金币")


func test_build_steps_and_area_chest() -> void:
	var eco := _eco()
	var save := PlayerData.create(eco)
	save["level"] = 29
	save["coins"] = 100000
	save["base"]["stars"] = 100
	eq(HomeBase.check(save, eco), "locked", "第 30 关前不能建")
	save["level"] = 30
	eq(HomeBase.next_cost(save, eco), {"stars": 1, "coins": 600}, "第一步 1 星 600 金币")
	var r: Dictionary = HomeBase.build(save, eco, NOW)
	ok(r["ok"] and r["area"] == 0 and r["step"] == 0 and not r["completed"], "建好第一步")
	eq(HomeBase.stars(save), 99, "扣星")
	eq(save["coins"], 100000 - 600, "扣金币")
	for i: int in 3:
		HomeBase.build(save, eco, NOW)
	var tools_before: int = int(save["tools"]["net"])
	r = HomeBase.build(save, eco, NOW)
	ok(r["completed"], "第 5 步建完区域")
	eq(HomeBase.built(save, 0), 5, "区域 1 建满")
	ok((r["prizes"] as Array).size() > 0, "开区域宝箱")
	eq(int(save["tools"]["net"]), tools_before + 1, "宝箱每种技能 +1")
	ok(Lives.is_unlimited(save, NOW + 3599), "宝箱送 1 小时无限生命")
	var spent: int = 600 + 800 + 1000 + 1200 + 1400
	eq(save["coins"], 100000 - spent + 2000, "扣掉建造费、加上宝箱 2000")
	eq(HomeBase.current_area(save, eco), 1, "轮到区域 2")
	eq(HomeBase.check(save, eco), "locked", "区域 2 要到第 50 关")
	save["level"] = 50
	ok(HomeBase.can_build(save, eco), "到关就能建")
	save["base"]["stars"] = 1
	eq(HomeBase.check(save, eco), "stars", "星星不够")
	save["base"]["stars"] = 10
	save["coins"] = 0
	eq(HomeBase.check(save, eco), "coins", "金币不够")
	r = HomeBase.build(save, eco, NOW)
	ok(not r["ok"] and r["reason"] == "coins", "不够时不扣不建")
	eq(HomeBase.stars(save), 10, "星星没动")


func test_all_done() -> void:
	var eco := _eco()
	var save := PlayerData.create(eco)
	save["level"] = 200
	save["coins"] = 1000000
	save["base"]["stars"] = 1000
	var chests: int = 0
	while HomeBase.can_build(save, eco):
		if HomeBase.build(save, eco, NOW)["completed"]:
			chests += 1
	eq(chests, 5, "5 个区域宝箱")
	ok(HomeBase.all_done(save, eco), "全部建完")
	eq(HomeBase.check(save, eco), "done", "不能再建")
	eq(HomeBase.next_cost(save, eco), {}, "没有下一步")


func test_migrate_retro_stars() -> void:
	var eco := _eco()
	eq(HomeBase.retro_stars(eco, 0), 0, "没通关 0 颗")
	eq(HomeBase.retro_stars(eco, 4), 4, "前 4 关 4 颗")
	eq(HomeBase.retro_stars(eco, 5), 6, "第 5 关是挑战关 +2")
	eq(HomeBase.retro_stars(eco, 40), 48, "40 关：32×1 + 8×2")
	var old := {"version": 2, "level": 41, "coins": 10, "stars": 7, "scene": 2, "sceneStep": 3}
	var save := PlayerData.migrate(old, eco)
	ok(not save.has("stars") and not save.has("scene"), "旧版家园字段删掉")
	eq(HomeBase.stars(save), 48, "按已通关 40 关补发")
	eq(save["base"]["built"], [], "建造从零开始")
	save["base"]["stars"] = 3
	var again := PlayerData.migrate(JSON.parse_string(JSON.stringify(save)), eco)
	eq(HomeBase.stars(again), 3, "已有 base 的档不再补发")
