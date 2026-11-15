class_name GameCfg
extends RefCounted
## 局内界面自己的配置表（config/game_ui.json）：技能解锁关、动画时长等。

const PATH := "res://config/game_ui.json"

static var _d: Dictionary = {}


static func d() -> Dictionary:
	if _d.is_empty():
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
		assert(parsed is Dictionary, "配置表损坏: game_ui")
		_d = parsed
	return _d


## 取某一节里的数值，如 num("fly", "seconds")
static func num(section: String, key: String) -> float:
	return float((d()[section] as Dictionary)[key])


## 一条鱼从出发到抵达的总时长：原地一弹 + 弧线飞行
static func travel() -> float:
	return num("fly", "tapPop") + num("fly", "seconds")
