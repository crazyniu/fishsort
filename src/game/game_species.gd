class_name GameSpecies
extends RefCounted
## 给一关挑生物：同一关里任意两种的主色（hue）和轮廓（shape）都不相同，一眼能分清。
## 字段来自 config/species.json；只从已有美术的生物里挑。

static var _pool: Array[Dictionary] = []


static func _load() -> void:
	if not _pool.is_empty():
		return
	for sp: Dictionary in Config.species:
		if ResourceLoader.exists("res://assets/fish/%s.png" % sp["id"]):
			_pool.append(sp)


## 按关卡种子洗牌后依次挑 count 种。先要求主色和轮廓都不重复；凑不够再只要求主色不重复；
## 还不够就随便补齐
static func pick(level_seed: int, count: int) -> Array[String]:
	_load()
	var order: Array[Dictionary] = _pool.duplicate()
	Rng.new(level_seed).shuffle(order)
	var out: Array[String] = []
	var hues: Dictionary = {}
	var shapes: Dictionary = {}
	for strict: int in [2, 1, 0]:
		for sp: Dictionary in order:
			if out.size() >= count:
				return out
			if out.has(sp["id"]):
				continue
			var hue: String = sp.get("hue", "")
			var shape: String = sp.get("shape", "")
			if strict >= 1 and hues.has(hue):
				continue
			if strict >= 2 and shapes.has(shape):
				continue
			out.append(sp["id"])
			hues[hue] = true
			shapes[shape] = true
	return out
