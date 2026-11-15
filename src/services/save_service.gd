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
	_apply_test_boost()


## ./run.sh 启动时会带上 FISHSORT_BOOST=1：把金币和技能加满，方便测试。
## 正式构建不会设置这个环境变量。
func _apply_test_boost() -> void:
	if OS.get_environment("FISHSORT_BOOST") != "1":
		return
	data["coins"] = maxi(int(data["coins"]), 99999)
	for tool: String in data["tools"]:
		data["tools"][tool] = maxi(int(data["tools"][tool]), 99)


func save() -> void:
	Platform.impl.save_data(KEY, JSON.stringify(data))


## 本地日期序号（自 1970-01-01 起的天数），签到和每日次数用
func today() -> int:
	var bias: int = int(Time.get_time_zone_from_system()["bias"]) * 60
	return int((Time.get_unix_time_from_system() + bias) / 86400.0)


## 当前 unix 秒，生命恢复、无限生命窗口用（核心层不读时钟，由这里传入）
func now() -> int:
	return int(Time.get_unix_time_from_system())
