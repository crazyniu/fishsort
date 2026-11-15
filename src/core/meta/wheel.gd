class_name Wheel
extends RefCounted
## 抽奖转盘，见 docs/01 第 5.5 节。存档 save["wheel"] = { extra, dry, total }：
## extra 存下来的额外次数，dry 是连续没出史诗以上的次数；
## 每日计数在 save["daily"] 的 wheelFree / wheelAd 与 share.wheel。


static func fresh() -> Dictionary:
	return {"extra": 0, "dry": 0, "total": 0}


## 公示概率：[{ id, kind, rarity, amount, percent }]，percent 由权重归一化得到，总和 100
static func odds(eco: Dictionary) -> Array[Dictionary]:
	var prizes: Array = eco["wheel"]["prizes"]
	var total: float = 0.0
	for p: Dictionary in prizes:
		total += float(p["weight"])
	var out: Array[Dictionary] = []
	for p: Dictionary in prizes:
		(
			out
			. append(
				{
					"id": p["id"],
					"kind": p["kind"],
					"rarity": p.get("rarity", ""),
					"amount": int(p.get("amount", 0)),
					"percent": float(p["weight"]) / total * 100.0,
				}
			)
		)
	return out


## 当天还能用的次数（免费 + 存下来的）
static func spins_left(save: Dictionary, eco: Dictionary, day: int) -> int:
	Daily.roll(save, day)
	return free_left(save, eco, day) + int(save["wheel"]["extra"])


static func free_left(save: Dictionary, eco: Dictionary, day: int) -> int:
	Daily.roll(save, day)
	return maxi(int(eco["wheel"]["freePerDay"]) - int(save["daily"]["wheelFree"]), 0)


static func ad_left(save: Dictionary, eco: Dictionary, day: int) -> int:
	Daily.roll(save, day)
	return maxi(int(eco["wheel"]["adPerDay"]) - int(save["daily"]["wheelAd"]), 0)


## 加一次抽奖次数（首胜、签到等）
static func add_spins(save: Dictionary, n: int = 1) -> void:
	save["wheel"]["extra"] = int(save["wheel"]["extra"]) + n


## 看完广告 +1 次。每天上限见 wheel.adPerDay，用完返回 false
static func claim_ad(save: Dictionary, eco: Dictionary, day: int) -> bool:
	if ad_left(save, eco, day) <= 0:
		return false
	save["daily"]["wheelAd"] = int(save["daily"]["wheelAd"]) + 1
	add_spins(save)
	return true


## 抽一次。pay: "spin" 先用每日免费再用存下来的次数；"coins" 花金币。
## 没有次数 / 金币不够返回空字典。返回 { prize, card, coins, skill, unlimited, pity }
static func spin(
	save: Dictionary, eco: Dictionary, species: Array, rng: Rng, day: int, now: int, pay: String
) -> Dictionary:
	Daily.roll(save, day)
	if pay == "coins":
		var cost: int = int(eco["wheel"]["coinCost"])
		if int(save["coins"]) < cost:
			return {}
		save["coins"] = int(save["coins"]) - cost
	elif free_left(save, eco, day) > 0:
		save["daily"]["wheelFree"] = int(save["daily"]["wheelFree"]) + 1
	elif int(save["wheel"]["extra"]) > 0:
		save["wheel"]["extra"] = int(save["wheel"]["extra"]) - 1
	else:
		return {}
	return _draw(save, eco, species, rng, now, "")


## 十连，花金币。保底至少 1 张稀有以上。返回 { results: [单抽结果 × 10] }；金币不够返回空字典
static func ten_pull(
	save: Dictionary, eco: Dictionary, species: Array, rng: Rng, day: int, now: int
) -> Dictionary:
	Daily.roll(save, day)
	var cost: int = int(eco["wheel"]["tenCost"])
	if int(save["coins"]) < cost:
		return {}
	save["coins"] = int(save["coins"]) - cost
	var n: int = int(eco["wheel"]["tenCount"])
	var min_rank: int = Cards.rank(eco, eco["wheel"]["tenMinRarity"])
	var results: Array[Dictionary] = []
	var has_good: bool = false
	for i: int in n:
		var force: String = ""
		if i == n - 1 and not has_good:
			force = eco["wheel"]["tenMinRarity"]
		var r: Dictionary = _draw(save, eco, species, rng, now, force)
		if r["card"] != {} and Cards.rank(eco, r["card"]["rarity"]) >= min_rank:
			has_good = true
		results.append(r)
	return {"results": results}


## 单次抽取。force 非空时只在该稀有度及以上的卡片奖里抽（保底）
static func _draw(
	save: Dictionary, eco: Dictionary, species: Array, rng: Rng, now: int, force: String
) -> Dictionary:
	var w: Dictionary = save["wheel"]
	var pity: bool = int(w["dry"]) >= int(eco["wheel"]["pityAfter"])
	if pity:
		force = eco["wheel"]["pityMinRarity"]
	var prize: Dictionary = _pick_prize(eco, rng, force)
	var res: Dictionary = {
		"prize": prize["id"],
		"kind": prize["kind"],
		"card": {},
		"coins": 0,
		"skill": "",
		"unlimited": 0,
		"pity": pity,
	}
	match prize["kind"]:
		"coins":
			save["coins"] = int(save["coins"]) + int(prize["amount"])
			res["coins"] = int(prize["amount"])
		"skill":
			res["skill"] = Skills.grant_random(save, eco, rng)
		"unlimited":
			Lives.grant_unlimited(save, int(prize["amount"]), now)
			res["unlimited"] = int(prize["amount"])
		"card":
			var card: Dictionary = Cards.pick(save, species, prize["rarity"], rng)
			res["card"] = Cards.give(save, eco, card)
	var epic_rank: int = Cards.rank(eco, eco["wheel"]["pityMinRarity"])
	var got_epic: bool = prize["kind"] == "card" and Cards.rank(eco, prize["rarity"]) >= epic_rank
	w["dry"] = 0 if got_epic else int(w["dry"]) + 1
	w["total"] = int(w["total"]) + 1
	return res


static func _pick_prize(eco: Dictionary, rng: Rng, min_rarity: String) -> Dictionary:
	var min_rank: int = Cards.rank(eco, min_rarity) if min_rarity != "" else -1
	var pool: Array = []
	var total: float = 0.0
	for p: Dictionary in eco["wheel"]["prizes"]:
		if min_rank >= 0 and (p["kind"] != "card" or Cards.rank(eco, p["rarity"]) < min_rank):
			continue
		pool.append(p)
		total += float(p["weight"])
	var roll: float = rng.randf() * total
	for p: Dictionary in pool:
		roll -= float(p["weight"])
		if roll < 0.0:
			return p
	return pool[pool.size() - 1]
