class_name GameScreen
extends Control
## 局内界面。规则全部交给 Rules；这里只负责转发输入，并把规则事件分派给各个部件去演：
## GameHud（顶部、暂存槽、技能键）、GameShelf（鱼缸和订单卡）、GameField（气泡场）、GameFx（特效）。

const W := 750.0
const FIELD_Y := 440.0
const TOOLS_H := GameHud.TOOLS_H
const LEVEL_COUNT := 120

## 进场时要打的关：0 = 当前进度的关；大于 0 = 重玩这一关（App.go_game 传入）
var start_id: int = 0

var _level_id: int = 1
var _lv: LevelData
var _s: GameState
var _species: Array[String] = []
var _tool_uses: Dictionary = {}
var _net_mode: bool = false
var _over: bool = false
var _total_fish: int = 0
## 只有刚进关卡时播入场动画，窗口缩放重建时不播
var _intro: bool = false

var _stage: Control
var _fx: GameFx
var _hud: GameHud
var _shelf: GameShelf
var _field: GameField
## 换关计数：延时回调用它判断自己是不是上一关留下的
var _run: int = 0
## 本关走过步没有（走过才会在退出、重开、失败时扣命）
var _moved: bool = false
var _won: bool = false
## 本关要强制教学的新技能，空串 = 没有
var _tutor: String = ""
## 连击：短时间内连续把鱼送进缸
var _combo: Combo = Combo.new()
## 这一串连击累计拿到的金币（显示在连击数字下面）
var _streak_coins: int = 0
## 本关连击送的图鉴卡（Cards.give 的返回值），没有则为空
var _combo_card: Dictionary = {}
var _combo_hud: ComboHud
## 只剩一种鱼时由游戏自己收尾，期间不接受点击
var _auto: bool = false
## 提示光圈：玩家一段时间没操作时指出一条能进缸的鱼
var _hint: Control
var _idle: float = 0.0


func _ready() -> void:
	resized.connect(_build)
	start_level(start_id if start_id > 0 else int(Save.data["level"]))


func start_level(id: int) -> void:
	Ads.banner(false)
	_level_id = id
	var ease: int = Meta.ease_for(Save.data, Config.eco, id)
	# 关卡数有限，超出后循环使用
	_lv = Config.load_level((id - 1) % LEVEL_COUNT + 1, ease)
	_s = GameState.from_level(_lv)
	if id <= int(Config.eco["freeBowlSlotUntil"]):
		_s.open_slots = 3
	Rules.start(_s)
	_species = GameSpecies.pick(_lv.level_seed, _lv.palette)
	_tool_uses = {}
	for tool: String in Skills.ids(Config.eco):
		_tool_uses[tool] = 0
	# 进度到了解锁关的技能先发解锁礼（只发一次），本关强制教学用一次
	Skills.sync_unlocks(Save.data, Config.eco)
	_tutor = ""
	for tool: String in Skills.ids(Config.eco):
		var here: bool = (
			id == int(Save.data["level"]) and id == Skills.unlock_level(Config.eco, tool)
		)
		# 每个技能的强制教学只出一次，重进解锁关不再出
		if here and not PlayerData.tip_seen(Save.data, "skill_" + tool):
			_tutor = tool
	_run += 1
	_moved = false
	_won = false
	_net_mode = false
	_over = false
	_auto = false
	_combo = Combo.new()
	_streak_coins = 0
	_combo_card = {}
	_hint = null
	_idle = 0.0
	_total_fish = _s.fish_left()
	_intro = true
	_build()
	_intro = false
	# 新机制第一次出现的关卡，开局说明一句
	var tips: Array[String] = []
	# 生命、掉落这类一次性提示：配置里按关卡给文案键，看过就记下
	var once: String = (GameCfg.d()["tips"] as Dictionary).get(str(id), "")
	if once != "" and not PlayerData.tip_seen(Save.data, once):
		PlayerData.mark_tip(Save.data, once)
		Save.save()
		tips.append(once)
	var tip: String = (Config.eco["mechanicIntro"] as Dictionary).get(str(id), "")
	if tip != "":
		tips.append(tip)
	# 同一关有两句时依次出，不叠在一起
	for i: int in tips.size():
		var wait: float = 0.9 + i * GameCfg.num("tutorial", "tipGap")
		get_tree().create_timer(wait).timeout.connect(_toast.bind(tr(tips[i])))
	if _tutor != "":
		get_tree().create_timer(GameCfg.num("tutorial", "delay")).timeout.connect(_check_tutorial)


func _process(delta: float) -> void:
	if _s == null or _over or _has_popup():
		return
	_idle += delta
	# 前几关是教学，提示来得快；之后发呆久了才提示
	var hint: Dictionary = GameCfg.d()["hint"]
	var teach: bool = _level_id <= int(hint["tutorialLevels"])
	var patience: float = float(hint["tutorialSeconds"] if teach else hint["seconds"])
	if _hint == null and not _auto and _idle > patience:
		_show_hint()
	var events: Array[Dictionary] = Rules.tick(_s, delta)
	for i: int in _s.open_slots:
		var bowl: GameState.Bowl = _s.slots[i]
		if bowl == null or bowl.timer == GameState.NO_TIMER:
			_shelf.set_timer(i, "", false)
		else:
			var text: String = "%d:%02d" % [int(bowl.timer) / 60, int(bowl.timer) % 60]
			_shelf.set_timer(i, text, bowl.timer <= 10.0)
	if not events.is_empty():
		_play(events)


# ---------- 搭建 ----------


func _build() -> void:
	if _s == null:
		return
	for c: Node in get_children():
		c.queue_free()
	var view: Vector2 = size
	var bg := TextureRect.new()
	bg.texture = UiKit.tex("res://assets/ui/bg_game.jpg")
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.size = view
	bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(bg)
	_stage = Control.new()
	_stage.position = Vector2((view.x - W) / 2.0, 0)
	_stage.size = Vector2(W, view.y)
	_stage.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_stage)
	_fx = GameFx.new(_stage, W)
	_hud = GameHud.new(_stage, _fx)
	_hud.build_top(_level_id, _lv.challenge, _fish_tex(0), _total_fish, _intro)
	_hud.set_rescued(_total_fish - _s.fish_left(), false)
	_shelf = GameShelf.new()
	_shelf.build(_stage, _fx, _s, _fish_tex, _intro, _on_bowl_pressed)
	var held: Array[Texture2D] = []
	for sp: int in _s.buffer:
		held.append(_fish_tex(sp))
	_hud.build_buffer(_s.buffer_cap, held, _intro)
	var input := Control.new()
	input.gui_input.connect(_on_field_input.bind(input))
	input.position = Vector2(0, FIELD_Y)
	input.size = Vector2(W, view.y - FIELD_Y - TOOLS_H)
	_stage.add_child(input)
	_field = GameField.new(_stage, _fx, _fish_tex, _tap)
	_field.build(_lv, _s, FIELD_Y, view.y - TOOLS_H, _intro)
	_hud.build_tools(view.y, _intro, _on_tool, _show_settings)


func _fish_tex(slot: int) -> Texture2D:
	return UiKit.tex("res://assets/fish/%s.png" % _species[slot])


# ---------- 输入 ----------


func _on_field_input(event: InputEvent, input: Control) -> void:
	var click := event as InputEventMouseButton
	if click == null or not click.pressed or click.button_index != MOUSE_BUTTON_LEFT:
		return
	if _over or _net_mode or _auto:
		return
	var p: Vector2 = click.position + input.position
	var hit: Array[int] = _field.pick(_s, p)
	if hit[0] >= 0:
		_tap(hit[0], hit[1])
	else:
		_field.reject(_s, p)


func _tap(b: int, k: int) -> void:
	if _over or _net_mode:
		return
	var from: Vector2 = _field.fish_pos(b, k)
	var events: Array[Dictionary] = Rules.tap(_s, b, k)
	if events.is_empty():
		return
	_idle = 0.0
	if _hint != null:
		_hint.queue_free()
		_hint = null
	# 点击处一圈水波，短促的「啵」
	_fx.ripple(from)
	Audio.sfx(&"bo", randf_range(0.95, 1.1))
	_moved = true
	_play(events)


## 连击命中一次：规则和奖励在 Combo 里算，这里只管演出。run 对不上说明已经换关了
func _combo_hit(from: Vector2, run: int) -> void:
	if run != _run or not is_inside_tree():
		return
	var cfg: Dictionary = Config.eco["combo"]
	var rng := Rng.new(Time.get_ticks_usec())
	var res: Dictionary = _combo.hit(Time.get_ticks_msec() / 1000.0, cfg, rng)
	if int(res["count"]) <= 1:
		_streak_coins = 0
	# 连击金币只在这里显示，入账由结算（Settle.win）统一做
	var gain: int = res["coins"]
	_streak_coins += gain
	var tier: int = res["tier"]
	if tier < 0:
		return
	if _combo_hud == null or not is_instance_valid(_combo_hud):
		_combo_hud = ComboHud.new(_stage, Vector2(0, FIELD_Y + 70), Vector2(W, 290))
	var praise: String = tr(cfg["tiers"][tier]["key"])
	_combo_hud.hit(
		res["count"], tier, res["tier_up"], praise, float(cfg["windowSeconds"]), _streak_coins
	)
	# 整个画面跟着顿一下
	_stage.pivot_offset = _stage.size / 2.0
	_stage.scale = Vector2.ONE * (1.012 + tier * 0.004)
	_stage.create_tween().tween_property(_stage, "scale", Vector2.ONE, 0.16)
	if gain > 0:
		_fx.gain("+%d" % gain, from)
	if res["card"]:
		# 连击送的图鉴卡：按宝箱的稀有度概率抽一张，当场入账，结算页列出
		var rarity: String = Cards.roll_rarity(Config.eco, Config.eco["chest"]["cardRates"], rng)
		var card: Dictionary = Cards.pick(Save.data, Config.species, rarity, rng)
		_combo_card = Cards.give(Save.data, Config.eco, card)
		_combo_hud.gift()


## 找一条点了就能直接进缸的鱼，套上提示光圈
func _show_hint() -> void:
	var wanted: Dictionary = {}
	for i: int in _s.open_slots:
		if _s.slots[i] != null:
			wanted[_s.slots[i].species] = true
	for b: int in Rules.open_bubbles(_s):
		for k: int in _s.bubbles[b].fish.size():
			if wanted.has(_s.bubbles[b].fish[k]):
				_hint = _fx.hint(_field.fish_pos(b, k))
				return
	_idle = 0.0


func _on_bowl_pressed(i: int) -> void:
	if _over:
		return
	if _net_mode:
		if i < _s.open_slots and _s.slots[i] != null:
			_net_mode = false
			if _spend_tool("net"):
				_fx.net_swing(_hud.tool_pos("net"), _shelf.pos(i))
				_play(Rules.use_net(_s, i))
		return
	# 没开的缸位都带「＋」，点哪个都是开紧挨着的下一个：金币或看广告
	if i < _s.open_slots or _s.open_slots >= GameState.MAX_SLOTS:
		return
	HomePopups.slot_unlock(self, _unlock_slot, Callable())


func _unlock_slot() -> void:
	Audio.sfx(&"unlock")
	_play(Rules.unlock_bowl(_s))


func _on_tool(tool: String) -> void:
	if _over:
		return
	if _net_mode:
		_net_mode = false
		return
	# 先确认现在能用、用了有效果，免得白扣一次
	var seed_value: int = Time.get_ticks_usec()
	var blocked: String = _tool_blocked(tool, seed_value)
	if blocked != "":
		Audio.sfx(&"error")
		_toast(blocked)
		return
	var ready: bool = Skills.free_available(Save.data, tool) or Skills.count(Save.data, tool) > 0
	if not ready and not await _get_tool(tool):
		return
	_hud.end_tutorial()
	_tutor = ""
	if tool == "net":
		# 渔网要先选缸，选中时才扣
		_net_mode = true
		_toast(tr("UI_NET_HINT"))
		_shelf.nudge_all(false)
		return
	if not _spend_tool(tool):
		return
	var events: Array[Dictionary] = Rules.apply(_s, {"a": tool, "seed": seed_value})
	match tool:
		"blow":
			_fx.blow(_hud.tool_pos(tool), _field.return_pos(0))
			_play(events)
		"shuffle":
			Audio.sfx(&"shuffle")
			_fx.whirl(_field_mid())
			_play(events)
			_field.spin_all()
		"current":
			# 一道水流横扫全场，鱼排着队冲进鱼缸
			_fx.current_sweep(FIELD_Y, size.y - TOOLS_H)
			_play_queued(events, GameCfg.num("current", "lead"), GameCfg.num("current", "stagger"))


## 这个技能现在不能用的原因（给玩家看的一句话）；能用返回空串
func _tool_blocked(tool: String, seed_value: int) -> String:
	if _hud.tool_locked(tool):
		return tr("UI_SKILL_LOCKED") % Skills.unlock_level(Config.eco, tool)
	if int(_tool_uses[tool]) >= int(Config.eco["toolMaxPerLevel"]):
		return tr("UI_TOOL_LIMIT")
	var idle: Dictionary = {
		"blow": "UI_BLOW_EMPTY", "current": "UI_CURRENT_EMPTY", "shuffle": "UI_SHUFFLE_EMPTY"
	}
	if idle.has(tool) and Rules.apply(_s.clone(), {"a": tool, "seed": seed_value}).is_empty():
		return tr(idle[tool])
	return ""


func _field_mid() -> Vector2:
	return Vector2(W / 2.0, (FIELD_Y + size.y - TOOLS_H) / 2.0)


## 技能用完了：金币够就买，不够就看广告拿一个
func _get_tool(tool: String) -> bool:
	if Skills.buy(Save.data, Config.eco, tool):
		Save.save()
		Audio.sfx(&"coin")
		_hud.refresh_tools()
		return true
	if not Ads.available() or not await Ads.rewarded(&"rv_tool") or not is_inside_tree():
		_toast(tr("UI_NO_COINS"))
		return false
	Skills.add(Save.data, tool)
	Save.save()
	_hud.refresh_tools()
	return true


## 扣一次技能（今天的免费次优先）。每关次数、库存都由 Skills 把关
func _spend_tool(tool: String) -> bool:
	var res: Dictionary = Skills.try_use(
		Save.data, Config.eco, tool, int(_tool_uses[tool]), Save.today()
	)
	if not res["ok"]:
		return false
	_tool_uses[tool] = int(_tool_uses[tool]) + 1
	_moved = true
	Save.save()
	_hud.refresh_tools()
	return true


## 新技能的强制教学：在解锁关第一次能用上它的时候，压暗全屏只让点这个技能
func _check_tutorial() -> void:
	if _tutor == "" or _over or _auto or _net_mode or _has_popup():
		return
	if int(_tool_uses[_tutor]) > 0:
		_tutor = ""
		return
	var cfg: Dictionary = GameCfg.d()["tutorial"]
	if _tutor == "blow" and _s.buffer.size() < int(cfg["blowMinBuffer"]):
		return
	if _tutor != "net" and Rules.apply(_s.clone(), {"a": _tutor, "seed": 1}).is_empty():
		return
	PlayerData.mark_tip(Save.data, "skill_" + _tutor)
	Save.save()
	_hud.start_tutorial(_tutor)


# ---------- 表现 ----------


## 把规则事件分派给各部件。逻辑已经结算完，这里只排演出的先后
func _play(events: Array[Dictionary]) -> void:
	if events.is_empty():
		return
	var gap: float = GameCfg.num("fly", "stagger")
	var flights: int = 0
	var freed: int = -1
	for e: Dictionary in events:
		var delay: float = flights * gap
		match e["t"]:
			&"fish_to_bowl", &"net_fish":
				var from: Vector2 = _field.source_pos(e["b"], e["k"])
				_to_bowl(e["species"], from, e["slot"], delay, 84.0)
				flights += 1
			&"buffer_to_bowl":
				var from: Vector2 = _hud.buffer_take(e["index"])
				_to_bowl(e["species"], from, e["slot"], delay, 48.0)
				flights += 1
			&"fish_to_buffer":
				var tex: Texture2D = _fish_tex(e["species"])
				_fx.fly(
					tex,
					_field.fish_pos(e["b"], e["k"]),
					_hud.buffer_pos(e["index"]),
					delay,
					_hud.buffer_land.bind(_hud.buffer_add(tex)),
					84.0,
					GameCfg.num("fly", "bufferSeconds")
				)
				_combo.miss()
				flights += 1
			&"bubble_pop":
				_field.pop(e["b"])
				freed = e["b"]
			&"bubble_drop":
				_field.drop_in(e["b"], freed)
			&"bowl_done":
				_shelf.done(e["slot"])
			&"bowl_in":
				_shelf.incoming(e["slot"], e["order"], e["species"], e["cap"])
			&"slot_open":
				_shelf.open_slot(e["slot"])
			&"blow":
				_hud.buffer_clear()
			&"chain_open":
				_field.shed("res://assets/ui/lock.png", e["b"])
				Audio.sfx(&"unlock")
			&"ice_melt":
				_field.shed("res://assets/ui/ice.png", e["b"])
			&"win":
				_over = true
				# 等最后一缸演完，再停半拍
				var wait: float = maxf(_shelf.busy_for(), delay + GameCfg.travel()) + 0.3
				get_tree().create_timer(wait).timeout.connect(_celebrate)
			&"lose":
				_over = true
				get_tree().create_timer(0.7).timeout.connect(_show_lose.bind(e["reason"]))
	_field.refresh(_s)
	_auto_finish()
	_check_tutorial()


## 洋流：逻辑一次结算完，画面上一条一条排队走。每条鱼（连同它引发的满缸、破泡、补落）
## 是一段，隔 gap 秒播一段；没轮到的鱼先留在气泡里，没轮到落的气泡先不出现
func _play_queued(events: Array[Dictionary], lead: float, gap: float) -> void:
	var groups: Array = []
	for e: Dictionary in events:
		if e["t"] == &"fish_to_bowl" or groups.is_empty():
			var fresh: Array[Dictionary] = []
			groups.append(fresh)
		(groups[-1] as Array[Dictionary]).append(e)
		if e["t"] == &"fish_to_bowl":
			_field.hold(e["b"], e["k"], e["species"])
		elif e["t"] == &"bubble_drop":
			_field.defer(e["b"])
	_field.refresh(_s)
	for i: int in groups.size():
		get_tree().create_timer(lead + i * gap).timeout.connect(_play_group.bind(groups[i], _run))


func _play_group(events: Array[Dictionary], run: int) -> void:
	if run != _run or not is_inside_tree():
		return
	if events[0]["t"] == &"fish_to_bowl":
		_field.release(events[0]["b"], events[0]["k"])
	_play(events)


## 一条鱼飞向第 slot 个缸，并记一次连击命中（点击、渔网、洋流、暂存槽自动补进新缸都算）。
## 新缸还没落到位时，鱼在原地多等一会儿再出发
func _to_bowl(species: int, from: Vector2, slot: int, delay: float, side: float) -> void:
	var wait: float = maxf(delay, _shelf.wait_for(slot) - GameCfg.travel())
	var order: int = _shelf.send(slot, wait + GameCfg.travel())
	_fx.fly(_fish_tex(species), from, _shelf.target(slot), wait, _on_bowl_hit.bind(order), side)
	if delay <= 0.0:
		_combo_hit(from, _run)
	else:
		get_tree().create_timer(delay).timeout.connect(_combo_hit.bind(from, _run))


func _on_bowl_hit(order: int) -> void:
	if _shelf.arrive(order):
		var rescued: int = _total_fish - _s.fish_left()
		_hud.set_rescued(mini(_hud.rescued_shown() + 1, rescued), true)


func _toast(text: String) -> void:
	_fx.toast(text, FIELD_Y - 4)


## 场上只剩一种鱼时不用玩家再点：气泡依次自己破掉，鱼自己入缸
func _auto_finish() -> void:
	if _over or _auto or _s.status != GameState.Status.PLAYING:
		return
	var kinds: Dictionary = {}
	for bub: GameState.Bubble in _s.bubbles:
		for f: int in bub.fish:
			if f >= 0:
				kinds[f] = true
	if kinds.size() != 1:
		return
	_auto = true
	get_tree().create_timer(0.45).timeout.connect(_auto_step)


func _auto_step() -> void:
	if _over or not is_inside_tree() or _s.status != GameState.Status.PLAYING:
		_auto = false
		return
	for b: int in Rules.open_bubbles(_s):
		for k: int in _s.bubbles[b].fish.size():
			if _s.bubbles[b].fish[k] >= 0:
				_tap(b, k)
				get_tree().create_timer(0.2).timeout.connect(_auto_step)
				return
	# 剩下的都被锁着或压着，交还给玩家
	_auto = false


# ---------- 弹窗、生命、胜负（弹窗统一用 HomePopups / MetaPopups / PopupCard）----------


## 有弹窗开着：倒计时暂停，教学和提示也先不出
func _has_popup() -> bool:
	for c: Node in get_children():
		if c is PopupCard:
			return true
	return false


## 暂停：音乐、音效、震动、语言，加「回主页」「重试」
func _show_settings() -> void:
	MetaPopups.settings(self, "pause", _ask_leave.bind(_go_home), _ask_leave.bind(_retry), _build)


## 中途退出或重开：走过步、且不在免扣命的前几关，才先问一句（会扣 1 条生命）
func _ask_leave(then: Callable) -> void:
	if _costs_life():
		# 弹窗里点「离开」时已经扣了命
		HomePopups.leave_confirm(self, then)
	else:
		then.call()


## 现在放弃这一关会不会扣命
func _costs_life() -> bool:
	return (
		_moved
		and not _won
		and _level_id > int(Config.eco["lives"]["freeUntilLevel"])
		and not Lives.is_unlimited(Save.data, Save.now())
	)


func _go_home() -> void:
	Ads.banner(false)
	_save_best()
	if App.inst != null:
		App.inst.go_home()


func _retry() -> void:
	_save_best()
	_enter(_level_id)


## 历史最高连击（个人资料里显示），每关结束时记一次
func _save_best() -> void:
	if _combo.best > int(Save.data.get("bestCombo", 0)):
		Save.data["bestCombo"] = _combo.best
		Save.save()


## 开始第 id 关；没命了就弹生命弹窗（买到命后玩家再点一次）。返回是否开始了
func _enter(id: int) -> bool:
	if Lives.can_start(Save.data, Config.eco, id, Save.now()):
		start_level(id)
		return true
	HomePopups.lives(self)
	return false


## 过关演出，播完再弹结算
func _celebrate() -> void:
	Anim.shake(_stage, 16.0)
	_shelf.nudge_all(true)
	_hud.set_rescued(_total_fish, false)
	WinFx.play(self, _stage.position + _hud.top_anchor())
	get_tree().create_timer(GameCfg.num("win", "celebrate")).timeout.connect(_show_win)


## 结算：金币、进度、首胜都由 Settle 一次算完并入账；宝箱由 LevelChest 开
func _show_win() -> void:
	_won = true
	_save_best()
	var result: Dictionary = (
		Settle
		. win(
			Save.data,
			Config.eco,
			{
				"level": _level_id,
				"challenge": _lv.challenge,
				"day": Save.today(),
				"now": Save.now(),
				"combo_coins": _combo.coins,
				"best_combo": _combo.best,
			}
		)
	)
	var chest: Dictionary = {}
	if result["chest_ok"]:
		chest = LevelChest.open(
			Save.data,
			Config.eco,
			Config.species,
			_level_id,
			_lv.challenge,
			Rng.new(Time.get_ticks_usec())
		)
	Save.save()
	var info: Dictionary = {
		"result": result,
		"chest": chest,
		"combo_card": _combo_card,
		"best": _combo.best,
		"level": _level_id,
		"challenge": _lv.challenge,
	}
	# 奖励、宝箱、按钮都在同一个结算页里，不分几次弹
	WinPanel.open(self, info, _on_next, _go_home)
	Ads.banner(true)


func _on_next() -> void:
	Ads.banner(false)
	await Ads.interstitial_after_level(_level_id)
	if is_inside_tree():
		_enter(int(Save.data["level"]))


## 失败：先给复活的机会（每关一次，看广告）；放弃复活才算失败
func _show_lose(reason: int) -> void:
	Audio.sfx(&"lose")
	Anim.shake(_stage, 14.0)
	_hud.end_tutorial()
	Ads.banner(true)
	if not _s.revived and Ads.available():
		HomePopups.revive(self, _on_revive, _fail.bind(reason))
	else:
		_fail(reason)


## 真的失败了：记一次失败（连败会降难度）、扣命，然后选重试还是回主页
func _fail(reason: int) -> void:
	Meta.fail_level(Save.data, Config.eco, _level_id)
	Lives.lose(Save.data, Config.eco, _level_id, _moved, Save.now())
	_moved = false
	Save.save()
	var why: Dictionary = {
		GameState.LoseReason.BUFFER_FULL: "UI_LOSE_BUFFER",
		GameState.LoseReason.TIMEOUT: "UI_LOSE_TIMEOUT",
		GameState.LoseReason.STUCK: "UI_LOSE_STUCK",
	}
	var lines: Array[String] = [tr(why[reason])]
	var p := PopupCard.open(
		self,
		tr("UI_LOSE"),
		lines,
		[[tr("H_TO_HOME"), UiKit.BLUE, _go_home], [tr("H_RETRY"), UiKit.GREEN, Callable()]],
		0.0,
		{"closable": false}
	)
	# 重试成功才关掉失败弹窗；没命时生命弹窗盖在它上面
	p.buttons[1].pressed.connect(
		func() -> void:
			if _retry_from_fail():
				p.close()
	)


func _retry_from_fail() -> bool:
	_save_best()
	return _enter(_level_id)


## 看完复活广告后
func _on_revive() -> void:
	if not is_inside_tree():
		return
	Ads.banner(false)
	_over = false
	Audio.sfx(&"unlock")
	_play(Rules.revive(_s))
