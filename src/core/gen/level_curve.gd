class_name LevelCurve
extends RefCounted
## 把 config/level_curve.json 的难度曲线换算成某一关的生成参数。


## ease: 0 = 普通，1/2 = 连续失败后换上的更易变体
static func params(curve: Dictionary, id: int, ease: int) -> Dictionary:
	var p: Dictionary = {}
	var fixed: Dictionary = curve.get("fixed", {})
	if fixed.has(str(id)):
		p = (fixed[str(id)] as Dictionary).duplicate()
	else:
		var band: Dictionary = {}
		for b: Dictionary in curve["bands"]:
			band = b
			if id <= int(b["to"]):
				break
		var cycle: int = int(curve["cycle"])
		var pos: int = (id - 1) % cycle
		var challenge: bool = pos == cycle - 1
		var t: float = 1.0 if challenge else float(pos) / float(cycle - 2)
		p["species"] = _lerp(band["species"], t)
		p["fish"] = _lerp(band["fish"], t)
		p["layers"] = _lerp(band["layers"], t)
		p["slack"] = _lerp(band["slack"], t)
		# 放松关（周期第一关）不带障碍
		if pos > 0:
			for k: String in ["chain", "timer", "ice", "big", "pairs"]:
				p[k] = int(band.get(k, 0))
			p["fog"] = float(band.get("fog", 0.0))
		if challenge:
			var c: Dictionary = curve["challenge"]
			p["challenge"] = true
			p["species"] = int(p["species"]) + int(c["species"])
			p["fish"] = mini(int(float(p["fish"]) * float(c["fishMul"])), int(c["fishMax"]))
			p["layers"] = int(p["layers"]) + int(c["layers"])
			p["slack"] = int(p["slack"]) + int(c["slack"])
	p["species"] = maxi(3, int(p["species"]) - ease)
	p["slack"] = maxi(0, int(p.get("slack", 0)) - ease)
	p["fish"] = maxi(9, int(p["fish"]) / 3 * 3)
	p["layers"] = int(p["layers"])
	return p


static func _lerp(span: Array, t: float) -> int:
	return roundi(lerpf(float(span[0]), float(span[1]), t))


static func seed_for(id: int, ease: int) -> int:
	return id * 1000 + ease * 100 + 7


## 贪心机器人（2 缸）胜率的目标区间 [下限, 上限]。前期关卡放宽，保证上手顺
static func target(curve: Dictionary, id: int, challenge: bool) -> Array:
	var t: Dictionary = curve["targets"]
	if id <= int(t["earlyUntil"]):
		return t["earlyChallenge"] if challenge else t["earlyNormal"]
	return t["challenge"] if challenge else t["normal"]


## 胜率离目标区间多远，0 = 落在区间内
static func miss(span: Array, rate: int) -> int:
	return maxi(0, maxi(int(span[0]) - rate, rate - int(span[1])))
