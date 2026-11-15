class_name Features
extends RefCounted
## 功能开放关，见 docs/01 第 5.3 节。level 传玩家当前所在关（save["level"]）。
## 功能名：signin、levelSelect、album、wheel、rank、daily、homeBase、
## skill_shuffle、skill_blow、skill_net、skill_current


static func unlock_level(eco: Dictionary, feature: String) -> int:
	return int(eco["features"][feature])


static func is_unlocked(eco: Dictionary, feature: String, level: int) -> bool:
	return level >= unlock_level(eco, feature)


## 从 old_level 升到 new_level 时新开放的功能（按开放关排序），主页解锁动画用
static func newly_unlocked(eco: Dictionary, old_level: int, new_level: int) -> Array[String]:
	var out: Array[String] = []
	for f: String in eco["features"]:
		var at: int = unlock_level(eco, f)
		if at > old_level and at <= new_level:
			out.append(f)
	out.sort_custom(
		func(a: String, b: String) -> bool: return unlock_level(eco, a) < unlock_level(eco, b)
	)
	return out
