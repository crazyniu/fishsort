class_name Meta
extends RefCounted
## 局外规则：过关结算、图鉴抽卡、签到、家园、道具买卖、广告频控。
## 全部是对存档字典的纯计算；日期、时间、随机数由调用方传入。

const WEEK_DAYS := 7


static func _roll_day(save: Dictionary, day: int) -> void:
	var daily: Dictionary = save["daily"]
	if daily["day"] != day:
		daily["day"] = day
		daily["firstWin"] = false
		daily["freeCoin"] = 0
	var week: Dictionary = save["week"]
	# day 是自 1970-01-01（周四）起的天数，+3 后整除 7 得到以周一为起点的周序号
	var week_id: int = (day + 3) / WEEK_DAYS
	if week["id"] != week_id:
		week["id"] = week_id
		week["cleared"] = 0


## 过关结算。返回本次奖励 { coins, stars, tickets, first_win }
static func finish_level(
	save: Dictionary, eco: Dictionary, level_id: int, challenge: bool, day: int
) -> Dictionary:
	_roll_day(save, day)
	var reward: Dictionary = {
		"coins": int(eco["challengeCoins"] if challenge else eco["levelCoins"]),
		"stars": int(eco["challengeStars"] if challenge else eco["levelStars"]),
		"tickets": int(eco["challengeTickets"]) if challenge else 0,
		"first_win": not save["daily"]["firstWin"],
	}
	if reward["first_win"]:
		save["daily"]["firstWin"] = true
		reward["tickets"] = int(reward["tickets"]) + int(eco["firstWinTickets"])
	save["coins"] = int(save["coins"]) + int(reward["coins"])
	save["stars"] = int(save["stars"]) + int(reward["stars"])
	save["tickets"] = int(save["tickets"]) + int(reward["tickets"])
	save["week"]["cleared"] = int(save["week"]["cleared"]) + 1
	if level_id == int(save["level"]):
		save["level"] = level_id + 1
	save["fails"] = {"level": 0, "count": 0}
	return reward


## 看完双倍广告后调用：把刚发的金币再发一份
static func double_coins(save: Dictionary, eco: Dictionary, reward: Dictionary) -> int:
	var extra: int = int(reward["coins"]) * (int(eco["adCoinMultiplier"]) - 1)
	save["coins"] = int(save["coins"]) + extra
	return extra


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


## 抽一张卡。kind: "levelCard"（过关卡）或 "ticketPack"（珍稀卡包，先扣鱼票）
## 返回 { id, rarity, is_new, coins }；鱼票不够返回空字典
static func draw_card(
	save: Dictionary, eco: Dictionary, species: Array, kind: String, rng: Rng
) -> Dictionary:
	var cfg: Dictionary = eco[kind]
	if cfg.has("cost"):
		if int(save["tickets"]) < int(cfg["cost"]):
			return {}
		save["tickets"] = int(save["tickets"]) - int(cfg["cost"])
	var cards: Dictionary = save["cards"]
	var pity: int = int(save["pity"][kind]) + 1
	var pick: Dictionary = {}
	if pity >= int(cfg["pityEvery"]):
		# 保底：从保底池里挑一张还没有的
		var missing: Array = species.filter(
			func(sp: Dictionary) -> bool:
				return (cfg["pityPool"] as Array).has(sp["rarity"]) and not cards.has(sp["id"])
		)
		if not missing.is_empty():
			pick = rng.pick(missing)
	if pick.is_empty():
		var roll: int = rng.range_i(1, 100)
		var rarity: String = ""
		for r: String in cfg["rates"]:
			rarity = r
			roll -= int(cfg["rates"][r])
			if roll <= 0:
				break
		pick = rng.pick(species.filter(func(sp: Dictionary) -> bool: return sp["rarity"] == rarity))
	var is_new: bool = not cards.has(pick["id"])
	cards[pick["id"]] = int(cards.get(pick["id"], 0)) + 1
	save["pity"][kind] = 0 if is_new else pity
	var coins: int = 0 if is_new else int(eco["dupeCoins"][pick["rarity"]])
	save["coins"] = int(save["coins"]) + coins
	return {"id": pick["id"], "rarity": pick["rarity"], "is_new": is_new, "coins": coins}


static func buy_tool(save: Dictionary, eco: Dictionary, tool: String) -> bool:
	var price: int = int(eco["toolPrice"][tool])
	if int(save["coins"]) < price:
		return false
	save["coins"] = int(save["coins"]) - price
	save["tools"][tool] = int(save["tools"][tool]) + 1
	return true


static func grant(save: Dictionary, reward: Dictionary, times: int = 1) -> void:
	save["coins"] = int(save["coins"]) + int(reward.get("coins", 0)) * times
	save["tickets"] = int(save["tickets"]) + int(reward.get("tickets", 0)) * times
	for tool: String in reward.get("tools", {}):
		save["tools"][tool] = int(save["tools"][tool]) + int(reward["tools"][tool]) * times


static func can_sign_in(save: Dictionary, day: int) -> bool:
	return int(save["signin"]["lastDay"]) != day


## 签到：断签不清零，按累计天数循环。今天已签返回空字典
static func sign_in(save: Dictionary, signin: Dictionary, day: int) -> Dictionary:
	if not can_sign_in(save, day):
		return {}
	var days: Array = signin["days"]
	var reward: Dictionary = days[int(save["signin"]["count"]) % days.size()]
	save["signin"]["count"] = int(save["signin"]["count"]) + 1
	save["signin"]["lastDay"] = day
	grant(save, reward)
	return reward


## 家园建造一步。星星不够或已全部建完返回 false；建完一个场景自动发宝箱
static func build_step(save: Dictionary, scenes: Dictionary) -> bool:
	var list: Array = scenes["scenes"]
	if int(save["scene"]) >= list.size():
		return false
	var steps: Array = list[int(save["scene"])]["steps"]
	var cost: int = int(steps[int(save["sceneStep"])])
	if int(save["stars"]) < cost:
		return false
	save["stars"] = int(save["stars"]) - cost
	save["sceneStep"] = int(save["sceneStep"]) + 1
	if int(save["sceneStep"]) >= steps.size():
		save["scene"] = int(save["scene"]) + 1
		save["sceneStep"] = 0
		grant(save, scenes["chest"])
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
