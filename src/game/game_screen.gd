class_name GameScreen
extends Control
## 局内界面。规则全部交给 Rules；这里只负责转发输入，并把规则事件分派给各个部件去演：
## GameHud（顶部、暂存槽、技能键）、GameShelf（鱼缸和订单卡）、GameField（气泡场）、GameFx（特效）。

const W := 750.0
const FIELD_Y := 396.0
const TOOLS_H := GameHud.TOOLS_H
const LEVEL_COUNT := 120
## 已有美术的鱼种；关卡里的鱼种槽位映射到它们
const FISH_ART: Array[String] = [
	"c01", "c04", "c05", "c09", "c13", "c15", "c16", "c19", "c21", "c23", "c27", "c29"
]

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
var _popup: PopupCard
## 连击：短时间内连续把鱼送进缸
var _combo: Combo = Combo.new()
## 这一串连击累计拿到的金币（显示在连击数字下面）
var _streak_coins: int = 0
## 本关连击送的图鉴卡（Meta.draw_card 的返回值），没有则为空
var _combo_card: Dictionary = {}
var _combo_hud: ComboHud
## 只剩一种鱼时由游戏自己收尾，期间不接受点击
var _auto: bool = false
## 提示光圈：玩家一段时间没操作时指出一条能进缸的鱼
var _hint: Control
var _idle: float = 0.0


func _ready() -> void:
	resized.connect(_build)
	start_level(int(Save.data["level"]))


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
	var ids: Array[String] = FISH_ART.duplicate()
	Rng.new(_lv.level_seed).shuffle(ids)
	_species = ids.slice(0, _lv.palette)
	_tool_uses = {"net": 0, "blow": 0, "shuffle": 0}
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
	var tip: String = (Config.eco["mechanicIntro"] as Dictionary).get(str(id), "")
	if tip != "":
		get_tree().create_timer(0.9).timeout.connect(_toast.bind(tr(tip)))


func _process(delta: float) -> void:
	if _s == null or _over or _popup != null:
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
	_popup = null
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
	_count_combo(events, from)
	_play(events)


## 连击：规则和奖励在 Combo 里算，这里只管演出
func _count_combo(events: Array[Dictionary], from: Vector2) -> void:
	if events[0]["t"] != &"fish_to_bowl":
		_combo.miss()
		return
	var cfg: Dictionary = Config.eco["combo"]
	var rng := Rng.new(Time.get_ticks_usec())
	var res: Dictionary = _combo.hit(Time.get_ticks_msec() / 1000.0, cfg, rng)
	if int(res["count"]) <= 1:
		_streak_coins = 0
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
		Save.data["coins"] = int(Save.data["coins"]) + gain
		_fx.gain("+%d" % gain, from)
	if res["card"]:
		_combo_card = Meta.draw_card(Save.data, Config.eco, Config.species, "levelCard", rng)
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
			_spend_tool("net")
			_fx.net_swing(_hud.tool_pos("net"), _shelf.pos(i))
			_play(Rules.use_net(_s, i))
		return
	# 没开的缸位都带「＋」，点哪个都是开紧挨着的下一个
	if i < _s.open_slots or _s.open_slots >= GameState.MAX_SLOTS:
		return
	if Ads.available():
		if await Ads.rewarded(&"rv_bowl_slot") and is_inside_tree():
			_unlock_slot()
		return
	# 广告不可用时改用金币
	var price: int = int(Config.eco["bowlSlotCoinPrice"])
	_popup = (
		PopupCard
		. open(
			self,
			tr("UI_AD_UNAVAILABLE"),
			[tr("UI_SLOT_COIN") % price],
			[
				[tr("UI_CONFIRM"), UiKit.GREEN, _pay_slot.bind(price)],
				[tr("UI_CLOSE"), UiKit.ORANGE, _close_popup],
			]
		)
	)


func _pay_slot(price: int) -> void:
	_close_popup()
	if int(Save.data["coins"]) < price:
		_toast(tr("UI_NO_COINS"))
		return
	Save.data["coins"] = int(Save.data["coins"]) - price
	Save.save()
	_unlock_slot()


func _unlock_slot() -> void:
	Audio.sfx(&"unlock")
	_play(Rules.unlock_bowl(_s))


func _on_tool(tool: String) -> void:
	if _over or _net_mode:
		_net_mode = false
		return
	if _hud.tool_locked(tool):
		Audio.sfx(&"error")
		_toast(tr("UI_SKILL_LOCKED") % GameCfg.unlock_level(tool))
		return
	if int(_tool_uses[tool]) >= int(Config.eco["toolMaxPerLevel"]):
		_toast(tr("UI_TOOL_LIMIT"))
		return
	if int(Save.data["tools"][tool]) <= 0 and not await _get_tool(tool):
		return
	match tool:
		"net":
			_net_mode = true
			_toast(tr("UI_NET_HINT"))
			_shelf.nudge_all(false)
		"blow":
			var events: Array[Dictionary] = Rules.use_blow(_s)
			if not events.is_empty():
				_spend_tool(tool)
				_fx.blow(_hud.tool_pos(tool), _field.return_pos(0))
				_play(events)
		"shuffle":
			var events: Array[Dictionary] = Rules.use_shuffle(_s, Time.get_ticks_usec())
			if not events.is_empty():
				_spend_tool(tool)
				Audio.sfx(&"shuffle")
				_fx.whirl(Vector2(W / 2.0, (FIELD_Y + size.y - TOOLS_H) / 2.0))
				_play(events)
				_field.spin_all()


## 道具用完了：金币够就买，不够就看广告拿一个
func _get_tool(tool: String) -> bool:
	if Meta.buy_tool(Save.data, Config.eco, tool):
		Save.save()
		Audio.sfx(&"coin")
		_hud.refresh_tools()
		return true
	if not Ads.available() or not await Ads.rewarded(&"rv_tool") or not is_inside_tree():
		_toast(tr("UI_NO_COINS"))
		return false
	Save.data["tools"][tool] = int(Save.data["tools"][tool]) + 1
	_hud.refresh_tools()
	return true


func _spend_tool(tool: String) -> void:
	Save.data["tools"][tool] = int(Save.data["tools"][tool]) - 1
	_tool_uses[tool] = int(_tool_uses[tool]) + 1
	Save.save()
	_hud.refresh_tools()


# ---------- 表现 ----------


## 把规则事件分派给各部件。逻辑已经结算完，这里只排演出的先后
func _play(events: Array[Dictionary]) -> void:
	if events.is_empty():
		return
	var gap: float = GameCfg.num("fly", "stagger")
	var flights: int = 0
	var freed: int = -1
	for e: Dictionary in events:
		match e["t"]:
			&"fish_to_bowl", &"net_fish":
				var from: Vector2 = _field.source_pos(e["b"], e["k"])
				_to_bowl(e["species"], from, e["slot"], flights * gap, 84.0)
				flights += 1
			&"buffer_to_bowl":
				var from: Vector2 = _hud.buffer_take(e["index"])
				_to_bowl(e["species"], from, e["slot"], flights * gap, 48.0)
				flights += 1
			&"fish_to_buffer":
				var tex: Texture2D = _fish_tex(e["species"])
				_fx.fly(
					tex,
					_field.fish_pos(e["b"], e["k"]),
					_hud.buffer_pos(e["index"]),
					flights * gap,
					_hud.buffer_land.bind(_hud.buffer_add(tex)),
					84.0,
					GameCfg.num("fly", "bufferSeconds")
				)
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
				var wait: float = maxf(_shelf.busy_for(), GameCfg.travel()) + 0.3
				get_tree().create_timer(wait).timeout.connect(_celebrate)
			&"lose":
				_over = true
				get_tree().create_timer(0.7).timeout.connect(_show_lose.bind(e["reason"]))
	_field.refresh(_s)
	_auto_finish()


## 一条鱼飞向第 slot 个缸。新缸还没落到位时，鱼在原地多等一会儿再出发
func _to_bowl(species: int, from: Vector2, slot: int, delay: float, side: float) -> void:
	var wait: float = maxf(delay, _shelf.wait_for(slot) - GameCfg.travel())
	var order: int = _shelf.send(slot, wait + GameCfg.travel())
	_fx.fly(_fish_tex(species), from, _shelf.target(slot), wait, _on_bowl_hit.bind(order), side)


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


# ---------- 弹窗 ----------


func _close_popup() -> void:
	if _popup != null:
		_popup.close()
		_popup = null
	Ads.banner(false)


func _open_popup(title: String, lines: Array[String], buttons: Array) -> void:
	if _popup != null:
		_popup.queue_free()
	_popup = PopupCard.open(self, title, lines, buttons)


func _show_settings() -> void:
	var music: bool = Save.data["settings"]["music"]
	var sound: bool = Save.data["settings"]["sound"]
	_open_popup(
		tr("UI_SETTINGS"),
		[],
		[
			[tr("UI_MUSIC_ON" if music else "UI_MUSIC_OFF"), UiKit.BLUE, _toggle_music],
			[tr("UI_SOUND_ON" if sound else "UI_SOUND_OFF"), UiKit.BLUE, _toggle_sound],
			[tr("UI_RESTART"), UiKit.ORANGE, start_level.bind(_level_id)],
			[tr("UI_HOME"), UiKit.PURPLE, _go_home],
			[tr("UI_CLOSE"), UiKit.GREEN, _close_popup],
		]
	)


func _toggle_music() -> void:
	Audio.set_music(not bool(Save.data["settings"]["music"]))
	_show_settings()


func _toggle_sound() -> void:
	Audio.set_sound(not bool(Save.data["settings"]["sound"]))
	_show_settings()


func _go_home() -> void:
	Ads.banner(false)
	if App.inst != null:
		App.inst.go_home()


## 过关演出，播完再弹结算
func _celebrate() -> void:
	Anim.shake(_stage, 16.0)
	_shelf.nudge_all(true)
	_hud.set_rescued(_total_fish, false)
	WinFx.play(self, _stage.position + _hud.top_anchor())
	get_tree().create_timer(1.15).timeout.connect(_show_win)


func _show_win() -> void:
	var reward: Dictionary = Meta.finish_level(
		Save.data, Config.eco, _level_id, _lv.challenge, Save.today()
	)
	reward["combo_coins"] = _combo.coins
	reward["best"] = _combo.best
	reward["best_bonus"] = _combo.best_bonus(Config.eco["combo"])
	Save.data["coins"] = int(Save.data["coins"]) + int(reward["best_bonus"])
	var card: Dictionary = Meta.draw_card(
		Save.data, Config.eco, Config.species, "levelCard", Rng.new(Time.get_ticks_usec())
	)
	Save.save()
	var cards: Array[Dictionary] = [card]
	if not _combo_card.is_empty():
		cards.append(_combo_card)
	# 图鉴、奖励、按钮都在同一个结算页里，不再分几次弹
	WinPanel.open(self, reward, cards, _on_next, _go_home, _hud.refresh_tools)
	Ads.banner(true)


func _on_next() -> void:
	Ads.banner(false)
	await Ads.interstitial_after_level(_level_id)
	if is_inside_tree():
		start_level(int(Save.data["level"]))


func _show_lose(reason: int) -> void:
	Audio.sfx(&"lose")
	Anim.shake(_stage, 14.0)
	Meta.fail_level(Save.data, Config.eco, _level_id)
	Save.save()
	var why: Dictionary = {
		GameState.LoseReason.BUFFER_FULL: "UI_LOSE_BUFFER",
		GameState.LoseReason.TIMEOUT: "UI_LOSE_TIMEOUT",
		GameState.LoseReason.STUCK: "UI_LOSE_STUCK",
	}
	var lines: Array[String] = [tr(why[reason])]
	var buttons: Array = []
	if not _s.revived and Ads.available():
		buttons.append([tr("UI_REVIVE"), UiKit.PURPLE, _on_revive])
	buttons.append([tr("UI_RETRY"), UiKit.ORANGE, func() -> void: start_level(_level_id)])
	buttons.append([tr("UI_HOME"), UiKit.BLUE, _go_home])
	_open_popup(tr("UI_LOSE"), lines, buttons)
	Ads.banner(true)


func _on_revive() -> void:
	if not await Ads.rewarded(&"rv_revive") or not is_inside_tree():
		return
	_close_popup()
	_over = false
	Audio.sfx(&"unlock")
	_play(Rules.revive(_s))
