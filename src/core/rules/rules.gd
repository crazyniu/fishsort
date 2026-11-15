class_name Rules
extends RefCounted
## 规则状态机，见 docs/01-玩法设计.md 第 3–5 节。
## 所有函数就地修改 state，并返回供表现层播放的事件序列。

const REVIVE_EXTRA_SECONDS := 30.0


## 开局：把订单队列的前几个缸摆上架
static func start(s: GameState) -> Array[Dictionary]:
	var ev: Array[Dictionary] = []
	_settle(s, ev)
	return ev


## 统一入口，便于录制与回放
static func apply(s: GameState, action: Dictionary) -> Array[Dictionary]:
	match action.get("a", ""):
		"tap":
			return tap(s, action["b"], action["k"])
		"tick":
			return tick(s, action["dt"])
		"unlock":
			return unlock_bowl(s)
		"net":
			return use_net(s, action["slot"])
		"blow":
			return use_blow(s)
		"shuffle":
			return use_shuffle(s, action["seed"])
		"current":
			return use_current(s)
		"revive":
			return revive(s)
	return []


static func _covered(s: GameState) -> Dictionary:
	var covered: Dictionary = {}
	for b: GameState.Bubble in s.bubbles:
		if b.on_field and b.count() > 0:
			for u: int in b.under:
				covered[u] = true
	return covered


static func is_open(s: GameState, b: int) -> bool:
	if b == GameState.RETURN_BUBBLE:
		return not s.return_fish.is_empty()
	var bub: GameState.Bubble = s.bubbles[b]
	if not bub.on_field or bub.count() == 0 or bub.chain > 0 or bub.frozen:
		return false
	return not _covered(s).has(b)


static func open_bubbles(s: GameState) -> Array[int]:
	var out: Array[int] = []
	var covered: Dictionary = _covered(s)
	for i: int in s.bubbles.size():
		var bub: GameState.Bubble = s.bubbles[i]
		if (
			bub.on_field
			and bub.count() > 0
			and bub.chain == 0
			and not bub.frozen
			and not covered.has(i)
		):
			out.append(i)
	return out


## 哪个缸收这种鱼；没有返回 -1。多个缸都收时取最左
static func find_slot(s: GameState, species: int) -> int:
	for i: int in s.open_slots:
		var bowl: GameState.Bowl = s.slots[i]
		if bowl != null and bowl.species == species and bowl.count < bowl.cap:
			return i
	return -1


static func tap(s: GameState, b: int, k: int) -> Array[Dictionary]:
	var ev: Array[Dictionary] = []
	if s.status != GameState.Status.PLAYING:
		return ev
	if b == GameState.RETURN_BUBBLE:
		if k < 0 or k >= s.return_fish.size():
			return ev
		var sp: int = s.return_fish[k]
		s.return_fish.remove_at(k)
		_place(s, sp, b, k, ev)
	else:
		if b < 0 or b >= s.bubbles.size() or not is_open(s, b):
			return ev
		var bub: GameState.Bubble = s.bubbles[b]
		if k < 0 or k >= bub.fish.size() or bub.fish[k] < 0:
			return ev
		var partner: int = bub.partner_of(k)
		_take(s, b, k, ev)
		# 结伴鱼：第二条紧跟着结算，没地方去就失败
		if partner >= 0 and bub.fish[partner] >= 0 and s.status == GameState.Status.PLAYING:
			_take(s, b, partner, ev)
		if bub.count() == 0:
			_pop(s, b, ev)
	_finish(s, ev)
	return ev


static func tick(s: GameState, dt: float) -> Array[Dictionary]:
	var ev: Array[Dictionary] = []
	if s.status != GameState.Status.PLAYING:
		return ev
	for i: int in s.open_slots:
		var bowl: GameState.Bowl = s.slots[i]
		if bowl != null and bowl.timer != GameState.NO_TIMER:
			bowl.timer = maxf(bowl.timer - dt, 0.0)
			if bowl.timer <= 0.0:
				_lose(s, GameState.LoseReason.TIMEOUT, ev)
				return ev
	return ev


static func unlock_bowl(s: GameState) -> Array[Dictionary]:
	var ev: Array[Dictionary] = []
	if s.status != GameState.Status.PLAYING or s.open_slots >= GameState.MAX_SLOTS:
		return ev
	s.open_slots += 1
	ev.append({"t": &"slot_open", "slot": s.open_slots - 1})
	_settle(s, ev)
	_finish(s, ev)
	return ev


## 渔网：从场上任意位置捞鱼补满指定缸
static func use_net(s: GameState, slot: int) -> Array[Dictionary]:
	var ev: Array[Dictionary] = []
	if (
		s.status != GameState.Status.PLAYING
		or slot < 0
		or slot >= s.open_slots
		or s.slots[slot] == null
	):
		return ev
	var bowl: GameState.Bowl = s.slots[slot]
	var k: int = 0
	while k < s.return_fish.size() and bowl.count < bowl.cap:
		if s.return_fish[k] == bowl.species:
			s.return_fish.remove_at(k)
			bowl.count += 1
			ev.append(
				{
					"t": &"net_fish",
					"b": GameState.RETURN_BUBBLE,
					"k": k,
					"slot": slot,
					"species": bowl.species
				}
			)
		else:
			k += 1
	# 先捞开放气泡里的，再捞场上其它的，最后捞候场队列里的
	var order: Array[int] = open_bubbles(s)
	for i: int in s.bubbles.size():
		if not order.has(i) and s.bubbles[i].on_field:
			order.append(i)
	for i: int in s.bubbles.size():
		if not s.bubbles[i].on_field:
			order.append(i)
	for b: int in order:
		var bub: GameState.Bubble = s.bubbles[b]
		var taken := false
		for f: int in bub.fish.size():
			if bowl.count >= bowl.cap:
				break
			if bub.fish[f] == bowl.species:
				bub.fish[f] = GameState.REMOVED
				bowl.count += 1
				taken = true
				ev.append({"t": &"net_fish", "b": b, "k": f, "slot": slot, "species": bowl.species})
		if taken and bub.count() == 0:
			_pop(s, b, ev)
	_settle(s, ev)
	_finish(s, ev)
	return ev


## 洋流：场上所有能直接进缸的鱼依次自动入缸。每放进一条就重新判断一次，
## 所以满缸换新缸后，新缸要的鱼也会继续进。发出的就是普通的 fish_to_bowl 等事件，
## 表现层和连击计数不用改。
static func use_current(s: GameState) -> Array[Dictionary]:
	var ev: Array[Dictionary] = []
	while s.status == GameState.Status.PLAYING:
		var pick: Vector2i = _current_target(s)
		if pick.x == -2:
			break
		ev.append_array(tap(s, pick.x, pick.y))
	return ev


## 找下一条能直接进缸的鱼 (气泡, 序号)；没有返回 (-2, -2)。
## 结伴鱼只有两条都有地方去时才放行，避免洋流把鱼送进暂存槽
static func _current_target(s: GameState) -> Vector2i:
	for k: int in s.return_fish.size():
		if find_slot(s, s.return_fish[k]) >= 0:
			return Vector2i(GameState.RETURN_BUBBLE, k)
	for b: int in open_bubbles(s):
		var bub: GameState.Bubble = s.bubbles[b]
		for k: int in bub.fish.size():
			var sp: int = bub.fish[k]
			if sp < 0 or find_slot(s, sp) < 0:
				continue
			var partner: int = bub.partner_of(k)
			if partner >= 0 and bub.fish[partner] >= 0 and not _pair_fits(s, bub, k, partner):
				continue
			return Vector2i(b, k)
	return Vector2i(-2, -2)


static func _pair_fits(s: GameState, bub: GameState.Bubble, k: int, partner: int) -> bool:
	var a: int = bub.fish[k]
	var b: int = bub.fish[partner]
	var slot_a: int = find_slot(s, a)
	var slot_b: int = find_slot(s, b)
	if slot_b < 0:
		# 第一条入缸若恰好满缸，下一张订单可能是第二条要的，这里保守地不放行
		return false
	if slot_a == slot_b:
		var bowl: GameState.Bowl = s.slots[slot_a]
		return bowl.cap - bowl.count >= 2
	return true


## 吹泡：暂存槽的鱼全部回到回流位
static func use_blow(s: GameState) -> Array[Dictionary]:
	var ev: Array[Dictionary] = []
	if s.status != GameState.Status.PLAYING or s.buffer.is_empty():
		return ev
	_blow(s, ev)
	return ev


## 洗牌：按当前局面重新构造一个可解的分布（各鱼种数量不变）
static func use_shuffle(s: GameState, seed_value: int) -> Array[Dictionary]:
	var ev: Array[Dictionary] = []
	if s.status != GameState.Status.PLAYING:
		return ev
	if Constructor.reshuffle(s, Rng.new(seed_value)):
		ev.append({"t": &"shuffle"})
	return ev


static func revive(s: GameState) -> Array[Dictionary]:
	var ev: Array[Dictionary] = []
	if s.status != GameState.Status.LOST or s.revived:
		return ev
	var reason: GameState.LoseReason = s.lose_reason
	s.revived = true
	s.status = GameState.Status.PLAYING
	s.lose_reason = GameState.LoseReason.NONE
	ev.append({"t": &"revive"})
	match reason:
		GameState.LoseReason.BUFFER_FULL:
			_blow(s, ev)
		GameState.LoseReason.TIMEOUT:
			for i: int in s.open_slots:
				var bowl: GameState.Bowl = s.slots[i]
				if bowl != null and bowl.timer != GameState.NO_TIMER and bowl.timer <= 0.0:
					bowl.timer = REVIVE_EXTRA_SECONDS
		GameState.LoseReason.STUCK:
			for i: int in s.bubbles.size():
				var bub: GameState.Bubble = s.bubbles[i]
				if bub.chain > 0:
					bub.chain = 0
					ev.append({"t": &"chain_open", "b": i})
				if bub.frozen:
					bub.frozen = false
					ev.append({"t": &"ice_melt", "b": i})
	return ev


static func _blow(s: GameState, ev: Array[Dictionary]) -> void:
	s.return_fish.append_array(s.buffer)
	s.buffer.clear()
	ev.append({"t": &"blow"})


static func _take(s: GameState, b: int, k: int, ev: Array[Dictionary]) -> void:
	var bub: GameState.Bubble = s.bubbles[b]
	var sp: int = bub.fish[k]
	bub.fish[k] = GameState.REMOVED
	_place(s, sp, b, k, ev)


static func _place(s: GameState, sp: int, b: int, k: int, ev: Array[Dictionary]) -> void:
	var slot: int = find_slot(s, sp)
	if slot >= 0:
		(s.slots[slot] as GameState.Bowl).count += 1
		ev.append({"t": &"fish_to_bowl", "b": b, "k": k, "species": sp, "slot": slot})
	else:
		# 即使溢出也先放进去，保证鱼不丢，复活时一起吹回
		s.buffer.append(sp)
		ev.append(
			{"t": &"fish_to_buffer", "b": b, "k": k, "species": sp, "index": s.buffer.size() - 1}
		)
		if s.buffer.size() > s.buffer_cap:
			_lose(s, GameState.LoseReason.BUFFER_FULL, ev)
			return
	_settle(s, ev)


## 满缸送走 → 新缸补位 → 暂存槽自动入缸，循环到稳定
static func _settle(s: GameState, ev: Array[Dictionary]) -> void:
	var changed := true
	while changed:
		changed = false
		for i: int in s.open_slots:
			var bowl: GameState.Bowl = s.slots[i]
			if bowl != null and bowl.count >= bowl.cap:
				s.slots[i] = null
				s.bowls_done += 1
				ev.append(
					{"t": &"bowl_done", "slot": i, "species": bowl.species, "order": bowl.order}
				)
				for bi: int in s.bubbles.size():
					var bub: GameState.Bubble = s.bubbles[bi]
					if bub.chain > 0:
						bub.chain -= 1
						ev.append(
							{"t": &"chain_open" if bub.chain == 0 else &"chain_tick", "b": bi}
						)
				changed = true
		for i: int in s.open_slots:
			if s.slots[i] == null and s.next_order < s.orders.size():
				var o: Dictionary = s.orders[s.next_order]
				var bowl := GameState.Bowl.new()
				bowl.species = o["s"]
				bowl.cap = o["cap"]
				bowl.order = s.next_order
				bowl.timer = float(o["timer"]) if o["timer"] > 0 else GameState.NO_TIMER
				s.slots[i] = bowl
				s.next_order += 1
				ev.append(
					{
						"t": &"bowl_in",
						"slot": i,
						"species": bowl.species,
						"cap": bowl.cap,
						"timer": bowl.timer,
						"order": bowl.order
					}
				)
				changed = true
		var j: int = 0
		while j < s.buffer.size():
			var slot: int = find_slot(s, s.buffer[j])
			if slot >= 0:
				var sp: int = s.buffer[j]
				s.buffer.remove_at(j)
				(s.slots[slot] as GameState.Bowl).count += 1
				ev.append({"t": &"buffer_to_bowl", "index": j, "species": sp, "slot": slot})
				changed = true
			else:
				j += 1


static func _pop(s: GameState, b: int, ev: Array[Dictionary]) -> void:
	var on_field: bool = s.bubbles[b].on_field
	# 还在候场队列里就被渔网捞空的气泡，界面上从没出现过，不发破裂事件也不补落
	if on_field:
		ev.append({"t": &"bubble_pop", "b": b})
	for i: int in s.bubbles.size():
		var bub: GameState.Bubble = s.bubbles[i]
		if bub.frozen and bub.ice.has(b):
			bub.frozen = false
			ev.append({"t": &"ice_melt", "b": i})
	if on_field:
		_drop(s, ev)


## 掉落关：场上空出一个位置，候场队列的队头落下
static func _drop(s: GameState, ev: Array[Dictionary]) -> void:
	while s.next_drop < s.bubbles.size():
		var i: int = s.next_drop
		s.next_drop += 1
		var bub: GameState.Bubble = s.bubbles[i]
		if bub.count() == 0:
			continue
		bub.on_field = true
		# 依赖的邻居可能在它落下之前就破了
		bub.frozen = false
		for dep: int in bub.ice:
			if s.bubbles[dep].count() > 0:
				bub.frozen = true
		ev.append({"t": &"bubble_drop", "b": i})
		return


static func _lose(s: GameState, reason: GameState.LoseReason, ev: Array[Dictionary]) -> void:
	s.status = GameState.Status.LOST
	s.lose_reason = reason
	ev.append({"t": &"lose", "reason": reason})


static func _finish(s: GameState, ev: Array[Dictionary]) -> void:
	if s.status != GameState.Status.PLAYING:
		return
	if s.fish_left() == 0:
		s.status = GameState.Status.WON
		ev.append({"t": &"win"})
	elif s.buffer.size() >= s.buffer_cap:
		_lose(s, GameState.LoseReason.BUFFER_FULL, ev)
	elif s.return_fish.is_empty() and open_bubbles(s).is_empty():
		_lose(s, GameState.LoseReason.STUCK, ev)
