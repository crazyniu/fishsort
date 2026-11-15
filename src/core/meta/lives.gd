class_name Lives
extends RefCounted
## 生命，见 docs/01 第 5.1 节。存档字段 save["lives"] = { count, stamp, lastNow, unlimitedUntil }。
## 所有函数的 now 是 unix 秒；stamp 是「下一条生命」的计时起点。


static func fresh(eco: Dictionary) -> Dictionary:
	return {"count": int(eco["lives"]["max"]), "stamp": 0, "lastNow": 0, "unlimitedUntil": 0}


## 按时间推进恢复。时间倒退时这段不恢复（计时进度保持不变）。每个入口先调它
static func refresh(save: Dictionary, eco: Dictionary, now: int) -> void:
	var lv: Dictionary = save["lives"]
	var cap: int = int(eco["lives"]["max"])
	var step: int = int(eco["lives"]["regenSeconds"])
	if int(lv["count"]) >= cap:
		lv["count"] = cap
		lv["stamp"] = now
	else:
		if now < int(lv["lastNow"]):
			var elapsed: int = maxi(int(lv["lastNow"]) - int(lv["stamp"]), 0)
			lv["stamp"] = now - elapsed
		var gained: int = maxi((now - int(lv["stamp"])) / step, 0)
		if gained > 0:
			lv["count"] = mini(int(lv["count"]) + gained, cap)
			lv["stamp"] = int(lv["stamp"]) + gained * step
		if int(lv["count"]) >= cap:
			lv["stamp"] = now
	lv["lastNow"] = now


static func count(save: Dictionary, eco: Dictionary, now: int) -> int:
	refresh(save, eco, now)
	return int(save["lives"]["count"])


static func is_unlimited(save: Dictionary, now: int) -> bool:
	return now < int(save["lives"]["unlimitedUntil"])


static func unlimited_left(save: Dictionary, now: int) -> int:
	return maxi(int(save["lives"]["unlimitedUntil"]) - now, 0)


## 离下一条还有几秒；已满返回 0
static func seconds_to_next(save: Dictionary, eco: Dictionary, now: int) -> int:
	refresh(save, eco, now)
	var lv: Dictionary = save["lives"]
	if int(lv["count"]) >= int(eco["lives"]["max"]):
		return 0
	return int(eco["lives"]["regenSeconds"]) - (now - int(lv["stamp"]))


## 能不能开始这一关（第 1–5 关、无限生命期间、有命）
static func can_start(save: Dictionary, eco: Dictionary, level_id: int, now: int) -> bool:
	return (
		level_id <= int(eco["lives"]["freeUntilLevel"])
		or is_unlimited(save, now)
		or count(save, eco, now) > 0
	)


## 失败 / 退出 / 重试时扣 1 条。过关不要调。没走过步、前几关、无限生命期间不扣。返回是否真的扣了
static func lose(save: Dictionary, eco: Dictionary, level_id: int, moved: bool, now: int) -> bool:
	refresh(save, eco, now)
	if (
		not moved
		or level_id <= int(eco["lives"]["freeUntilLevel"])
		or is_unlimited(save, now)
		or int(save["lives"]["count"]) <= 0
	):
		return false
	var lv: Dictionary = save["lives"]
	if int(lv["count"]) >= int(eco["lives"]["max"]):
		lv["stamp"] = now  # 从满命开始计时
	lv["count"] = int(lv["count"]) - 1
	return true


## 直接加命（分享奖励等），不超上限。返回实际增加数
static func add(save: Dictionary, eco: Dictionary, n: int, now: int) -> int:
	refresh(save, eco, now)
	var lv: Dictionary = save["lives"]
	var before: int = int(lv["count"])
	lv["count"] = mini(before + n, int(eco["lives"]["max"]))
	if int(lv["count"]) >= int(eco["lives"]["max"]):
		lv["stamp"] = now
	return int(lv["count"]) - before


## 无限生命窗口；已有窗口则往后顺延
static func grant_unlimited(save: Dictionary, seconds: int, now: int) -> void:
	var lv: Dictionary = save["lives"]
	lv["unlimitedUntil"] = maxi(int(lv["unlimitedUntil"]), now) + seconds


## 金币买 1 条。已满或金币不够返回 false
static func buy_one(save: Dictionary, eco: Dictionary, now: int) -> bool:
	refresh(save, eco, now)
	var price: int = int(eco["lives"]["buyOneCoins"])
	if int(save["lives"]["count"]) >= int(eco["lives"]["max"]) or int(save["coins"]) < price:
		return false
	save["coins"] = int(save["coins"]) - price
	add(save, eco, 1, now)
	return true


## 金币补满。已满或金币不够返回 false
static func buy_refill(save: Dictionary, eco: Dictionary, now: int) -> bool:
	refresh(save, eco, now)
	var price: int = int(eco["lives"]["refillCoins"])
	if int(save["lives"]["count"]) >= int(eco["lives"]["max"]) or int(save["coins"]) < price:
		return false
	save["coins"] = int(save["coins"]) - price
	add(save, eco, int(eco["lives"]["max"]), now)
	return true
