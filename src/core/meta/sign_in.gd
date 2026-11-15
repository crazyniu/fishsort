class_name SignIn
extends RefCounted
## 七日签到（新版），见 docs/01 第 5.6 节。表在 economy.json 的 signInDays。
## 存档沿用 save["signin"] = { count, lastDay }，新增 doubledDay（已翻倍的那天）。
## 断签不清零，按累计天数循环。


static func can_claim(save: Dictionary, day: int) -> bool:
	return int(save["signin"]["lastDay"]) != day


## 下一次领的是第几天（0 起，0–6）
static func next_index(save: Dictionary, eco: Dictionary) -> int:
	return int(save["signin"]["count"]) % (eco["signInDays"] as Array).size()


## 签到。doubled 为 true（看完广告后）奖励翻倍，宝箱多开一个。
## 返回 { index, coins, wheel, skills: [id], cards: [card], unlimited, doubled }；今天已签返回空字典
static func claim(
	save: Dictionary,
	eco: Dictionary,
	species: Array,
	rng: Rng,
	day: int,
	now: int,
	doubled: bool = false
) -> Dictionary:
	if not can_claim(save, day):
		return {}
	var idx: int = next_index(save, eco)
	save["signin"]["count"] = int(save["signin"]["count"]) + 1
	save["signin"]["lastDay"] = day
	var res: Dictionary = {
		"index": idx,
		"coins": 0,
		"wheel": 0,
		"skills": [],
		"cards": [],
		"unlimited": 0,
		"doubled": false,
	}
	_grant(save, eco, species, rng, now, eco["signInDays"][idx], res)
	if doubled:
		_double(save, eco, species, rng, now, res)
	return res


## 先签到后看广告的流程：把当天奖励再发一份。每天一次；今天没签或已翻倍返回空字典
static func double_today(
	save: Dictionary,
	eco: Dictionary,
	species: Array,
	rng: Rng,
	day: int,
	now: int,
	last: Dictionary
) -> Dictionary:
	if can_claim(save, day) or int(save["signin"].get("doubledDay", -1)) == day or last.is_empty():
		return {}
	var res: Dictionary = last.duplicate(true)
	_double(save, eco, species, rng, now, res)
	return res


static func _double(
	save: Dictionary, eco: Dictionary, species: Array, rng: Rng, now: int, res: Dictionary
) -> void:
	save["signin"]["doubledDay"] = save["signin"]["lastDay"]
	res["doubled"] = true
	_grant(save, eco, species, rng, now, eco["signInDays"][int(res["index"])], res)


static func _grant(
	save: Dictionary,
	eco: Dictionary,
	species: Array,
	rng: Rng,
	now: int,
	day_cfg: Dictionary,
	res: Dictionary
) -> void:
	if day_cfg.has("coins"):
		save["coins"] = int(save["coins"]) + int(day_cfg["coins"])
		res["coins"] = int(res["coins"]) + int(day_cfg["coins"])
	if day_cfg.has("wheel"):
		Wheel.add_spins(save, int(day_cfg["wheel"]))
		res["wheel"] = int(res["wheel"]) + int(day_cfg["wheel"])
	if day_cfg.has("skill"):
		for i: int in int(day_cfg["skill"]):
			(res["skills"] as Array).append(Skills.grant_random(save, eco, rng))
	if day_cfg.has("chest"):
		_small_chest(save, eco, species, rng, day_cfg["chest"], res)
	if day_cfg.has("bigChest"):
		var big: Dictionary = day_cfg["bigChest"]
		var rarity: String = Cards.roll_rarity(
			eco, eco["chest"]["cardRates"], rng, Cards.rank(eco, big["minRarity"])
		)
		(res["cards"] as Array).append(
			Cards.give(save, eco, Cards.pick(save, species, rarity, rng))
		)
		save["coins"] = int(save["coins"]) + int(big["coins"])
		res["coins"] = int(res["coins"]) + int(big["coins"])
		Lives.grant_unlimited(save, int(big["unlimitedSeconds"]), now)
		res["unlimited"] = int(res["unlimited"]) + int(big["unlimitedSeconds"])


## 第 3 天宝箱：按权重出一个技能或一张卡
static func _small_chest(
	save: Dictionary, eco: Dictionary, species: Array, rng: Rng, w: Dictionary, res: Dictionary
) -> void:
	var skill_first: bool = rng.range_i(1, int(w["skill"]) + int(w["card"])) <= int(w["skill"])
	if skill_first:
		var id: String = Skills.grant_random(save, eco, rng)
		if id != "":
			(res["skills"] as Array).append(id)
			return
	var rarity: String = Cards.roll_rarity(eco, eco["chest"]["cardRates"], rng)
	(res["cards"] as Array).append(Cards.give(save, eco, Cards.pick(save, species, rarity, rng)))
