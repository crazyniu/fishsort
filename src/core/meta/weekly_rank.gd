class_name WeeklyRank
extends RefCounted
## 排行榜每周奖励，见 docs/01 第 5.9 节。每周一（周序号变了）第一次进主页时按上周排名发一次。
## 上周过关数由 Daily.roll 跨周时留在 save["week"] 的 lastId / lastCleared；
## 已结算到哪一周记在 save["week"]["paid"]。奖励档在 economy.json 的 rankReward。


## 把自己插进榜单并排序：过关数从多到少，同分时自己排在前面。rows 是平台榜单（不含自己）
static func sorted(rows: Array, me: Dictionary) -> Array:
	var out: Array = rows.duplicate()
	var mine: Dictionary = me.duplicate()
	mine["me"] = true
	out.append(mine)
	out.sort_custom(
		func(a: Dictionary, b: Dictionary) -> bool:
			var sa: int = int(a["score"])
			var sb: int = int(b["score"])
			if sa != sb:
				return sa > sb
			return bool(a.get("me", false)) and not bool(b.get("me", false))
	)
	return out


## 自己过了 score 关时排第几（1 起）
static func rank_of(rows: Array, score: int) -> int:
	var list: Array = sorted(rows, {"score": score})
	for i: int in list.size():
		if bool(list[i].get("me", false)):
			return i + 1
	return list.size()


## 第 rank 名的奖励：{ coins, tools（每种技能各几个） }。score 少于 1 关不上榜，返回空字典
static func reward_for(eco: Dictionary, rank: int, score: int) -> Dictionary:
	if score < 1:
		return {}
	var cfg: Dictionary = eco["rankReward"]
	for tier: Dictionary in cfg["tiers"]:
		if rank <= int(tier["upTo"]):
			return tier
	return cfg["rest"]


## 结算上周。rows 是平台的周榜，day 是今天的日期序号。
## 返回 { rank, score, prizes }；这周已经结算过、排行没开放或上周没上榜返回空字典
static func settle(
	save: Dictionary, eco: Dictionary, rows: Array, day: int, now: int
) -> Dictionary:
	Daily.roll(save, day)
	var week: Dictionary = save["week"]
	var cur: int = int(week["id"])
	if int(week["paid"]) >= cur:
		return {}
	week["paid"] = cur
	if not Features.is_unlocked(eco, "rank", int(save["level"])):
		return {}
	var score: int = int(week["lastCleared"]) if int(week["lastId"]) == cur - 1 else 0
	var rank: int = rank_of(rows, score)
	var reward: Dictionary = reward_for(eco, rank, score)
	if reward.is_empty():
		return {}
	return {"rank": rank, "score": score, "prizes": Album.grant(save, reward, now)}
