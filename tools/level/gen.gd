extends SceneTree
## 生成关卡文件。用法：./run.sh level-gen [起始关] [结束关]

const DIR := "res://config/levels"
const EASE_VARIANTS := 2
## 普通变体最多换几个种子去凑目标难度
const REROLLS := 12
const RATE_RUNS := 20


func _init() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var from: int = int(args[0]) if args.size() > 0 else 1
	var to: int = int(args[1]) if args.size() > 1 else 60
	var curve: Dictionary = JSON.parse_string(
		FileAccess.get_file_as_string("res://config/level_curve.json")
	)
	DirAccess.make_dir_recursive_absolute(DIR)
	var failed: int = 0
	for id: int in range(from, to + 1):
		var names: Array = []
		for ease: int in range(EASE_VARIANTS, -1, -1):
			var lv: LevelData = _pick(curve, id, ease)
			var name: String = "level_%04d" % id + ("" if ease == 0 else "_e%d" % ease)
			if lv == null:
				printerr("生成失败: ", name)
				failed += 1
				continue
			lv.id = id
			if ease == 0:
				names.reverse()
				lv.variants = names
			else:
				names.append(name)
			var f := FileAccess.open("%s/%s.json" % [DIR, name], FileAccess.WRITE)
			f.store_string(lv.to_json() + "\n")
			f.close()
	print("已生成第 %d–%d 关，失败 %d 个" % [from, to, failed])
	quit(1 if failed > 0 else 0)


## 普通变体：换种子直到贪心机器人胜率落进目标区间，凑不到就取最接近的
func _pick(curve: Dictionary, id: int, ease: int) -> LevelData:
	var p: Dictionary = LevelCurve.params(curve, id, ease)
	var base: int = LevelCurve.seed_for(id, ease)
	if ease > 0 or id <= 2:
		return LevelGen.generate(p, base)
	var span: Array = LevelCurve.target(curve, id, p.get("challenge", false))
	var best: LevelData = null
	var best_miss: int = 1000
	for i: int in REROLLS:
		var lv: LevelData = LevelGen.generate(p, base + i * 10007)
		if lv == null:
			continue
		var m: int = LevelCurve.miss(span, Bots.rate(lv, "greedy", 2, RATE_RUNS))
		if m < best_miss:
			best_miss = m
			best = lv
		if m == 0:
			break
	return best
