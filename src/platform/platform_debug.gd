class_name PlatformDebug
extends PlatformBase
## 开发用实现：数据写死、存档落在 user://。模拟广告页在 M4 接入。


func id() -> StringName:
	return &"debug"


func show_rewarded(_placement: StringName) -> AdResult:
	return AdResult.DONE


func get_profile() -> Dictionary:
	return {"nickname": "测试玩家", "avatar": ""}


func load_data(key: String) -> String:
	var path: String = "user://%s.json" % key
	return FileAccess.get_file_as_string(path) if FileAccess.file_exists(path) else ""


func save_data(key: String, value: String) -> void:
	var f := FileAccess.open("user://%s.json" % key, FileAccess.WRITE)
	if f != null:
		f.store_string(value)


func track(event: StringName, params: Dictionary = {}) -> void:
	print("[track] ", event, " ", params)
