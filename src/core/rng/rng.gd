class_name Rng
extends RefCounted
## 可播种的确定性随机数（mulberry32）。只用整数运算，保证各平台逐位一致。

const MASK := 0xFFFFFFFF

var _a: int


func _init(seed_value: int) -> void:
	_a = seed_value & MASK


# 32 位乘法：拆成 16 位避免 64 位溢出
static func _imul(a: int, b: int) -> int:
	return ((a & 0xFFFF) * b + (((((a >> 16) & 0xFFFF) * b) & 0xFFFF) << 16)) & MASK


func next_u32() -> int:
	_a = (_a + 0x6D2B79F5) & MASK
	var t: int = _a
	t = _imul(t ^ (t >> 15), t | 1)
	t = (t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & MASK)) & MASK
	return (t ^ (t >> 14)) & MASK


## 闭区间 [lo, hi]
func range_i(lo: int, hi: int) -> int:
	return lo + next_u32() % (hi - lo + 1)


func randf() -> float:
	return float(next_u32()) / 4294967296.0


func pick(arr: Array) -> Variant:
	return arr[next_u32() % arr.size()]


func shuffle(arr: Array) -> void:
	for i: int in range(arr.size() - 1, 0, -1):
		var j: int = next_u32() % (i + 1)
		var tmp: Variant = arr[i]
		arr[i] = arr[j]
		arr[j] = tmp
