class_name Skills
extends RefCounted
## 四个技能：洗牌 shuffle、吹泡 blow、渔网 net、洋流 current。见 docs/01 第 5.2 节。
## 存档：save["tools"][id] 库存；save["skillsGranted"][id] 是否已发过解锁礼；
## save["daily"]["toolFree"][id] 今天是否已用过免费次。


static func ids(eco: Dictionary) -> Array:
	return eco["skills"]["order"]


static func unlock_level(eco: Dictionary, id: String) -> int:
	return Features.unlock_level(eco, "skill_" + id)


static func is_unlocked(eco: Dictionary, id: String, level: int) -> bool:
	return Features.is_unlocked(eco, "skill_" + id, level)


static func unlocked_ids(eco: Dictionary, level: int) -> Array:
	return ids(eco).filter(func(id: String) -> bool: return is_unlocked(eco, id, level))


static func count(save: Dictionary, id: String) -> int:
	return int(save["tools"].get(id, 0))


static func add(save: Dictionary, id: String, n: int = 1) -> void:
	save["tools"][id] = count(save, id) + n


static func price(eco: Dictionary, id: String) -> int:
	return int(eco["toolPrice"][id])


## 到了解锁关的技能发 2 个（只发一次）。返回这次新发的技能 id 列表。每次进度变化后调用
static func sync_unlocks(save: Dictionary, eco: Dictionary) -> Array[String]:
	var out: Array[String] = []
	var granted: Dictionary = save["skillsGranted"]
	for id: String in ids(eco):
		if is_unlocked(eco, id, int(save["level"])) and not granted.has(id):
			granted[id] = true
			add(save, id, int(eco["skills"]["grantOnUnlock"]))
			out.append(id)
	return out


## 今天这个技能的免费次还在不在
static func free_available(save: Dictionary, id: String) -> bool:
	return not (save["daily"]["toolFree"] as Dictionary).has(id)


## 使用前调用。used_this_level 是本关已用次数（界面层记）。
## 返回 { ok, free, reason }；reason 为 "locked" / "limit" / "empty" / ""。
## ok 时已经扣了库存（或记了免费次），界面层随后去调 Rules。
static func try_use(
	save: Dictionary, eco: Dictionary, id: String, used_this_level: int, day: int
) -> Dictionary:
	Daily.roll(save, day)
	if not is_unlocked(eco, id, int(save["level"])):
		return {"ok": false, "free": false, "reason": "locked"}
	if used_this_level >= int(eco["toolMaxPerLevel"]):
		return {"ok": false, "free": false, "reason": "limit"}
	if free_available(save, id):
		save["daily"]["toolFree"][id] = true
		return {"ok": true, "free": true, "reason": ""}
	if count(save, id) <= 0:
		return {"ok": false, "free": false, "reason": "empty"}
	save["tools"][id] = count(save, id) - 1
	return {"ok": true, "free": false, "reason": ""}


## 金币买 1 个
static func buy(save: Dictionary, eco: Dictionary, id: String) -> bool:
	return Meta.buy_tool(save, eco, id)


## 随机发一个已解锁的技能（宝箱、抽奖、分享用）；一个都没解锁时返回空串，不发
static func grant_random(save: Dictionary, eco: Dictionary, rng: Rng) -> String:
	var pool: Array = unlocked_ids(eco, int(save["level"]))
	if pool.is_empty():
		return ""
	var id: String = rng.pick(pool)
	add(save, id)
	return id
