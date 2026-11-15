class_name HomeBase
extends RefCounted
## 家园「重建海湾」，见 docs/01 第 5.12 节。海湾分成几个区域，按顺序建；每个区域有几步，
## 每步花星星和金币。建完一个区域当场开区域宝箱；下一个区域要到开放关才能开始。
## 星星：首次通过一关得 1 颗，挑战关 2 颗（Settle 发），重玩和每日挑战不给。
## 数值在 economy.json 的 homeBase。存档字段 save["base"] = { stars, built: [每个区域建了几步] }。


static func fresh() -> Dictionary:
	return {"stars": 0, "built": []}


static func areas(eco: Dictionary) -> Array:
	return eco["homeBase"]["areas"]


static func area_count(eco: Dictionary) -> int:
	return areas(eco).size()


static func step_count(eco: Dictionary, area: int) -> int:
	return (areas(eco)[area]["steps"] as Array).size()


static func stars(save: Dictionary) -> int:
	return int(save["base"]["stars"])


## 首次通过一关该发几颗星：普通关 1，挑战关 2
static func stars_for_level(eco: Dictionary, challenge: bool) -> int:
	var cfg: Dictionary = eco["homeBase"]["stars"]
	return int(cfg["challenge"] if challenge else cfg["level"])


static func add_stars(save: Dictionary, n: int) -> void:
	save["base"]["stars"] = stars(save) + n


## 老存档补发：已通过第 1 … cleared 关，每关 1 颗，其中每 challengeEvery 关一个挑战关再多 1 颗
## （挑战关的周期与 level_curve.json 的 cycle 一致）。
static func retro_stars(eco: Dictionary, cleared: int) -> int:
	if cleared <= 0:
		return 0
	var cfg: Dictionary = eco["homeBase"]["stars"]
	var hard: int = cleared / int(cfg["challengeEvery"])
	return (cleared - hard) * int(cfg["level"]) + hard * int(cfg["challenge"])


## 这个区域已经建了几步
static func built(save: Dictionary, area: int) -> int:
	var arr: Array = save["base"]["built"]
	return int(arr[area]) if area < arr.size() else 0


static func is_complete(save: Dictionary, eco: Dictionary, area: int) -> bool:
	return built(save, area) >= step_count(eco, area)


static func unlock_level(eco: Dictionary, area: int) -> int:
	return int(areas(eco)[area]["unlock"])


static func is_open(eco: Dictionary, area: int, level: int) -> bool:
	return level >= unlock_level(eco, area)


## 正在建的区域：第一个没建完的；全部建完返回 area_count
static func current_area(save: Dictionary, eco: Dictionary) -> int:
	for i: int in area_count(eco):
		if not is_complete(save, eco, i):
			return i
	return area_count(eco)


static func all_done(save: Dictionary, eco: Dictionary) -> bool:
	return current_area(save, eco) >= area_count(eco)


## 当前区域下一步的花费 { stars, coins }；全部建完返回空字典
static func next_cost(save: Dictionary, eco: Dictionary) -> Dictionary:
	var area: int = current_area(save, eco)
	if area >= area_count(eco):
		return {}
	var step: Array = areas(eco)[area]["steps"][built(save, area)]
	return {"stars": int(step[0]), "coins": int(step[1])}


## 能不能建下一步。返回 "" 表示可以，否则是原因：done（全部建完）/ locked（当前区域没到开放关）/
## stars（星星不够）/ coins（金币不够）
static func check(save: Dictionary, eco: Dictionary) -> String:
	var area: int = current_area(save, eco)
	if area >= area_count(eco):
		return "done"
	if not is_open(eco, area, int(save["level"])):
		return "locked"
	var cost: Dictionary = next_cost(save, eco)
	if stars(save) < int(cost["stars"]):
		return "stars"
	if int(save["coins"]) < int(cost["coins"]):
		return "coins"
	return ""


static func can_build(save: Dictionary, eco: Dictionary) -> bool:
	return check(save, eco).is_empty()


## 建下一步：扣星星和金币，步数 +1；这一步建完了区域就当场发区域宝箱。
## 返回 { ok, reason, area, step（刚建好的是第几步，0 起）, completed, prizes（区域宝箱的奖品列表） }
static func build(save: Dictionary, eco: Dictionary, now: int) -> Dictionary:
	var reason: String = check(save, eco)
	var res: Dictionary = {
		"ok": false, "reason": reason, "area": -1, "step": -1, "completed": false, "prizes": []
	}
	if not reason.is_empty():
		return res
	var area: int = current_area(save, eco)
	var cost: Dictionary = next_cost(save, eco)
	save["base"]["stars"] = stars(save) - int(cost["stars"])
	save["coins"] = int(save["coins"]) - int(cost["coins"])
	var arr: Array = save["base"]["built"]
	while arr.size() <= area:
		arr.append(0)
	arr[area] = int(arr[area]) + 1
	res["ok"] = true
	res["area"] = area
	res["step"] = int(arr[area]) - 1
	if is_complete(save, eco, area):
		res["completed"] = true
		res["prizes"] = Album.grant(save, areas(eco)[area]["reward"], now)
	return res


## 整个家园一共要花多少金币、多少星星（文档核对与锁页展示用）
static func total_cost(eco: Dictionary) -> Dictionary:
	var s: int = 0
	var c: int = 0
	for a: Dictionary in areas(eco):
		for step: Array in a["steps"]:
			s += int(step[0])
			c += int(step[1])
	return {"stars": s, "coins": c}
