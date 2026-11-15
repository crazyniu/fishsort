extends SceneTree
## 导出黄金数据：Godot 版核心逻辑在固定输入下的输出，给 Cocos 版（client/）的 TypeScript 移植做逐项对比。
## 用法：./run.sh golden <输出目录> [--runs=N]
## 产物：rng / curve / gen / levels / play / meta 六个 JSON，外加当时用的 economy / species / ads 配置。
## 见 docs/09 第 8 节「一致性保证」。只读配置和关卡，不写仓库里的任何文件。

var _out: String = ""
var _runs: int = 40
var _log: Array = []


func _init() -> void:
	for a: String in OS.get_cmdline_user_args():
		if a.begins_with("--runs="):
			_runs = int(a.trim_prefix("--runs="))
		else:
			_out = a
	if _out.is_empty():
		printerr("用法: ./run.sh golden <输出目录> [--runs=N]")
		quit(2)
		return
	DirAccess.make_dir_recursive_absolute(_out)
	var t0: int = Time.get_ticks_msec()
	for name: String in ["economy", "species", "ads", "level_curve"]:
		_write(name, _cfg(name))
	_write("rng", _rng())
	_write("curve", _curve())
	_write("gen", _gen())
	_write("play", _plays())
	_write("meta", _meta())
	_write("levels", _levels())
	print("黄金数据已导出到 %s，用时 %.1f 秒" % [_out, (Time.get_ticks_msec() - t0) / 1000.0])
	quit(0)


func _cfg(name: String) -> Variant:
	return JSON.parse_string(FileAccess.get_file_as_string("res://config/%s.json" % name))


func _write(name: String, data: Variant) -> void:
	var f := FileAccess.open("%s/%s.json" % [_out, name], FileAccess.WRITE)
	# full_precision：浮点按 17 位有效数字写，TS 那边逐位比对
	f.store_string(JSON.stringify(data, "", false, true))
	f.close()
	print("  %s.json" % name)


# ---------------------------------------------------------------- 随机数


func _rng() -> Array:
	var out: Array = []
	for seed_value: int in [0, 1, 7, 42, 123456789, 0xFFFFFFFF, 0x6D2B79F5]:
		var r := Rng.new(seed_value)
		var u32: Array = []
		for i: int in 200:
			u32.append(r.next_u32())
		var ranges: Array = []
		for i: int in 50:
			ranges.append(r.range_i(-3, 17))
		var floats: Array = []
		for i: int in 50:
			floats.append(r.randf())
		var arr: Array = range(20)
		r.shuffle(arr)
		out.append(
			{"seed": seed_value, "u32": u32, "range": ranges, "randf": floats, "shuffle": arr}
		)
	return out


# ---------------------------------------------------------------- 难度曲线与生成器


func _curve() -> Dictionary:
	var curve: Dictionary = _cfg("level_curve")
	var params: Array = []
	var targets: Array = []
	for id: int in range(1, 131):
		for ease: int in 3:
			params.append({"id": id, "ease": ease, "p": LevelCurve.params(curve, id, ease)})
		for chal: bool in [false, true]:
			(
				targets
				. append(
					{
						"id": id,
						"challenge": chal,
						"rate": LevelCurve.target_rate(curve, id, chal),
						"span": LevelCurve.target(curve, id, chal),
					}
				)
			)
	return {"params": params, "targets": targets}


func _gen() -> Array:
	var curve: Dictionary = _cfg("level_curve")
	var cases: Array = []
	var ids: Array = [1, 2, 3, 4, 5, 7, 10, 12, 16, 20, 25, 30, 33, 40, 45, 50, 60, 61, 75, 80]
	ids.append_array([95, 100, 110, 115, 120])
	for i: int in ids.size():
		var id: int = ids[i]
		var p: Dictionary = LevelCurve.params(curve, id, 0)
		# 一半带打乱，覆盖 Bots.solve 找参考解那条路
		if i % 2 == 0 and id > 2:
			p["scramble"] = int(float(p["fish"]) * 0.5 * 0.4)
		cases.append({"p": p, "seed": LevelCurve.seed_for(id, 0) + i * 10007})
	for id: int in [30, 85]:
		for ease: int in [1, 2]:
			cases.append(
				{"p": LevelCurve.params(curve, id, ease), "seed": LevelCurve.seed_for(id, ease)}
			)
	var sets: Array = [
		{"species": 3, "fish": 9, "layers": 1, "slack": 0},
		{"species": 6, "fish": 60, "layers": 3, "slack": 2, "chain": 2, "timer": 1},
		{
			"species": 8,
			"fish": 90,
			"layers": 4,
			"slack": 2,
			"chain": 1,
			"ice": 2,
			"big": 1,
			"pairs": 2,
			"fog": 0.3
		},
		{
			"species": 6,
			"fish": 60,
			"layers": 1,
			"slack": 1,
			"cap": 8,
			"per_min": 2,
			"per_max": 4,
			"scramble": 12
		},
	]
	for p: Dictionary in sets:
		for s: int in 3:
			cases.append({"p": p, "seed": s + 1})
	var out: Array = []
	for c: Dictionary in cases:
		var lv: LevelData = LevelGen.generate(c["p"], c["seed"])
		out.append({"p": c["p"], "seed": c["seed"], "level": lv.to_dict() if lv != null else null})
	return out


# ---------------------------------------------------------------- 关卡校验与机器人胜率


func _levels() -> Array:
	var out: Array = []
	var names: Array = []
	for n: String in DirAccess.get_files_at("res://config/levels"):
		if n.ends_with(".json"):
			names.append(n)
	names.sort()
	for n: String in names:
		var lv: LevelData = LevelData.from_json(
			FileAccess.get_file_as_string("res://config/levels/" + n)
		)
		var variant: bool = n.contains("_e")
		var rep: Dictionary = LevelCheck.replay(lv)
		(
			out
			. append(
				{
					"name": n.get_basename(),
					"errors": LevelCheck.errors(lv),
					"won": rep["won"],
					"peak": rep["peak"],
					"steps": rep["steps"],
					"g2": Bots.rate(lv, "greedy", 2, _runs),
					"g3": -1 if variant else Bots.rate(lv, "greedy", 3, _runs),
					"r2": -1 if variant else Bots.rate(lv, "random", 2, _runs),
				}
			)
		)
	return out


# ---------------------------------------------------------------- 局内：随机操作序列


func _plays() -> Array:
	var out: Array = []
	for id: int in range(1, 121, 4):
		for suffix: String in ["", "_e1"]:
			if suffix == "_e1" and id % 3 != 0:
				continue
			var name: String = "level_%04d%s" % [id, suffix]
			var lv: LevelData = LevelData.from_json(
				FileAccess.get_file_as_string("res://config/levels/%s.json" % name)
			)
			out.append(_play(name, lv, id * 31 + 7))
	return out


func _play(name: String, lv: LevelData, seed_value: int) -> Dictionary:
	var s: GameState = GameState.from_level(lv)
	var rng := Rng.new(seed_value)
	var start: Array[Dictionary] = Rules.start(s)
	var steps: Array = []
	var step: int = 0
	while s.status != GameState.Status.WON and step < 600:
		step += 1
		var act: Dictionary = {}
		if s.status == GameState.Status.LOST:
			if s.revived:
				break
			act = {"a": "revive"}
		elif step % 23 == 0 and s.open_slots < GameState.MAX_SLOTS:
			act = {"a": "unlock"}
		elif step % 29 == 0:
			act = {"a": "shuffle", "seed": step * 7 + 1}
		elif step % 17 == 0:
			act = {"a": "current"}
		elif step % 13 == 0:
			act = {"a": "blow"}
		elif step % 19 == 0:
			act = {"a": "net", "slot": rng.range_i(0, s.open_slots - 1)}
		elif step % 7 == 0:
			act = {"a": "tick", "dt": 4.5}
		else:
			var t: Array = Bots.next_tap(s, rng) if rng.randf() < 0.7 else _random_tap(s, rng)
			if t.is_empty():
				act = {"a": "tick", "dt": 1.0}
			else:
				act = {"a": "tap", "b": t[0], "k": t[1]}
		steps.append({"act": act, "ev": Rules.apply(s, act)})
	return {"name": name, "start": start, "steps": steps, "final": _snap(s)}


## 随便点一条：可能点到被压住、锁住或已经空了的位置，覆盖无效点击
func _random_tap(s: GameState, rng: Rng) -> Array:
	if not s.return_fish.is_empty() and rng.randf() < 0.3:
		return [GameState.RETURN_BUBBLE, rng.range_i(0, s.return_fish.size() - 1)]
	var b: int = rng.range_i(0, s.bubbles.size() - 1)
	return [b, rng.range_i(0, s.bubbles[b].fish.size() - 1)]


func _snap(s: GameState) -> Dictionary:
	var bubbles: Array = []
	for b: GameState.Bubble in s.bubbles:
		bubbles.append(
			{
				"fish": b.fish,
				"chain": b.chain,
				"frozen": b.frozen,
				"pairs": b.pairs,
				"on_field": b.on_field
			}
		)
	var slots: Array = []
	for i: int in GameState.MAX_SLOTS:
		var bowl: GameState.Bowl = s.slots[i]
		if bowl == null:
			slots.append(null)
		else:
			slots.append(
				{
					"species": bowl.species,
					"cap": bowl.cap,
					"count": bowl.count,
					"timer": bowl.timer,
					"order": bowl.order
				}
			)
	return {
		"bubbles": bubbles,
		"next_order": s.next_order,
		"slots": slots,
		"open_slots": s.open_slots,
		"buffer": s.buffer,
		"return_fish": s.return_fish,
		"status": s.status,
		"lose_reason": s.lose_reason,
		"bowls_done": s.bowls_done,
		"revived": s.revived,
		"next_drop": s.next_drop,
	}


# ---------------------------------------------------------------- 局外：模拟一个玩家玩 60 天
# 每次调用记 { fn, args, ret }，每天结束记一次存档。TS 那边按同样的顺序、同一个 Rng 重放。
# 决策用另一个 Rng（不传进被测函数），所以重放时不需要复现决策。


func _call(fn: String, args: Array, ret: Variant) -> Variant:
	var r: Variant = ret
	if ret is Dictionary or ret is Array:
		r = ret.duplicate(true)
	_log.append({"fn": fn, "args": args, "ret": r})
	return ret


func _meta() -> Dictionary:
	var eco: Dictionary = _cfg("economy")
	var ads: Dictionary = _cfg("ads")
	var species: Array = _cfg("species")["species"]
	var pick := Rng.new(2024)
	var rng := Rng.new(777)
	var save: Dictionary = PlayerData.create(eco)
	_log = []
	var days: Array = []
	var combo := Combo.new()
	for di: int in 60:
		var day: int = 20000 + di
		var now: int = day * 86400 + 8 * 3600
		var mono: float = float(di) * 5000.0
		if SignIn.can_claim(save, day) and pick.randf() < 0.8:
			var doubled: bool = pick.randf() < 0.3
			var r: Dictionary = _call(
				"SignIn.claim",
				[day, now, doubled],
				SignIn.claim(save, eco, species, rng, day, now, doubled)
			)
			if not doubled and pick.randf() < 0.4:
				_call(
					"SignIn.double_today",
					[day, now, r],
					SignIn.double_today(save, eco, species, rng, day, now, r)
				)
		_call("Meta.take_free_coin", [day], Meta.take_free_coin(save, eco, day))
		# 打关：赢输交替，偶尔重玩旧关
		for _attempt: int in pick.range_i(2, 7):
			now += 300
			mono += 200.0
			var level_id: int = int(save["level"])
			if level_id > 6 and pick.randf() < 0.15:
				level_id = pick.range_i(1, level_id - 1)
			var challenge: bool = level_id % 5 == 0 and level_id > 2
			if not _call(
				"Lives.can_start", [level_id, now], Lives.can_start(save, eco, level_id, now)
			):
				if pick.randf() < 0.5:
					_call("Lives.buy_one", [now], Lives.buy_one(save, eco, now))
				else:
					_call("Lives.buy_refill", [now], Lives.buy_refill(save, eco, now))
				continue
			combo = Combo.new()
			_call("Combo.new", [], null)
			var cards_open: bool = Features.is_unlocked(eco, "album", int(save["level"]))
			var t: float = 0.0
			for _h: int in pick.range_i(5, 30):
				t += 0.3 + pick.randf() * 2.5
				if pick.randf() < 0.1:
					combo.miss()
					_call("Combo.miss", [], null)
				else:
					_call("Combo.hit", [t, cards_open], combo.hit(t, eco["combo"], rng, cards_open))
			if pick.randf() < 0.7:
				if Dex.counts_win(save, level_id, false):
					var counts: Dictionary = {}
					for _k: int in pick.range_i(1, 4):
						var sp: String = species[pick.range_i(0, 15)]["id"]
						counts[sp] = int(counts.get(sp, 0)) + 3 * pick.range_i(1, 4)
					Dex.record(save, counts)
					_call("Dex.record", [counts], null)
				var args: Dictionary = {
					"level": level_id,
					"challenge": challenge,
					"day": day,
					"now": now,
					"combo_coins": combo.coins,
					"best_combo": combo.best,
				}
				var res: Dictionary = _call("Settle.win", [args], Settle.win(save, eco, args))
				if pick.randf() < 0.3:
					_call("Settle.double_coins", [res], Settle.double_coins(save, eco, res))
				if res["chest_ok"]:
					_call(
						"LevelChest.open",
						[level_id, challenge],
						LevelChest.open(save, eco, species, level_id, challenge, rng)
					)
					if pick.randf() < 0.3:
						_call(
							"LevelChest.open_ad",
							[level_id, challenge],
							LevelChest.open_ad(save, eco, species, level_id, challenge, rng)
						)
				var show: bool = _call(
					"Meta.should_show_interstitial",
					[level_id, mono],
					Meta.should_show_interstitial(save, ads, level_id, mono)
				)
				if show:
					Meta.mark_interstitial(save, level_id, mono)
					_call("Meta.mark_interstitial", [level_id, mono], null)
			else:
				_call("Meta.fail_level", [level_id], Meta.fail_level(save, eco, level_id))
				_call(
					"Meta.open_slots_for",
					[level_id, 2],
					Meta.open_slots_for(save, eco, level_id, 2)
				)
				_call(
					"Lives.lose", [level_id, true, now], Lives.lose(save, eco, level_id, true, now)
				)
				if pick.randf() < 0.3:
					Meta.mark_rewarded(save, mono)
					_call("Meta.mark_rewarded", [mono], null)
		# 技能
		for id: String in Skills.ids(eco):
			if pick.randf() < 0.3:
				var used: int = pick.range_i(0, 2)
				_call("Skills.try_use", [id, used, day], Skills.try_use(save, eco, id, used, day))
			if pick.randf() < 0.15:
				_call("Skills.buy", [id], Skills.buy(save, eco, id))
		# 抽奖
		if Features.is_unlocked(eco, "wheel", int(save["level"])):
			if pick.randf() < 0.5:
				_call("Wheel.claim_ad", [day], Wheel.claim_ad(save, eco, day))
			while Wheel.spins_left(save, eco, day) > 0:
				_call(
					"Wheel.spin",
					[day, now, "spin"],
					Wheel.spin(save, eco, species, rng, day, now, "spin")
				)
			if int(save["coins"]) >= 9000 and pick.randf() < 0.5:
				_call(
					"Wheel.ten_pull", [day, now], Wheel.ten_pull(save, eco, species, rng, day, now)
				)
			elif pick.randf() < 0.3:
				_call(
					"Wheel.spin",
					[day, now, "coins"],
					Wheel.spin(save, eco, species, rng, day, now, "coins")
				)
		# 分享
		for kind: String in ["wheel", "life", "card", "help"]:
			if pick.randf() < 0.4:
				_call("Share.claim", [kind, day, now], Share.claim(save, eco, kind, day, now, rng))
		# 每日挑战
		if Features.is_unlocked(eco, "daily", int(save["level"])):
			if DailyChallenge.can_start_free(save, day):
				_call(
					"DailyChallenge.enter",
					[day, "free"],
					DailyChallenge.enter(save, eco, day, "free")
				)
			elif pick.randf() < 0.5:
				_call(
					"DailyChallenge.enter",
					[day, "coins"],
					DailyChallenge.enter(save, eco, day, "coins")
				)
			if pick.randf() < 0.7:
				var cc: int = pick.range_i(0, 3) * 20
				_call(
					"DailyChallenge.win",
					[day, now, cc],
					DailyChallenge.win(save, eco, species, day, now, rng, cc)
				)
		# 家园、收藏、救援记录
		for _n: int in 3:
			if HomeBase.can_build(save, eco):
				_call("HomeBase.build", [now], HomeBase.build(save, eco, now))
		for b: int in Album.books(eco).size():
			if Album.can_claim(save, eco, b):
				_call("Album.claim", [b, now], Album.claim(save, eco, b, now))
		if Album.can_claim_final(save, eco):
			_call("Album.claim_final", [now], Album.claim_final(save, eco, now))
		for id: String in (save["dex"]["seen"] as Dictionary).keys():
			if Dex.can_claim(save, eco, id):
				_call("Dex.claim", [id], Dex.claim(save, eco, id))
		_call("Lives.seconds_to_next", [now + 600], Lives.seconds_to_next(save, eco, now + 600))
		_call("Wheel.spins_left", [day + 1], Wheel.spins_left(save, eco, day + 1))
		days.append({"ops": _log.size(), "save": save.duplicate(true)})
	# 读档迁移：v1 老档
	var old: Dictionary = {
		"version": 1,
		"level": 13,
		"coins": 40,
		"tickets": 7,
		"stars": 12,
		"tools": {"net": 1, "blow": 1, "shuffle": 3},
		"cards": {"c01": 2},
		"daily": {"day": 77, "firstWin": true, "freeCoin": 2},
		"signin": {"count": 4, "lastDay": 77},
	}
	var migrated: Dictionary = PlayerData.migrate(old.duplicate(true), eco)
	return {
		"seed": 777,
		"ops": _log,
		"days": days,
		"create": PlayerData.create(eco),
		"migrate": {"from": old, "to": migrated},
		"features": Features.newly_unlocked(eco, 0, 200),
		"odds": Wheel.odds(eco),
	}
