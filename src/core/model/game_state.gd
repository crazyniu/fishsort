class_name GameState
extends RefCounted
## 一局游戏的全部可变状态。只由 Rules 修改。

enum Status { PLAYING, WON, LOST }
enum LoseReason { NONE, BUFFER_FULL, TIMEOUT, STUCK }

const REMOVED := -1
## 生成器专用：位置上有鱼但种类未定
const UNASSIGNED := -2
## 回流位（吹泡产生的气泡）的气泡编号
const RETURN_BUBBLE := -1
const MAX_SLOTS := 4
const NO_TIMER := -1.0


class Bubble:
	var fish: Array[int] = []
	var under: Array[int] = []
	var chain: int = 0
	var ice: Array[int] = []
	var frozen: bool = false
	var fog: bool = false
	var pairs: Array = []

	func count() -> int:
		var n := 0
		for f: int in fish:
			if f != REMOVED:
				n += 1
		return n

	func partner_of(k: int) -> int:
		for p: Array in pairs:
			if p[0] == k:
				return p[1]
			if p[1] == k:
				return p[0]
		return -1

	func clone() -> Bubble:
		var b := Bubble.new()
		b.fish = fish.duplicate()
		b.under = under
		b.chain = chain
		b.ice = ice
		b.frozen = frozen
		b.fog = fog
		b.pairs = pairs.duplicate()
		return b


class Bowl:
	var species: int = 0
	var cap: int = 3
	var count: int = 0
	var timer: float = NO_TIMER
	var order: int = 0

	func clone() -> Bowl:
		var b := Bowl.new()
		b.species = species
		b.cap = cap
		b.count = count
		b.timer = timer
		b.order = order
		return b


var bubbles: Array[Bubble] = []
var orders: Array[Dictionary] = []
var next_order: int = 0
## 长度固定为 MAX_SLOTS，元素是 Bowl 或 null
var slots: Array = [null, null, null, null]
var open_slots: int = 2
var buffer: Array[int] = []
var buffer_cap: int = 5
var return_fish: Array[int] = []
var status: Status = Status.PLAYING
var lose_reason: LoseReason = LoseReason.NONE
var bowls_done: int = 0
var revived: bool = false


static func from_level(level: LevelData) -> GameState:
	var s := GameState.new()
	s.orders = level.orders
	s.open_slots = level.bowl_slots
	s.buffer_cap = level.buffer
	for d: Dictionary in level.bubbles:
		var b := Bubble.new()
		b.fish.assign(d["fish"])
		b.under.assign(d["under"])
		b.chain = d["chain"]
		b.ice.assign(d["ice"])
		b.frozen = not b.ice.is_empty()
		b.fog = d["fog"]
		b.pairs = (d["pairs"] as Array).duplicate(true)
		s.bubbles.append(b)
	return s


func clone() -> GameState:
	var s := GameState.new()
	for b: Bubble in bubbles:
		s.bubbles.append(b.clone())
	s.orders = orders
	s.next_order = next_order
	for i: int in MAX_SLOTS:
		s.slots[i] = (slots[i] as Bowl).clone() if slots[i] != null else null
	s.open_slots = open_slots
	s.buffer = buffer.duplicate()
	s.buffer_cap = buffer_cap
	s.return_fish = return_fish.duplicate()
	s.status = status
	s.lose_reason = lose_reason
	s.bowls_done = bowls_done
	s.revived = revived
	return s


func fish_left() -> int:
	var n: int = return_fish.size() + buffer.size()
	for b: Bubble in bubbles:
		n += b.count()
	return n
