extends Node
## autoload「Config」：加载 config/ 下的配置表。

var eco: Dictionary
var signin: Dictionary
var scenes: Dictionary
var ads: Dictionary
var species: Array
var species_by_id: Dictionary = {}


func _ready() -> void:
	# 目前只面向中文玩家，固定用中文；Google Play 版上线前再改为跟随系统语言
	TranslationServer.set_locale("zh_CN")
	eco = _load("economy")
	signin = _load("signin")
	scenes = _load("scenes")
	ads = _load("ads")
	species = _load("species")["species"]
	for sp: Dictionary in species:
		species_by_id[sp["id"]] = sp


func _load(name: String) -> Dictionary:
	var parsed: Variant = JSON.parse_string(
		FileAccess.get_file_as_string("res://config/%s.json" % name)
	)
	assert(parsed is Dictionary, "配置表损坏: %s" % name)
	return parsed


## 读关卡文件；ease > 0 时取易化变体，没有就退回普通版
func load_level(id: int, ease: int) -> LevelData:
	var base: String = "res://config/levels/level_%04d" % id
	var path: String = base + ("_e%d.json" % ease if ease > 0 else ".json")
	if not FileAccess.file_exists(path):
		path = base + ".json"
	if not FileAccess.file_exists(path):
		return null
	return LevelData.from_json(FileAccess.get_file_as_string(path))
