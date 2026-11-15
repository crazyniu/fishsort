extends TestCase


static func _cfg(name: String) -> Dictionary:
	return JSON.parse_string(FileAccess.get_file_as_string("res://config/%s.json" % name))


func test_album_frame_default_and_migrate() -> void:
	var eco := _cfg("economy")
	ok(not Album.has_frame(PlayerData.create(eco)), "新档默认没有头像框")
	var old := PlayerData.create(eco)
	old["album"] = {"claimed": [], "final": true}
	ok(Album.has_frame(PlayerData.migrate(old, eco)), "老档已领终极大奖，迁移补上头像框")
	var plain := PlayerData.create(eco)
	plain["album"] = {"claimed": [], "final": false}
	ok(not Album.has_frame(PlayerData.migrate(plain, eco)), "没领过的不补")
