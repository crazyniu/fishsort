class_name Cards
extends RefCounted
## 图鉴卡的稀有度抽取与入账。宝箱、抽奖、签到共用。


static func rank(eco: Dictionary, rarity: String) -> int:
	return (eco["rarities"] as Array).find(rarity)


## 按权重抽稀有度。rates: { 稀有度: 权重 }（可为小数）；min_rank 以下的权重视为 0；
## boost_rank 及以上的权重乘 boost（挑战关宝箱）
static func roll_rarity(
	eco: Dictionary,
	rates: Dictionary,
	rng: Rng,
	min_rank: int = 0,
	boost_rank: int = 99,
	boost: float = 1.0
) -> String:
	var weights: Array[float] = []
	var total: float = 0.0
	var order: Array = eco["rarities"]
	for i: int in order.size():
		var w: float = float(rates.get(order[i], 0.0))
		if i < min_rank:
			w = 0.0
		elif i >= boost_rank:
			w *= boost
		weights.append(w)
		total += w
	var roll: float = rng.randf() * total
	for i: int in order.size():
		roll -= weights[i]
		if roll < 0.0 and weights[i] > 0.0:
			return order[i]
	# 浮点误差兜底：取最后一个有权重的
	for i: int in range(order.size() - 1, -1, -1):
		if weights[i] > 0.0:
			return order[i]
	return order[0]


## 从该稀有度里挑一张。prefer_unowned 时优先挑没有的，该档集齐则退到任意未拥有，再退到该档任意
static func pick(
	save: Dictionary, species: Array, rarity: String, rng: Rng, prefer_unowned: bool = false
) -> Dictionary:
	var cards: Dictionary = save["cards"]
	var same: Array = species.filter(func(sp: Dictionary) -> bool: return sp["rarity"] == rarity)
	if prefer_unowned:
		var miss: Array = same.filter(func(sp: Dictionary) -> bool: return not cards.has(sp["id"]))
		if miss.is_empty():
			miss = species.filter(func(sp: Dictionary) -> bool: return not cards.has(sp["id"]))
		if not miss.is_empty():
			return rng.pick(miss)
	return rng.pick(same)


## 入账一张卡：新卡进图鉴，重复卡换金币。返回 { id, rarity, is_new, coins }
static func give(save: Dictionary, eco: Dictionary, card: Dictionary) -> Dictionary:
	var cards: Dictionary = save["cards"]
	var is_new: bool = not cards.has(card["id"])
	cards[card["id"]] = int(cards.get(card["id"], 0)) + 1
	var coins: int = 0 if is_new else int(eco["dupeCoins"][card["rarity"]])
	save["coins"] = int(save["coins"]) + coins
	return {"id": card["id"], "rarity": card["rarity"], "is_new": is_new, "coins": coins}
