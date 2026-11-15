class_name Album
extends RefCounted
## 图鉴分册，见 docs/01 第 5.4 节。60 张卡分成几册，每册按关开放；
## 集齐一册领一次册子大奖，全部集齐领终极大奖。册子与奖励在 economy.json 的 album。


static func books(eco: Dictionary) -> Array:
	return eco["album"]["books"]


static func is_open(eco: Dictionary, book: int, level: int) -> bool:
	return level >= int(books(eco)[book]["unlock"])


## 现在能掉落的卡：只出已开放册子里的。species 是 species.json 的列表
static func pool(eco: Dictionary, species: Array, level: int) -> Array:
	var open: Dictionary = {}
	for b: Dictionary in books(eco):
		if level >= int(b["unlock"]):
			for id: String in b["cards"]:
				open[id] = true
	var out: Array = species.filter(func(sp: Dictionary) -> bool: return open.has(sp["id"]))
	# 图鉴开放前也可能开出卡（连击、宝箱）：按第一册算
	if out.is_empty():
		var first: Array = books(eco)[0]["cards"]
		out = species.filter(func(sp: Dictionary) -> bool: return first.has(sp["id"]))
	return out


## 这一册收了几张
static func have(save: Dictionary, eco: Dictionary, book: int) -> int:
	var cards: Dictionary = save["cards"]
	var n: int = 0
	for id: String in books(eco)[book]["cards"]:
		if cards.has(id):
			n += 1
	return n


static func is_complete(save: Dictionary, eco: Dictionary, book: int) -> bool:
	return have(save, eco, book) >= (books(eco)[book]["cards"] as Array).size()


static func is_claimed(save: Dictionary, book: int) -> bool:
	return (save["album"]["claimed"] as Array).has(book)


static func can_claim(save: Dictionary, eco: Dictionary, book: int) -> bool:
	return (
		is_open(eco, book, int(save["level"]))
		and is_complete(save, eco, book)
		and not is_claimed(save, book)
	)


static func can_claim_final(save: Dictionary, eco: Dictionary) -> bool:
	if bool(save["album"]["final"]):
		return false
	for i: int in books(eco).size():
		if not is_complete(save, eco, i):
			return false
	return true


## 有几个奖可以领（页签红点用）
static func claimable(save: Dictionary, eco: Dictionary) -> int:
	var n: int = 1 if can_claim_final(save, eco) else 0
	for i: int in books(eco).size():
		if can_claim(save, eco, i):
			n += 1
	return n


## 领一册的大奖。返回奖品列表（界面开奖用），不能领返回空数组
static func claim(save: Dictionary, eco: Dictionary, book: int, now: int) -> Array:
	if not can_claim(save, eco, book):
		return []
	(save["album"]["claimed"] as Array).append(book)
	return grant(save, books(eco)[book]["reward"], now)


## 专属头像框解锁了吗（领过终极大奖就有）
static func has_frame(save: Dictionary) -> bool:
	return bool(save["album"].get("frame", false))


## 领终极大奖：奖励之外还解锁专属头像框（奖品列表末尾多一项 frame）
static func claim_final(save: Dictionary, eco: Dictionary, now: int) -> Array:
	if not can_claim_final(save, eco):
		return []
	save["album"]["final"] = true
	save["album"]["frame"] = true
	var out: Array = grant(save, eco["album"]["final"], now)
	out.append({"kind": "frame", "amount": 1})
	return out


## 发一份奖励并返回奖品列表（每日挑战也用）。reward: { coins, tools（每种技能各几个）, unlimited（无限生命秒数） }
static func grant(save: Dictionary, reward: Dictionary, now: int) -> Array:
	var out: Array = []
	var coins: int = int(reward.get("coins", 0))
	if coins > 0:
		save["coins"] = int(save["coins"]) + coins
		out.append({"kind": "coin", "amount": coins})
	var each: int = int(reward.get("tools", 0))
	if each > 0:
		var tools: Dictionary = save["tools"]
		for id: String in tools:
			tools[id] = int(tools[id]) + each
			out.append({"kind": "skill", "skill": id, "amount": each})
	var secs: int = int(reward.get("unlimited", 0))
	if secs > 0:
		Lives.grant_unlimited(save, secs, now)
		# 界面上的无限生命奖品按分钟计
		out.append({"kind": "inf_life", "amount": secs / 60})
	return out
