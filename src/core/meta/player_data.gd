class_name PlayerData
extends RefCounted
## 存档结构与版本迁移，见 docs/04-技术架构.md 第 6 节。存档就是一个可直接转 JSON 的字典。

const VERSION := 1


static func create(eco: Dictionary) -> Dictionary:
	return {
		"version": VERSION,
		"level": 1,
		"coins": 0,
		"tickets": 0,
		"stars": 0,
		"tools": (eco["toolStart"] as Dictionary).duplicate(),
		"cards": {},
		"pity": {"levelCard": 0, "ticketPack": 0},
		"scene": 0,
		"sceneStep": 0,
		"signin": {"count": 0, "lastDay": -1},
		"week": {"id": -1, "cleared": 0},
		"daily": {"day": -1, "firstWin": false, "freeCoin": 0},
		"ads": {"interstitialAt": -100000.0, "interstitialLevel": 0, "rewardedAt": -100000.0},
		"fails": {"level": 0, "count": 0},
		"settings": {"sound": true, "music": true, "vibrate": true},
	}


## 读档后调用：旧版本逐级升级，缺的字段用默认值补齐
static func migrate(save: Dictionary, eco: Dictionary) -> Dictionary:
	# 以后结构变更时在这里按版本号逐级处理，例如：
	# if int(save.get("version", 0)) < 2: _migrate_1_to_2(save)
	var fresh: Dictionary = create(eco)
	for k: String in fresh:
		if not save.has(k):
			save[k] = fresh[k]
		elif fresh[k] is Dictionary and save[k] is Dictionary:
			for sub: String in fresh[k]:
				if not (save[k] as Dictionary).has(sub) and k != "cards":
					save[k][sub] = fresh[k][sub]
	save["version"] = VERSION
	return save
