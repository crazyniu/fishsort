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
		# 更易变体只做结构与可解性校验，不跑机器人
		var is_variant: bool = name.contains("_e")
		var g2: int = -1 if is_variant else Bots.rate(lv, "greedy", 2, runs)
		var g3: int = -1 if is_variant else Bots.rate(lv, "greedy", 3, runs)
		var r2: int = -1 if is_variant else Bots.rate(lv, "random", 2, runs)
		var fish: int = 0
		for b: Dictionary in lv.bubbles:
			fish += (b["fish"] as Array).size()
		var flag: String = ""
		# 难度落点只看普通变体；偏离只提示，不算失败
		if not is_variant:
			var span: Array = LevelCurve.target(curve, lv.id, lv.challenge)
			if lv.id > 2 and LevelCurve.miss(span, g2) > 0:
				flag = "偏难" if g2 < int(span[0]) else "偏易"
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
