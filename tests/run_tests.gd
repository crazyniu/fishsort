extends SceneTree
## 测试运行器：./run.sh test


func _init() -> void:
	var total: int = 0
	var failed: int = 0
	for n: String in DirAccess.get_files_at("res://tests"):
		if not (n.begins_with("test_") and n.ends_with(".gd")) or n == "test_case.gd":
			continue
		var script: GDScript = load("res://tests/" + n)
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
