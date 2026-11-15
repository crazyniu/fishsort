class_name DailyChallenge
extends RefCounted
## 每日挑战，见 docs/01 第 5.11 节。每天一关：从已经校验过的挑战关里按日期挑，不现场生成。
## 日期序号由调用方传入，核心层不读时钟。配置在 economy.json 的 dailyChallenge。


static func fresh() -> Dictionary:
	return {"wonDay": -1, "streak": 0, "tryDay": -1, "tries": 0}


## 当天打哪一关：玩家打到过的挑战关里按日期轮换，同进度的玩家同一天是同一关。
## cycle 是每几关一个挑战关，level_count 是关卡总数
static func level_for(day: int, player_level: int, cycle: int, level_count: int) -> int:
	var top: int = clampi(player_level, cycle, level_count) / cycle
	# 只在最难的后一半里轮换，前面的太容易
	var from: int = maxi(1, (top + 1) / 2)
	return (from + posmod(day * 7 + 3, top - from + 1)) * cycle


static func won_today(save: Dictionary, day: int) -> bool:
	return int(save["challenge"]["wonDay"]) == day


## 连续过关天数；昨天和今天都没过就断了
static func streak(save: Dictionary, day: int) -> int:
	var c: Dictionary = save["challenge"]
	return int(c["streak"]) if int(c["wonDay"]) >= day - 1 else 0


## 今天已经进过几次
static func tries(save: Dictionary, day: int) -> int:
	var c: Dictionary = save["challenge"]
	return int(c["tries"]) if int(c["tryDay"]) == day else 0


## 每天第一次免费，之后要看广告或花金币
static func is_free(save: Dictionary, day: int) -> bool:
	return tries(save, day) == 0


## 能不能免费开始。免费的这一次进场时不记次数，局内走了第一步才调 enter(..., "free") 记上；
## 进来不走直接退出不算
static func can_start_free(save: Dictionary, day: int) -> bool:
	return not won_today(save, day) and is_free(save, day)


## 进场。pay: "free"（当天第一次）、"ad"（界面已看完广告）、"coins"。进不了返回 false
static func enter(save: Dictionary, eco: Dictionary, day: int, pay: String) -> bool:
	if won_today(save, day):
		return false
	if pay == "free" and not is_free(save, day):
		return false
	if pay == "coins":
		var price: int = int(eco["dailyChallenge"]["retryCoins"])
		if int(save["coins"]) < price:
			return false
		save["coins"] = int(save["coins"]) - price
	var c: Dictionary = save["challenge"]
	c["tries"] = tries(save, day) + 1
	c["tryDay"] = day
	return true


## 过关：开每日宝箱；连续天数到了再开大宝箱（之后从头数）。combo_coins 是本关连击金币，一起入账。
## 返回 { prizes: 奖品列表, big: 是否开了大宝箱 }；今天已经领过返回空 prizes
static func win(
	save: Dictionary,
	eco: Dictionary,
	species: Array,
	day: int,
	now: int,
	rng: Rng,
	combo_coins: int = 0
) -> Dictionary:
	if won_today(save, day):
		return {"prizes": [], "big": false}
	var cfg: Dictionary = eco["dailyChallenge"]
	var c: Dictionary = save["challenge"]
	c["streak"] = streak(save, day) + 1
	c["wonDay"] = day
	var prizes: Array = Album.grant(save, cfg["reward"], now)
	var rarity: String = Cards.roll_rarity(eco, eco["chest"]["cardRates"], rng)
	var open: Array = Album.pool(eco, species, int(save["level"]))
	var card: Dictionary = Cards.give(save, eco, Cards.pick(save, open, rarity, rng, true))
	prizes.append({"kind": "card", "card_id": card["id"], "rarity": card["rarity"]})
	if combo_coins > 0:
		save["coins"] = int(save["coins"]) + combo_coins
		prizes.append({"kind": "coin", "amount": combo_coins, "combo": true})
	var big: bool = int(c["streak"]) >= int(cfg["streakDays"])
	if big:
		c["streak"] = 0
		prizes.append_array(Album.grant(save, cfg["streakReward"], now))
	return {"prizes": prizes, "big": big}
