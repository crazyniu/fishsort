class_name LevelCurve
extends RefCounted
## 把 config/level_curve.json 的难度曲线换算成某一关的生成参数与目标胜率，
## 见 docs/02-关卡设计.md 第 2 节。参数随关卡号连续插值，不按段跳变。

const MECHANICS: Array[String] = ["chain", "timer", "fog", "ice", "big", "pairs"]


static func is_challenge(curve: Dictionary, id: int) -> bool:
	return id > int(curve["targets"]["tutorialUntil"]) and id % int(curve["cycle"]) == 0


## ease: 0 = 普通，1/2 = 连续失败后换上的更易变体
static func params(curve: Dictionary, id: int, ease: int) -> Dictionary:
	var fixed: Dictionary = curve.get("fixed", {})
	var p: Dictionary = {}
	if fixed.has(str(id)):
		p = (fixed[str(id)] as Dictionary).duplicate()
		p["cap"] = 0
	else:
		p = _base(curve, id)
		_mechanics(curve, id, p)
		if is_challenge(curve, id):
			_challenge(curve, id, p)
	var e: Dictionary = curve["ease"]
	if ease > 0:
		p["species"] = maxi(3, int(p["species"]) - ease * int(e["species"]))
		p["fish"] = maxi(9, int(p["fish"]) - ease * int(e["fish"]))
		p["slack"] = maxi(0, int(p["slack"]) - ease * int(e["slack"]))
		if int(p["cap"]) > 0:
			p["cap"] = int(p["cap"]) + ease * int(e["cap"])
	p["fish"] = maxi(9, int(p["fish"]) / 3 * 3)
	return p


static func _base(curve: Dictionary, id: int) -> Dictionary:
	var seg: Dictionary = {}
	for s: Dictionary in curve["segments"]:
		seg = s
		if id <= int(s["to"]):
			break
	var span: int = int(seg["to"]) - int(seg["from"])
	var t: float = (
		0.0 if span <= 0 else clampf(float(id - int(seg["from"])) / float(span), 0.0, 1.0)
	)
	return {
		"species": _lerp(seg["species"], t),
		"fish": _lerp(seg["fish"], t),
		"cap": _lerp(seg["cap"], t),
		"layers": int(seg["layers"]),
		"per_min": int(seg["per"][0]),
		"per_max": int(seg["per"][1]),
		"slack": _lerp(seg["slack"], t),
	}


## 障碍按解锁关逐个加入：解锁那一关只用它一个；之后最新的一个必带，
## 其余在更早解锁的里轮换，单关最多 maxMechanics 种
static func _mechanics(curve: Dictionary, id: int, p: Dictionary) -> void:
	var unlock: Dictionary = curve["unlock"]
	var open: Array[String] = []
	for m: String in MECHANICS:
		if id >= int(unlock[m]):
			open.append(m)
	if open.is_empty():
		return
	var chosen: Array[String] = [open[open.size() - 1]]
	if id != int(unlock[chosen[0]]):
		var older: Array[String] = open.slice(0, open.size() - 1)
		var room: int = int(curve["maxMechanics"]) - 1
		for i: int in mini(room, older.size()):
			chosen.append(older[(id + i) % older.size()])
	var counts: Dictionary = curve["counts"]
	for m: String in chosen:
		p[m] = float(counts[m]) if m == "fog" else int(counts[m])


static func _challenge(curve: Dictionary, id: int, p: Dictionary) -> void:
	var c: Dictionary = curve["challenge"]
	p["challenge"] = true
	var plus: Array = c["speciesPlus"]
	p["species"] = int(p["species"]) + int(plus[1] if id >= int(c["speciesPlusFrom"]) else plus[0])
	p["fish"] = mini(int(float(p["fish"]) * float(c["fishMul"])), int(c["fishMax"]))
	p["slack"] = int(p["slack"]) + int(c["slackPlus"])
	if (c["coveredLevels"] as Array).has(id):
		p["layers"] = 2
	else:
		p["cap"] = maxi(int(c["capMin"]), int(p["cap"]) - int(c["capMinus"]))


static func _lerp(span: Array, t: float) -> int:
	return roundi(lerpf(float(span[0]), float(span[1]), t))


static func seed_for(id: int, ease: int) -> int:
	return id * 1000 + ease * 100 + 7


## 贪心机器人（2 缸）胜率的目标值（百分比，浮点）
static func target_rate(curve: Dictionary, id: int, challenge: bool) -> float:
	var t: Dictionary = curve["targets"]
	if id <= int(t["tutorialUntil"]):
		return 100.0
	var first: int = int(t["first"])
	var normal: float = (
		float(t["start"])
		- float(id - first) * (float(t["start"]) - float(t["end"])) / float(int(t["last"]) - first)
	)
	if challenge:
		return maxf(normal - float(t["challengeDrop"]), float(t["challengeFloor"]))
	return normal


## 目标区间 [下限, 上限]，容差 ±tol，上限不超过 100
static func target(curve: Dictionary, id: int, challenge: bool) -> Array:
	var c: float = target_rate(curve, id, challenge)
	var tol: float = float(curve["targets"]["tol"])
	if id <= int(curve["targets"]["tutorialUntil"]):
		return [100, 100]
	# 目标在 easyFrom 以上的前期关卡允许 100%：机器人胜率只有几档，卡不出 94 和 100 的差别
	var top: int = 100 if c >= float(curve["targets"]["easyFrom"]) else floori(c + tol)
	return [ceili(c - tol), mini(100, top)]


## 胜率离目标区间多远，0 = 落在区间内
static func miss(span: Array, rate: int) -> int:
	return maxi(0, maxi(int(span[0]) - rate, rate - int(span[1])))
