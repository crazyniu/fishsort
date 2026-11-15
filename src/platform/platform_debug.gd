class_name PlatformDebug
extends PlatformBase
## 开发用实现：头像昵称与排行榜写死，存档落在 user://，广告弹模拟广告页。

## 广告测试页可以把它关掉，检查「广告不可用」时的降级表现
var ads_on: bool = true
var _banner: CanvasLayer


func id() -> StringName:
	return &"debug"


func _root() -> Window:
	return (Engine.get_main_loop() as SceneTree).root


func ads_available() -> bool:
	return ads_on


func show_rewarded(placement: StringName) -> AdResult:
	if not ads_on:
		return AdResult.UNAVAILABLE
	var overlay := DebugAdOverlay.new()
	_root().add_child(overlay)
	overlay.rewarded(placement)
	var result: int = await overlay.closed
	return result as AdResult


func show_interstitial(placement: StringName) -> void:
	if not ads_on:
		return
	var overlay := DebugAdOverlay.new()
	_root().add_child(overlay)
	overlay.interstitial(placement)
	await overlay.closed


func show_banner(placement: StringName) -> void:
	hide_banner()
	_banner = CanvasLayer.new()
	_banner.layer = 90
	var bar := ColorRect.new()
	bar.color = Color(0.1, 0.12, 0.16, 0.92)
	bar.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	bar.offset_top = -96
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_banner.add_child(bar)
	var text := UiKit.label("模拟 Banner 广告 · %s" % placement, 26)
	text.set_anchors_preset(Control.PRESET_FULL_RECT)
	bar.add_child(text)
	_root().add_child(_banner)


func hide_banner() -> void:
	if _banner != null and is_instance_valid(_banner):
		_banner.queue_free()
	_banner = null


func get_profile() -> Dictionary:
	return {"nickname": "测试玩家", "avatar": "res://assets/ui/avatar.png"}


func get_rank_list(_board: StringName) -> Array:
	var names: Array = [
		"浪花朵朵", "SeaBreeze", "珊瑚一号", "MintWave", "小贝壳", "BubbleKing", "海盐汽水", "Luna"
	]
	var out: Array = []
	for i: int in names.size():
		out.append({"name": names[i], "avatar": "res://assets/ui/avatar.png", "score": 96 - i * 9})
	return out


func load_data(key: String) -> String:
	var path: String = "user://%s.json" % key
	return FileAccess.get_file_as_string(path) if FileAccess.file_exists(path) else ""


func save_data(key: String, value: String) -> void:
	var f := FileAccess.open("user://%s.json" % key, FileAccess.WRITE)
	if f != null:
		f.store_string(value)


func track(event: StringName, params: Dictionary = {}) -> void:
	print("[track] ", event, " ", params)
