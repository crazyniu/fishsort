class_name Combo
extends RefCounted
## 一关内的连击计数与奖励。时间由调用方传入，随机数用传入的 Rng。

var count: int = 0
var best: int = 0
var coins: int = 0
var card_won: bool = false
var _last: float = -1000.0


## 没命中（鱼进了暂存槽）时断连
func miss() -> void:
	count = 0


## 命中一次。返回 { count, tier, tier_up, coins, card }；tier 为 -1 表示还没到起算数
func hit(now: float, cfg: Dictionary, rng: Rng) -> Dictionary:
	if now - _last > float(cfg["windowSeconds"]):
		count = 0
	count += 1
	_last = now
	best = maxi(best, count)
	var res: Dictionary = {"count": count, "tier": -1, "tier_up": false, "coins": 0, "card": false}
	if count < int(cfg["startAt"]):
		return res
	var tiers: Array = cfg["tiers"]
	for i: int in tiers.size():
		if count >= int(tiers[i]["at"]):
			res["tier"] = i
	var tier: Dictionary = tiers[int(res["tier"])]
	res["tier_up"] = int(tier["at"]) == count
	var gain: int = mini(int(tier["coins"]), int(cfg["maxCoinsPerLevel"]) - coins)
	coins += gain
	res["coins"] = gain
	var chance: int = int((cfg["cardChance"] as Dictionary).get(str(count), 0))
	if not card_won and chance > 0 and rng.range_i(1, 100) <= chance:
		card_won = true
		res["card"] = true
	return res


## 结算时的最高连击奖
func best_bonus(cfg: Dictionary) -> int:
	return best_bonus_for(best, cfg)


static func best_bonus_for(best_combo: int, cfg: Dictionary) -> int:
	var b: Dictionary = cfg["bestBonus"]
	if best_combo < int(b["minCombo"]):
		return 0
	return mini(best_combo * int(b["coinsPerCombo"]), int(b["max"]))
