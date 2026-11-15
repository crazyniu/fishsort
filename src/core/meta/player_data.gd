class_name PlayerData
extends RefCounted
## 存档结构与版本迁移，见 docs/04-技术架构.md 第 6 节。存档就是一个可直接转 JSON 的字典。

const VERSION := 2


static func create(eco: Dictionary) -> Dictionary:
	return {
		"version": VERSION,
		"level": 1,
		"coins": 0,
		"bestCombo": 0,
		"lives": Lives.fresh(eco),
		"chest": LevelChest.fresh(),
		"wheel": Wheel.fresh(),
		"skillsGranted": {},
		"tools": (eco["toolStart"] as Dictionary).duplicate(),
		"cards": {},
		"album": {"claimed": [], "final": false, "frame": false},
		"challenge": DailyChallenge.fresh(),
		"dex": Dex.fresh(),
		"base": HomeBase.fresh(),
		"signin": {"count": 0, "lastDay": -1, "doubledDay": -1},
		"week": {"id": -1, "cleared": 0, "lastId": -1, "lastCleared": 0, "paid": -1},
		"daily": Daily.fresh(-1),
		"ads": {"interstitialAt": -100000.0, "interstitialLevel": 0, "rewardedAt": -100000.0},
		"seenTips": {},
		"fails": {"level": 0, "count": 0},
		"settings": {"sound": true, "music": true, "vibrate": true},
	}


## 读档后调用：旧版本逐级升级，缺的字段用默认值补齐
static func migrate(save: Dictionary, eco: Dictionary) -> Dictionary:
	var from: int = int(save.get("version", 0))
	var fresh: Dictionary = create(eco)
	var had_frame: bool = save.get("album") is Dictionary and save["album"].has("frame")
	var had_base: bool = save.has("base")
	for k: String in fresh:
		if not save.has(k):
			save[k] = fresh[k]
		elif fresh[k] is Dictionary and save[k] is Dictionary:
			for sub: String in fresh[k]:
				if not (save[k] as Dictionary).has(sub) and k != "cards":
					save[k][sub] = fresh[k][sub]
	# 头像框是后加的字段：已经领过终极大奖的老存档补上
	if not had_frame and bool(save["album"]["final"]):
		save["album"]["frame"] = true
	if from < 2:
		_migrate_1_to_2(save, eco)
	# 鱼票、旧抽卡保底、旧版家园（stars / scene / sceneStep）已经不用了，旧存档里带着的一并清掉。
	# 新家园的星星在 base 里
	for dead: String in ["tickets", "stars", "pity", "scene", "sceneStep"]:
		save.erase(dead)
	if not had_base:
		# 家园上线前的老存档：按已通关数补发星星（见 HomeBase.retro_stars），建造进度从零开始
		save["base"]["stars"] = HomeBase.retro_stars(eco, int(save["level"]) - 1)
	save["version"] = VERSION
	return save


## v1 → v2：金币体系放大 ×5（见 docs/01 第 6 节），鱼票折成金币，补发已到关的技能解锁礼。
static func _migrate_1_to_2(save: Dictionary, eco: Dictionary) -> void:
	var m: Dictionary = eco["migration"]
	save["coins"] = (
		int(save["coins"]) * int(m["coinsMultiplier"])
		+ int(save.get("tickets", 0)) * int(m["ticketToCoins"])
	)
	# 旧的每日计数结构换新，保留今天是哪天
	save["daily"] = Daily.fresh(int(save["daily"].get("day", -1)))
	Skills.sync_unlocks(save, eco)


## 一次性教学 / 提示有没有看过（键如 skill_blow、TIP_LIVES）
static func tip_seen(save: Dictionary, key: String) -> bool:
	return (save.get("seenTips", {}) as Dictionary).has(key)


static func mark_tip(save: Dictionary, key: String) -> void:
	if not save.has("seenTips"):
		save["seenTips"] = {}
	save["seenTips"][key] = true
