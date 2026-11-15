class_name LevelChest
extends RefCounted
## 过关宝箱，见 docs/01 第 3.4 节。存档 save["chest"] = { dry, lastLevel, adTaken }。


static func fresh() -> Dictionary:
	return {"dry": 0, "lastLevel": 0, "adTaken": false}


## 开箱并入账。返回 { kind: "coins"|"skill"|"card", coins, skill, card, pity }
## card 为 Cards.give 的结果（{ id, rarity, is_new, coins }），没有则为空字典。
## 连续 pityAfter 关没出卡，下一关必出一张未拥有的卡。
static func open(
	save: Dictionary, eco: Dictionary, species: Array, level_id: int, challenge: bool, rng: Rng
) -> Dictionary:
	var st: Dictionary = save["chest"]
	st["lastLevel"] = level_id
	st["adTaken"] = false
	var res: Dictionary = _roll(save, eco, species, challenge, rng, int(st["dry"]))
	st["dry"] = 0 if res["kind"] == "card" else int(st["dry"]) + 1
	return res


## 看广告再开一个，每关一次。没开过本关的箱子或已开过返回空字典。不影响保底计数（出卡则清零）
static func open_ad(
	save: Dictionary, eco: Dictionary, species: Array, level_id: int, challenge: bool, rng: Rng
) -> Dictionary:
	var st: Dictionary = save["chest"]
	if int(st["lastLevel"]) != level_id or st["adTaken"]:
		return {}
	st["adTaken"] = true
	var res: Dictionary = _roll(save, eco, species, challenge, rng, 0)
	if res["kind"] == "card":
		st["dry"] = 0
	return res


static func _roll(
	save: Dictionary, eco: Dictionary, species: Array, challenge: bool, rng: Rng, dry: int
) -> Dictionary:
	var cfg: Dictionary = eco["chest"]
	var res: Dictionary = {"kind": "coins", "coins": 0, "skill": "", "card": {}, "pity": false}
	var pity: bool = dry >= int(cfg["pityAfter"])
	var kind: String = "card"
	if not challenge and not pity:
		var n: Dictionary = cfg["normal"]
		var r: int = rng.range_i(1, 100)
		if r <= int(n["coins"]):
			kind = "coins"
		elif r <= int(n["coins"]) + int(n["skill"]):
			kind = "skill"
	if kind == "skill":
		res["skill"] = Skills.grant_random(save, eco, rng)
		if res["skill"] == "":
			kind = "coins"  # 还没有任何技能开放：改发金币
	if kind == "coins":
		var n2: Dictionary = cfg["normal"]
		var amount: int = rng.range_i(int(n2["coinMin"]), int(n2["coinMax"]))
		save["coins"] = int(save["coins"]) + amount
		res["coins"] = amount
	elif kind == "card":
		var boost: float = float(cfg["challengeRareBoost"]) if challenge else 1.0
		var rarity: String = Cards.roll_rarity(
			eco, cfg["cardRates"], rng, 0, Cards.rank(eco, "rare"), boost
		)
		var card: Dictionary = Cards.pick(save, species, rarity, rng, pity)
		res["card"] = Cards.give(save, eco, card)
		res["pity"] = pity
	res["kind"] = kind
	return res
