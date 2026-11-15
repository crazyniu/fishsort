extends SceneTree
## 校验关卡并输出难度报告。
## 用法：./run.sh level-verify [--runs=N] [文件...]   不给文件 = 全部

const DIR := "res://config/levels"


func _init() -> void:
	var runs: int = 40
	var files: Array[String] = []
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--runs="):
			runs = int(a.trim_prefix("--runs="))
		else:
			files.append(a if a.begins_with("res://") or a.is_absolute_path() else "res://" + a)
	var all: bool = files.is_empty()
	if all:
		for n: String in DirAccess.get_files_at(DIR):
			if n.ends_with(".json"):
				files.append(DIR + "/" + n)
		files.sort()
	var curve: Dictionary = JSON.parse_string(
		FileAccess.get_file_as_string("res://config/level_curve.json")
	)
	var rows: Array[String] = [
		"level,species,fish,bubbles,challenge,peak,greedy2,greedy3,random2,flag"
	]
	var bad: int = 0
	var off: int = 0
	var gen: Dictionary = curve["gen"]
	# 单调检查：上一个普通关 / 挑战关的 2 缸胜率；变体检查：本体的 2 缸胜率
	var last: Dictionary = {false: -1, true: -1}
	var base_rate: Dictionary = {}
	for path: String in files:
		var lv: LevelData = LevelData.from_json(FileAccess.get_file_as_string(path))
		var name: String = path.get_file().get_basename()
		if lv == null:
			printerr("✗ %s: 无法解析" % name)
			bad += 1
			continue
		var errs: Array[String] = LevelCheck.errors(lv)
		if not errs.is_empty():
			bad += 1
			for e: String in errs:
				printerr("✗ %s: %s" % [name, e])
			continue
		var is_variant: bool = name.contains("_e")
		var g2: int = Bots.rate(lv, "greedy", 2, runs)
		var g3: int = -1 if is_variant else Bots.rate(lv, "greedy", 3, runs)
		var r2: int = -1 if is_variant else Bots.rate(lv, "random", 2, runs)
		var fish: int = 0
		for b: Dictionary in lv.bubbles:
			fish += (b["fish"] as Array).size()
		# 以下偏离只提示、计入统计，不算校验失败（docs/02 第 5 节）
		var flags: Array[String] = []
		if is_variant:
			if base_rate.has(lv.id) and g2 < int(base_rate[lv.id]):
				flags.append("变体不比本体易")
		elif lv.id > int(curve["targets"]["tutorialUntil"]):
			var span: Array = LevelCurve.target(curve, lv.id, lv.challenge)
			if LevelCurve.miss(span, g2) > 0:
				flags.append("偏难" if g2 < int(span[0]) else "偏易")
			var prev: int = last[lv.challenge]
			if prev >= 0 and g2 > prev + int(gen["monotoneMargin"]):
				flags.append("比上一关易")
			if g3 < g2 - int(gen["bot3Margin"]):
				flags.append("开第3缸更难")
			last[lv.challenge] = g2
		if not is_variant:
			base_rate[lv.id] = g2
		var flag: String = "|".join(flags)
		if not flags.is_empty():
			off += 1
		rows.append(
			(
				"%s,%d,%d,%d,%s,%d,%d,%d,%d,%s"
				% [
					name,
					lv.palette,
					fish,
					lv.bubbles.size(),
					"y" if lv.challenge else "",
					LevelCheck.replay(lv)["peak"],
					g2,
					g3,
					r2,
					flag
				]
			)
		)
	if all:
		var f := FileAccess.open("res://tools/level/report.csv", FileAccess.WRITE)
		f.store_string("\n".join(rows) + "\n")
		f.close()
	else:
		print("\n".join(rows))
	print("校验 %d 个关卡：不合格 %d，难度偏离目标 %d" % [files.size(), bad, off])
	quit(1 if bad > 0 else 0)
