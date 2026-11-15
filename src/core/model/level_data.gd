class_name LevelData
extends RefCounted
## 关卡静态数据，格式见 docs/02-关卡设计.md 第 3 节。

var id: int = 0
var level_seed: int = 0
var challenge: bool = false
var buffer: int = 5
var bowl_slots: int = 2
var palette: int = 0
## 每项 { s: 鱼种槽位, cap: 容量, timer: 秒（0 = 不限时） }
var orders: Array[Dictionary] = []
## 每项 { id, x, y, r, layer, fish, under, chain, fog, ice, pairs }
var bubbles: Array[Dictionary] = []
## 参考解：[[气泡, 鱼下标], ...]，回放它即可证明可解
var ref: Array = []
var variants: Array = []


static func _ints(src: Array) -> Array[int]:
	var out: Array[int] = []
	for v: Variant in src:
		out.append(int(v))
	return out


static func from_dict(d: Dictionary) -> LevelData:
	var lv := LevelData.new()
	lv.id = int(d.get("id", 0))
	lv.level_seed = int(d.get("seed", 0))
	lv.challenge = bool(d.get("challenge", false))
	lv.buffer = int(d.get("buffer", 5))
	lv.bowl_slots = int(d.get("bowlSlots", 2))
	lv.palette = int(d.get("palette", 0))
	for o: Dictionary in d.get("orders", []):
		lv.orders.append(
			{"s": int(o["s"]), "cap": int(o.get("cap", 3)), "timer": int(o.get("timer", 0))}
		)
	for b: Dictionary in d.get("bubbles", []):
		var pairs: Array = []
		for p: Array in b.get("pairs", []):
			pairs.append(_ints(p))
		(
			lv
			. bubbles
			. append(
				{
					"id": int(b["id"]),
					"x": float(b.get("x", 0.0)),
					"y": float(b.get("y", 0.0)),
					"r": float(b.get("r", 0.1)),
					"layer": int(b.get("layer", 0)),
					"fish": _ints(b["fish"]),
					"under": _ints(b.get("under", [])),
					"chain": int(b.get("chain", 0)),
					"fog": bool(b.get("fog", false)),
					"ice": _ints(b.get("ice", [])),
					"pairs": pairs,
				}
			)
		)
	for t: Array in d.get("ref", []):
		lv.ref.append(_ints(t))
	lv.variants = d.get("variants", [])
	return lv


func to_dict() -> Dictionary:
	return {
		"id": id,
		"seed": level_seed,
		"challenge": challenge,
		"buffer": buffer,
		"bowlSlots": bowl_slots,
		"palette": palette,
		"orders": orders,
		"bubbles": bubbles,
		"ref": ref,
		"variants": variants,
	}


static func from_json(text: String) -> LevelData:
	var parsed: Variant = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		return null
	return from_dict(parsed)


func to_json() -> String:
	return JSON.stringify(to_dict(), "", false)
