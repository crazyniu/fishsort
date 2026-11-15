class_name Meta
extends RefCounted
## 局外规则里零散的几项：连败降难度、技能购买、免费金币、广告频控。
## 结算见 Settle，宝箱见 LevelChest，生命见 Lives，技能见 Skills。
## 全部是对存档字典的纯计算；日期、时间、随机数由调用方传入。


## 第 id 关用哪个关卡文件。count 是关卡总数；超过后只在后一半里循环（第 61–120 关），
## 后一半的长度是挑战关间隔的整数倍，所以挑战关的位置不变。见 docs/01 第 5.7 节
static func level_file(id: int, count: int) -> int:
	if id <= count:
		return id
	var half: int = count / 2
	return half + 1 + posmod(id - count - 1, count - half)


static func _roll_day(save: Dictionary, day: int) -> void:
	Daily.roll(save, day)


## 失败记一次，返回下次该用的易化档位（0 = 普通）
static func fail_level(save: Dictionary, eco: Dictionary, level_id: int) -> int:
	var fails: Dictionary = save["fails"]
	if fails["level"] != level_id:
		fails["level"] = level_id
		fails["count"] = 0
	fails["count"] = int(fails["count"]) + 1
	return ease_for(save, eco, level_id)


static func ease_for(save: Dictionary, eco: Dictionary, level_id: int) -> int:
	if save["fails"]["level"] != level_id:
		return 0
	var ease: int = 0
	for threshold: int in eco["easeAfterFails"]:
		if int(save["fails"]["count"]) >= threshold:
			ease += 1
	return ease


## 同一关连续失败够次数后，下次开局免费送第 3 缸位；返回开局该开的缸位数（base 是关卡默认值）
static func open_slots_for(save: Dictionary, eco: Dictionary, level_id: int, base: int) -> int:
	if save["fails"]["level"] != level_id:
		return base
	if int(save["fails"]["count"]) >= int(eco["freeBowlSlotAfterFails"]):
		return maxi(base, 3)
	return base


static func buy_tool(save: Dictionary, eco: Dictionary, tool: String) -> bool:
	var price: int = int(eco["toolPrice"][tool])
	if int(save["coins"]) < price:
		return false
	save["coins"] = int(save["coins"]) - price
	save["tools"][tool] = int(save["tools"][tool]) + 1
	return true


## 每日免费金币还能不能领
static func take_free_coin(save: Dictionary, eco: Dictionary, day: int) -> bool:
	_roll_day(save, day)
	if int(save["daily"]["freeCoin"]) >= int(eco["freeCoin"]["daily"]):
		return false
	save["daily"]["freeCoin"] = int(save["daily"]["freeCoin"]) + 1
	save["coins"] = int(save["coins"]) + int(eco["freeCoin"]["amount"])
	return true


## 过关后该不该弹插屏。now 是单调递增的秒数
static func should_show_interstitial(
	save: Dictionary, ads: Dictionary, level_id: int, now: float
) -> bool:
	var rule: Dictionary = ads["interstitial"]
	var state: Dictionary = save["ads"]
	return (
		level_id >= int(rule["minLevel"])
		and now - float(state["interstitialAt"]) >= float(rule["minSeconds"])
		and level_id - int(state["interstitialLevel"]) >= int(rule["minLevelsBetween"])
		and now - float(state["rewardedAt"]) >= float(rule["skipAfterRewardedSeconds"])
	)


static func mark_interstitial(save: Dictionary, level_id: int, now: float) -> void:
	save["ads"]["interstitialAt"] = now
	save["ads"]["interstitialLevel"] = level_id


static func mark_rewarded(save: Dictionary, now: float) -> void:
	save["ads"]["rewardedAt"] = now
