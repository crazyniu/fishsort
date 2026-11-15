extends SceneTree
## 测试运行器：./run.sh test


func _init() -> void:
	var total: int = 0
	var failed: int = 0
	for n: String in DirAccess.get_files_at("res://tests"):
		if not (n.begins_with("test_") and n.ends_with(".gd")) or n == "test_case.gd":
			continue
		var script: GDScript = load("res://tests/" + n)
		# 测试脚本本身加载不了（语法或类型错误）也算失败：
		# 以前这种情况整份文件被悄悄跳过，CI 照样显示通过
		if script == null or not script.can_instantiate():
			printerr("✗ %s 加载失败，里面的测试都没有跑" % n)
			failed += 1
			continue
		for m: Dictionary in script.get_script_method_list():
			var name: String = m["name"]
			if not name.begins_with("test_"):
				continue
			var t: TestCase = script.new()
			t.call(name)
			total += 1
			if not t.failures.is_empty():
				failed += 1
				for msg: String in t.failures:
					printerr("✗ %s %s — %s" % [n, name, msg])
	print("测试 %d 个，失败 %d 个" % [total, failed])
	quit(1 if failed > 0 else 0)
