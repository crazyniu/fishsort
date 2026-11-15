extends SceneTree
## 生成关卡文件。用法：./run.sh level-gen [起始关] [结束关]
## 每关逐个种子在难度旋钮上二分、微调总鱼数，挑胜率最接近目标且满足单调约束的那个，
## 规则见 docs/02-关卡设计.md 第 2.1、4 节。一关的结果只取决于关卡号和上一关的胜率，
## 不依赖从哪一关开始跑，所以可以按关号分段并行生成。

const DIR := "res://config/levels"
const EASE_VARIANTS := 2

var _curve: Dictionary = {}
var _gen: Dictionary = {}
var _runs: int = 40
## 上一个普通关 / 挑战关的实测 2 缸胜率，-1 = 还没有
var _last: Dictionary = {false: -1, true: -1}
var _warnings: Array[String] = []
## FISHSORT_GEN_TRACE=1 时打印每次试探，调搜索用
var _trace: bool = OS.get_environment("FISHSORT_GEN_TRACE") == "1"


func _init() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	_curve = JSON.parse_string(FileAccess.get_file_as_string("res://config/level_curve.json"))
	_gen = _curve["gen"]
	_runs = int(_gen["runs"])
	var from: int = int(args[0]) if args.size() > 0 else 1
	var to: int = int(args[1]) if args.size() > 1 else int(_curve["total"])
	DirAccess.make_dir_recursive_absolute(DIR)
	_load_previous(from)
	var failed: int = 0
	for id: int in range(from, to + 1):
		var made: Dictionary = _make_level(id)
		if made.is_empty():
			printerr("生成失败: 第 %d 关" % id)
			failed += 1
			continue
		for name: String in made:
			var f := FileAccess.open("%s/%s.json" % [DIR, name], FileAccess.WRITE)
			f.store_string((made[name] as LevelData).to_json() + "\n")
			f.close()
	for w: String in _warnings:
		print(w)
	print("已生成第 %d–%d 关，失败 %d 个，未达标 %d 个" % [from, to, failed, _warnings.size()])
	quit(1 if failed > 0 else 0)


## 从某一关往前找最近的普通关和挑战关，量出它们的胜率作为单调约束的起点
func _load_previous(from: int) -> void:
	for kind: bool in [false, true]:
		for id: int in range(from - 1, 0, -1):
			if LevelCurve.is_challenge(_curve, id) != kind:
				continue
			var path: String = "%s/level_%04d.json" % [DIR, id]
			if FileAccess.file_exists(path):
				var lv: LevelData = LevelData.from_json(FileAccess.get_file_as_string(path))
				_last[kind] = Bots.rate(lv, "greedy", 2, _runs)
			break


## 返回 { 文件名: LevelData }，含本体和两个更易变体；失败返回空字典
func _make_level(id: int) -> Dictionary:
	var challenge: bool = LevelCurve.is_challenge(_curve, id)
	var base: Dictionary = _pick_base(id, challenge)
	if base.is_empty():
		return {}
	var out: Dictionary = {}
	var names: Array = []
	var prev_rate: int = base["g2"]
	var variants: Array[LevelData] = []
	var rates: Array = []
	for ease: int in range(1, EASE_VARIANTS + 1):
		var v: Dictionary = _pick_variant(id, ease, prev_rate, float(base["d"]))
		if v.is_empty():
			return {}
		prev_rate = v["g2"]
		variants.append(v["lv"])
		rates.append(v["g2"])
		names.append("level_%04d_e%d" % [id, ease])
	var lv: LevelData = base["lv"]
	lv.id = id
	lv.variants = names
	out["level_%04d" % id] = lv
	for i: int in variants.size():
		variants[i].id = id
		out[names[i]] = variants[i]
	_last[challenge] = base["g2"]
	print(
		(
			"第 %3d 关%s  目标 %.1f  2缸 %3d  3缸 %3d  变体 %s"
			% [
				id,
				"*" if challenge else " ",
				LevelCurve.target_rate(_curve, id, challenge),
				base["g2"],
				base["g3"],
				rates
			]
		)
	)
	return out


## d 是难度旋钮：0–1 对应打乱 0–50% 的鱼，超过 1 的部分每 0.125 把场上容量再减 1
func _candidate(id: int, ease: int, i: int, d: float) -> LevelData:
	var p: Dictionary = LevelCurve.params(_curve, id, ease)
	var nudge: int = int(_gen["fishNudge"])
	if ease == 0 and id > 2:
		p["fish"] = maxi(9, int(p["fish"]) + [0, -nudge, nudge][i % 3]) / 3 * 3
	p["scramble"] = int(float(p["fish"]) * 0.5 * clampf(d, 0.0, 1.0))
	if int(p["cap"]) > 0 and d > 1.0:
		p["cap"] = maxi(int(_gen["capMin"]), int(p["cap"]) - int((d - 1.0) * 8.0))
	return LevelGen.generate(p, LevelCurve.seed_for(id, ease) + i * 10007)


func _pick_base(id: int, challenge: bool) -> Dictionary:
	if id <= int(_curve["targets"]["tutorialUntil"]):
		var lv0: LevelData = _candidate(id, 0, 0, 0.0)
		if lv0 == null:
			return {}
		return {"lv": lv0, "g2": Bots.rate(lv0, "greedy", 2, _runs), "g3": 100, "d": 0.0}
	var target: float = LevelCurve.target_rate(_curve, id, challenge)
	var span: Array = LevelCurve.target(_curve, id, challenge)
	var lo: int = int(span[0])
	var last: int = _last[challenge]
	var hi: int = (
		int(span[1]) if last < 0 else mini(int(span[1]), last + int(_gen["monotoneMargin"]))
	)
	# 上一关已经偏难到区间下限以下时，单调和容差不能同时满足：贴着下限出，
	# 不让一关的偏差顺着单调约束传给后面所有关
	hi = maxi(hi, lo + 3)
	# 搜索瞄准的胜率：目标值，但离上下限各留 1–2 个点
	var aim: float = clampf(target, float(lo) + 1.0, float(hi) - 2.0)
	var close: float = float(_gen["close"])
	var best: Dictionary = {}
	var best_pen: float = INF
	# 胜率对旋钮很陡且不单调：多换一对鱼，机器人找到的参考解就变了，结伴鱼、限时跟着变。
	# 所以第一个种子在整个旋钮范围上二分，找出胜率从 100 掉到 0 的过渡带；
	# 之后的种子只在当前最优候选的旋钮 ± band 内二分，在过渡带里密集取样
	var center: float = -1.0
	for i: int in int(_gen["seeds"]):
		var d_lo: float = 0.0
		var d_hi: float = float(_gen["knobMax"])
		var probes: int = int(_gen["probes"])
		if center >= 0.0:
			d_lo = maxf(0.0, center - float(_gen["band"]))
			d_hi = minf(d_hi, center + float(_gen["band"]))
			probes = int(_gen["probesFine"])
		for step: int in probes:
			var d: float = (d_lo + d_hi) * 0.5
			var lv: LevelData = _candidate(id, 0, i, d)
			if lv == null:
				# 打乱后机器人找不到通关步骤：太难
				d_hi = d
				continue
			var g2: int = Bots.rate(lv, "greedy", 2, _runs)
			if _trace:
				print("  第 %d 关 种子 %d 旋钮 %.4f → 2缸 %d（瞄准 %.1f）" % [id, i, d, g2, aim])
			if float(g2) > aim:
				d_lo = d
			else:
				d_hi = d
			if _penalty(g2, lo, hi, aim, 100) >= best_pen:
				continue
			# 3 缸胜率只对暂时最优的候选量，省时间
			var g3: int = Bots.rate(lv, "greedy", 3, _runs)
			var pen: float = _penalty(g2, lo, hi, aim, g3)
			if pen < best_pen:
				best_pen = pen
				best = {"lv": lv, "g2": g2, "g3": g3, "d": d}
			if best_pen <= close * 0.05:
				break
		if best_pen <= close * 0.05:
			break
		# 还没有候选时，用二分停下的位置当过渡带中心
		center = float(best["d"]) if not best.is_empty() else (d_lo + d_hi) * 0.5
	if best.is_empty():
		return {}
	if best_pen >= 1.0:
		_warnings.append(
			(
				"警告: 第 %d 关未达标（目标 %.1f 容差 %s，上一%s关 %d）：2缸 %d，3缸 %d"
				% [id, target, span, "挑战" if challenge else "普通", last, best["g2"], best["g3"]]
			)
		)
	return best


## 越小越好：出容差或破单调每点 3 分，3 缸比 2 缸难每点 2 分，离瞄准值每点 0.05 分。
## 落在区间内且 3 缸不更难时惩罚 < 1
func _penalty(g2: int, lo: int, hi: int, aim: float, g3: int) -> float:
	var pen: float = float(maxi(0, lo - g2) + maxi(0, g2 - hi)) * 3.0
	pen += float(maxi(0, g2 - int(_gen["bot3Margin"]) - g3)) * 2.0
	return pen + absf(float(g2) - aim) * 0.05


## 更易变体：胜率要比上一档高出 variantMargin（封顶 100）
func _pick_variant(id: int, ease: int, prev_rate: int, d: float) -> Dictionary:
	var need: int = mini(100, prev_rate + int(_gen["variantMargin"]))
	if id <= int(_curve["targets"]["tutorialUntil"]):
		need = prev_rate
	var best: Dictionary = {}
	for i: int in int(_gen["variantSeeds"]):
		var lv: LevelData = _candidate(
			id, ease, i, maxf(0.0, d - 0.3 * float(ease) - 0.05 * float(i))
		)
		if lv == null:
			continue
		var g2: int = Bots.rate(lv, "greedy", 2, _runs)
		if best.is_empty() or g2 > int(best["g2"]):
			best = {"lv": lv, "g2": g2}
		if g2 >= need:
			break
	if not best.is_empty() and int(best["g2"]) < need:
		_warnings.append("警告: 第 %d 关变体 e%d 不够易：需要 %d，实测 %d" % [id, ease, need, best["g2"]])
	return best
