class_name TestCase
extends RefCounted
## 极简测试基类。测试文件 tests/test_*.gd 继承它，方法名以 test_ 开头。

var failures: Array[String] = []


func ok(cond: bool, msg: String) -> void:
	if not cond:
		failures.append(msg)


func eq(got: Variant, want: Variant, msg: String) -> void:
	if got != want:
		failures.append("%s：期望 %s，实际 %s" % [msg, want, got])


## 手工搭一个小关卡。bubbles 每项：{ fish, under?, chain?, ice?, pairs? }
static func level(orders: Array, bubbles: Array, buffer: int = 5) -> LevelData:
	var d: Dictionary = {
		"buffer": buffer, "bowlSlots": 2, "palette": 12, "orders": [], "bubbles": []
	}
	for o: Variant in orders:
		(d["orders"] as Array).append(o if o is Dictionary else {"s": o})
	for i: int in bubbles.size():
		var b: Dictionary = (bubbles[i] as Dictionary).duplicate()
		b["id"] = i
		b["layer"] = b.get("layer", 0)
		(d["bubbles"] as Array).append(b)
	return LevelData.from_dict(d)


static func play(lv: LevelData) -> GameState:
	var s: GameState = GameState.from_level(lv)
	Rules.start(s)
	return s
