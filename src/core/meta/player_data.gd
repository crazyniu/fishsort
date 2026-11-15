class_name PlayerData
extends RefCounted
## 存档结构与版本迁移，见 docs/04-技术架构.md 第 6 节。存档就是一个可直接转 JSON 的字典。

const VERSION := 2


static func create(eco: Dictionary) -> Dictionary:
	return {
		"version": VERSION,
		"level": 1,
		"coins": 0,
		"tickets": 0,  ## 已废弃：v2 起鱼票折成金币，字段保留给旧界面
		"stars": 0,  ## 已废弃：v2 起不再使用，字段保留
		"lives": Lives.fresh(eco),
		"chest": LevelChest.fresh(),
		"wheel": Wheel.fresh(),
		"skillsGranted": {},
		"tools": (eco["toolStart"] as Dictionary).duplicate(),
		"cards": {},
		"pity": {"levelCard": 0, "ticketPack": 0},
		"scene": 0,
		"sceneStep": 0,
		"signin": {"count": 0, "lastDay": -1, "doubledDay": -1},
		"week": {"id": -1, "cleared": 0},
		"daily": Daily.fresh(-1),
		"ads": {"interstitialAt": -100000.0, "interstitialLevel": 0, "rewardedAt": -100000.0},
		"fails": {"level": 0, "count": 0},
		"settings": {"sound": true, "music": true, "vibrate": true},
	}


## 读档后调用：旧版本逐级升级，缺的字段用默认值补齐
static func migrate(save: Dictionary, eco: Dictionary) -> Dictionary:
	var from: int = int(save.get("version", 0))
	var fresh: Dictionary = create(eco)
	for k: String in fresh:
		if not save.has(k):
			save[k] = fresh[k]
		elif fresh[k] is Dictionary and save[k] is Dictionary:
			for sub: String in fresh[k]:
				if not (save[k] as Dictionary).has(sub) and k != "cards":
					save[k][sub] = fresh[k][sub]
	if from < 2:
		_migrate_1_to_2(save, eco)
	save["version"] = VERSION
	return save


## v1 → v2：金币体系放大 ×5（见 docs/01 第 6 节），鱼票折成金币，补发已到关的技能解锁礼。
## stars 字段保留但不再使用。
static func _migrate_1_to_2(save: Dictionary, eco: Dictionary) -> void:
	var m: Dictionary = eco["migration"]
	save["coins"] = (
		int(save["coins"]) * int(m["coinsMultiplier"])
		+ int(save["tickets"]) * int(m["ticketToCoins"])
	)
	save["tickets"] = 0
	# 旧的每日计数结构换新，保留今天是哪天
	save["daily"] = Daily.fresh(int(save["daily"].get("day", -1)))
	Skills.sync_unlocks(save, eco)
