class_name Dex
extends RefCounted
## 生物图鉴，见 docs/01 第 5.13 节。记录局内救过的每种生物和数量；
## 每种救够几档数量各领一次金币。配置在 economy.json 的 dex。


static func fresh() -> Dictionary:
	return {"seen": {}, "claimed": {}}


## 过关时记账。counts: { 生物 id: 这一关救了几只 }
static func record(save: Dictionary, counts: Dictionary) -> void:
	var seen: Dictionary = save["dex"]["seen"]
	for id: String in counts:
		seen[id] = int(seen.get(id, 0)) + int(counts[id])


## 这次过关算不算进图鉴：只有通过当前进度的关（首次通关）和每日挑战才算，重玩旧关不算。
## level_id 是刚过的关，在 Settle.win 推进进度之前调用
static func counts_win(save: Dictionary, level_id: int, daily: bool) -> bool:
	return daily or level_id == int(save["level"])


static func count(save: Dictionary, id: String) -> int:
	return int(save["dex"]["seen"].get(id, 0))


## 已经领到第几档（0 = 还没领过）
static func claimed_tier(save: Dictionary, id: String) -> int:
	return int(save["dex"]["claimed"].get(id, 0))


## 救的数量够到第几档
static func reached_tier(save: Dictionary, eco: Dictionary, id: String) -> int:
	var n: int = count(save, id)
	var tier: int = 0
	for need: int in eco["dex"]["tiers"]:
		if n >= need:
			tier += 1
	return tier


static func can_claim(save: Dictionary, eco: Dictionary, id: String) -> bool:
	return reached_tier(save, eco, id) > claimed_tier(save, id)


## 下一档要救多少只；全部领完返回 0
static func next_need(save: Dictionary, eco: Dictionary, id: String) -> int:
	var tiers: Array = eco["dex"]["tiers"]
	var at: int = claimed_tier(save, id)
	return int(tiers[at]) if at < tiers.size() else 0


## 领下一档的金币，返回金币数；不能领返回 0
static func claim(save: Dictionary, eco: Dictionary, id: String) -> int:
	if not can_claim(save, eco, id):
		return 0
	var at: int = claimed_tier(save, id)
	var coins: int = int(eco["dex"]["coins"][at])
	save["dex"]["claimed"][id] = at + 1
	save["coins"] = int(save["coins"]) + coins
	return coins


## 有几种生物有奖可领（页签红点用）
static func claimable(save: Dictionary, eco: Dictionary) -> int:
	var n: int = 0
	for id: String in save["dex"]["seen"]:
		if can_claim(save, eco, id):
			n += 1
	return n
