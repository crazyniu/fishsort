class_name Daily
extends RefCounted
## 每日 / 每周计数。日期序号由调用方传入（自 1970-01-01 起的天数），核心层不读时钟。

const WEEK_DAYS := 7


static func fresh(day: int) -> Dictionary:
	return {
		"day": day,
		"firstWin": false,
		"freeCoin": 0,
		"wheelFree": 0,
		"wheelAd": 0,
		"replay": 0,
		"toolFree": {},
		"share": {"wheel": 0, "life": 0, "card": 0, "help": 0},
	}


## 跨天清零每日计数，跨周清零周过关数。所有每日功能进来先调它
static func roll(save: Dictionary, day: int) -> void:
	if int((save["daily"] as Dictionary).get("day", -1)) != day:
		save["daily"] = fresh(day)
	var week: Dictionary = save["week"]
	# day 是自 1970-01-01（周四）起的天数，+3 后整除 7 得到以周一为起点的周序号
	var week_id: int = (day + 3) / WEEK_DAYS
	if week["id"] != week_id:
		week["id"] = week_id
		week["cleared"] = 0
