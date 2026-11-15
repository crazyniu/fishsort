extends Node
## autoload「Save」：存档的读写。内容结构见 PlayerData。

const KEY := "save"

var data: Dictionary


func _ready() -> void:
	var text: String = Platform.impl.load_data(KEY)
	var parsed: Variant = JSON.parse_string(text) if not text.is_empty() else null
	if parsed is Dictionary:
		data = PlayerData.migrate(parsed, Config.eco)
	else:
		data = PlayerData.create(Config.eco)


func save() -> void:
	Platform.impl.save_data(KEY, JSON.stringify(data))


## 本地日期序号（自 1970-01-01 起的天数），签到和每日次数用
func today() -> int:
	var bias: int = int(Time.get_time_zone_from_system()["bias"]) * 60
	return int((Time.get_unix_time_from_system() + bias) / 86400.0)
