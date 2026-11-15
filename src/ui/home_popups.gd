class_name HomePopups
extends RefCounted
## 所有走统一弹窗（PopupCard）的界面：生命、离开确认、开缸位、复活、功能解锁、
## 金币不足、设置/暂停、签到、个人资料、概率表、开奖。
## 数据全部来自 HomeModel；host 是弹窗挂靠的界面，on_change 在数据变化后调用（刷新顶栏）。

const LINE_H := 46.0


static func _t(key: String) -> String:
	return TranslationServer.translate(key)


static func _fmt_time(secs: int) -> String:
	return "%d:%02d" % [secs / 60, secs % 60]


## 把「看广告」按钮点击后的完整流程收口：看完才回调
static func _watch(placement: StringName, then: Callable) -> void:
	if await Ads.rewarded(placement):
		then.call()


static func _row(parent: Control, y: float, h: float) -> Patch:
	var row := UiKit.piece("popup_row")
	row.position = Vector2(PopupCard.SIDE, y)
	row.size = Vector2(PopupCard.CARD_W - PopupCard.SIDE * 2.0, h)
	parent.add_child(row)
	return row


static func _centered(parent: Control, node: Control, y: float) -> void:
	node.position = Vector2((PopupCard.CARD_W - node.size.x) / 2.0, y)
	parent.add_child(node)


# ---------- 生命 ----------


static func lives(host: Control, on_change: Callable = Callable()) -> PopupCard:
	var m := HomeModel.get_inst()
	var buttons: Array = []
	var full: bool = m.lives() >= m.max_lives()
	if full:
		buttons.append([_t("UI_CONFIRM"), UiKit.GREEN, Callable()])
	else:
		var short: bool = not m.can_afford(m.price("refill"))
		buttons.append([_t("H_BUY_ONE"), UiKit.BLUE, null, {"coin": m.price("life")}])
		if short and Ads.available():
			buttons.append(
				[_t("H_WATCH_COINS") % m.free_coin_amount(), UiKit.PURPLE, null, {"ad": true}]
			)
		else:
			buttons.append([_t("H_REFILL"), UiKit.GREEN, null, {"coin": m.price("refill")}])
	var empty: Array[String] = []
	var p := PopupCard.open(host, _t("H_LIVES_TITLE"), empty, buttons, 214.0)
	# 按钮回调要能关闭自己，开好以后再接线
	var bs: Array = _wire(p, buttons.size())
	if full:
		(bs[0] as Button).pressed.connect(p.close)
	else:
		(bs[0] as Button).pressed.connect(_do_buy_life.bind(p, host, on_change, false))
		if bs.size() > 1:
			if m.can_afford(m.price("refill")) or not Ads.available():
				(bs[1] as Button).pressed.connect(_do_buy_life.bind(p, host, on_change, true))
				(bs[1] as Button).disabled = not m.can_afford(m.price("refill"))
			else:
				(bs[1] as Button).pressed.connect(
					_watch.bind(&"rv_free_coin", _after_ad_coins.bind(p, host, on_change))
				)
		(bs[0] as Button).disabled = not m.can_afford(m.price("life"))
	_lives_body(p, host, on_change)
	return p


## 弹窗里按顺序（左 → 右）取回按钮
static func _wire(p: PopupCard, count: int) -> Array:
	return p.buttons.slice(0, count)


static func _lives_body(p: PopupCard, host: Control, on_change: Callable) -> void:
	var m := HomeModel.get_inst()
	var y: float = p.content_y
	var inf: bool = m.infinite_secs() > 0
	var count_box := Control.new()
	count_box.size = Vector2(PopupCard.CARD_W, 64)
	count_box.position = Vector2(0, y)
	p.card.add_child(count_box)
	if inf:
		var heart := UiKit.icon("res://assets/kit/heart.png", 64)
		heart.position = Vector2(PopupCard.CARD_W / 2.0 - 100.0, 0)
		count_box.add_child(heart)
		var sign := UiKit.label("∞", 60, UiKit.GOLD)
		sign.position = Vector2(PopupCard.CARD_W / 2.0 - 20.0, -4)
		sign.size = Vector2(120, 68)
		count_box.add_child(sign)
		Anim.wiggle(heart, 6.0, 1.4)
	else:
		var gap: float = 66.0
		var x0: float = (PopupCard.CARD_W - gap * m.max_lives()) / 2.0 + 5.0
		for i: int in m.max_lives():
			var heart := UiKit.icon("res://assets/kit/heart.png", 60)
			heart.position = Vector2(x0 + i * gap, 2)
			if i >= m.lives():
				heart.modulate = Color(0.28, 0.4, 0.62)
			count_box.add_child(heart)
			Anim.pop_in(heart, 0.04 * i, 0.25)
	var timer_text := UiKit.text("", 32, UiKit.GOLD)
	timer_text.position = Vector2(0, y + 72)
	timer_text.size = Vector2(PopupCard.CARD_W, LINE_H)
	p.card.add_child(timer_text)
	_bind_timer(timer_text)
	# 分享得 1 条：一整行可点，不算按钮
	var row := _row(p.card, y + 130.0, 76.0)
	var left: int = m.share_lives_left()
	var share_icon := UiKit.icon("res://assets/kit/ic_share.png", 56)
	share_icon.position = Vector2(14, 10)
	row.add_child(share_icon)
	var cap := UiKit.text(_t("H_SHARE_LIFE"), 28, Color.WHITE)
	cap.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	cap.position = Vector2(84, 0)
	cap.size = Vector2(340, 76)
	row.add_child(cap)
	var cnt := UiKit.text("%d/%d" % [left, int(m.cfg["lives"]["share_daily"])], 28, UiKit.GOLD)
	cnt.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	cnt.position = Vector2(row.size.x - 110.0, 0)
	cnt.size = Vector2(90, 76)
	row.add_child(cnt)
	var active: bool = left > 0 and m.lives() < m.max_lives()
	if not active:
		row.modulate = Color(1, 1, 1, 0.5)
	else:
		var hot := UiKit.hotspot(Vector2.ZERO, row.size)
		hot.pressed.connect(_do_share_life.bind(p, host, on_change))
		Anim.press_fx(hot)
		row.add_child(hot)


static func _bind_timer(label: Label) -> void:
	var update := func() -> void:
		var m := HomeModel.get_inst()
		if m.infinite_secs() > 0:
			label.text = _t("H_INF_LEFT") % _fmt_time(m.infinite_secs())
		elif m.next_life_secs() > 0:
			label.text = _t("H_NEXT_LIFE") % _fmt_time(m.next_life_secs())
		else:
			label.text = _t("H_LIVES_FULL")
	update.call()
	var tw: Tween = label.create_tween().set_loops()
	tw.tween_interval(1.0)
	tw.tween_callback(update)


static func _do_buy_life(p: PopupCard, host: Control, on_change: Callable, refill: bool) -> void:
	var m := HomeModel.get_inst()
	var ok: bool = m.refill_lives() if refill else m.buy_life()
	if not ok:
		Audio.sfx(&"error")
		return
	Audio.sfx(&"coin")
	_changed(on_change)
	p.close()
	_reopen_later(host, lives.bind(host, on_change))


static func _do_share_life(p: PopupCard, host: Control, on_change: Callable) -> void:
	if HomeModel.get_inst().share_life():
		Audio.sfx(&"coin")
		_changed(on_change)
		p.close()
		_reopen_later(host, lives.bind(host, on_change))


static func _after_ad_coins(p: PopupCard, host: Control, on_change: Callable) -> void:
	HomeModel.get_inst().claim_free_coins()
	Audio.sfx(&"coins")
	_changed(on_change)
	if is_instance_valid(p):
		p.close()
	if is_instance_valid(host):
		_reopen_later(host, lives.bind(host, on_change))


static func _changed(on_change: Callable) -> void:
	if on_change.is_valid():
		on_change.call()


static func _reopen_later(host: Control, make: Callable) -> void:
	if not is_instance_valid(host) or not host.is_inside_tree():
		return
	host.get_tree().create_timer(0.16).timeout.connect(
		func() -> void:
			if is_instance_valid(host):
				make.call()
	)


# ---------- 离开确认 ----------


## 已经走过步时点回主页或重试：主按钮继续玩，次按钮离开
static func leave_confirm(host: Control, on_leave: Callable) -> PopupCard:
	var lines: Array[String] = [_t("H_LEAVE_LINE")]
	var p := (
		PopupCard
		. open(
			host,
			_t("H_LEAVE_TITLE"),
			lines,
			[
				[_t("H_LEAVE"), UiKit.BLUE, Callable()],
				[_t("H_KEEP_PLAYING"), UiKit.GREEN, Callable()],
			],
			130.0
		)
	)
	var heart := UiKit.icon("res://assets/kit/heart.png", 96)
	_centered(p.card, heart, p.content_y + 6.0)
	var minus := UiKit.label("−1", 40, UiKit.GOLD)
	minus.size = Vector2(80, 50)
	minus.position = Vector2(PopupCard.CARD_W / 2.0 + 56.0, p.content_y + 20.0)
	p.card.add_child(minus)
	var bs: Array = _wire(p, 2)
	(bs[0] as Button).pressed.connect(
		func() -> void:
			HomeModel.get_inst().lose_life()
			p.close()
			if on_leave.is_valid():
				on_leave.call()
	)
	(bs[1] as Button).pressed.connect(p.close)
	return p


# ---------- 开缸位 ----------


static func slot_unlock(host: Control, on_open: Callable, on_change: Callable) -> PopupCard:
	var m := HomeModel.get_inst()
	var lines: Array[String] = [_t("H_SLOT_LINE")]
	var buttons: Array = [[_t("H_SLOT_BUY"), UiKit.BLUE, Callable(), {"coin": m.price("slot")}]]
	if Ads.available():
		buttons.append([_t("H_WATCH_AD"), UiKit.PURPLE, Callable(), {"ad": true}])
	var p := PopupCard.open(host, _t("H_SLOT_TITLE"), lines, buttons, 130.0)
	var tank := UiKit.icon("res://assets/ui/tank.png", 120)
	_centered(p.card, tank, p.content_y + 2.0)
	var plus := UiKit.badge("plus", 48)
	plus.position = Vector2(PopupCard.CARD_W / 2.0 + 30.0, p.content_y + 6.0)
	p.card.add_child(plus)
	Anim.pulse(plus, 1.15, 1.0)
	var bs: Array = _wire(p, buttons.size())
	(bs[0] as Button).disabled = not m.can_afford(m.price("slot"))
	(bs[0] as Button).pressed.connect(
		func() -> void:
			if m.buy_slot():
				Audio.sfx(&"coin")
				_changed(on_change)
				p.close()
				if on_open.is_valid():
					on_open.call()
	)
	if bs.size() > 1:
		var ad_done := func() -> void:
			if is_instance_valid(p):
				p.close()
			if on_open.is_valid():
				on_open.call()
		(bs[1] as Button).pressed.connect(_watch.bind(&"rv_bowl_slot", ad_done))
	return p


# ---------- 复活 ----------


static func revive(host: Control, on_revive: Callable, on_give_up: Callable) -> PopupCard:
	var lines: Array[String] = [_t("H_REVIVE_LINE")]
	var buttons: Array = [[_t("H_GIVE_UP"), UiKit.BLUE, Callable()]]
	buttons.append([_t("H_REVIVE_AD"), UiKit.PURPLE, Callable(), {"ad": true}])
	var p := PopupCard.open(host, _t("H_REVIVE_TITLE"), lines, buttons, 130.0, {"closable": false})
	var bubble := UiKit.icon("res://assets/ui/bubble.png", 130)
	_centered(p.card, bubble, p.content_y + 0.0)
	var fish := UiKit.icon("res://assets/fish/c04.png", 80)
	fish.position = Vector2(25, 25)
	bubble.add_child(fish)
	Anim.wiggle(fish, 8.0, 1.2)
	Anim.bob(bubble, 6.0, 2.0)
	var bs: Array = _wire(p, 2)
	(bs[0] as Button).pressed.connect(
		func() -> void:
			p.close()
			if on_give_up.is_valid():
				on_give_up.call()
	)
	var ad_done := func() -> void:
		if is_instance_valid(p):
			p.close()
		if on_revive.is_valid():
			on_revive.call()
	(bs[1] as Button).pressed.connect(_watch.bind(&"rv_revive", ad_done))
	return p


# ---------- 功能解锁 ----------


## feature 是 config/ui_home.json 里 unlocks 的键
static func feature_unlocked(host: Control, feature: String, on_go: Callable) -> PopupCard:
	var m := HomeModel.get_inst()
	var name: String = feature_name(feature)
	var lines: Array[String] = [_t("H_UNLOCK_LINE") % name]
	var p := PopupCard.open(
		host, _t("H_UNLOCK_TITLE"), lines, [[_t("H_GO_LOOK"), UiKit.GREEN, Callable()]], 150.0
	)
	var glow := UiKit.icon("res://assets/kit/fx_glow.png", 190)
	glow.modulate = Color(UiKit.GOLD, 0.55)
	_centered(p.card, glow, p.content_y - 36.0)
	var icon := UiKit.icon(feature_icon(feature), 104)
	_centered(p.card, icon, p.content_y + 6.0)
	Anim.bounce(icon, 1.3, 0.4)
	Anim.wiggle(icon, 4.0, 1.4)
	var tag := UiKit.text(_t("H_UNLOCKS_AT") % m.unlock_level(feature), 24, UiKit.GOLD)
	tag.size = Vector2(PopupCard.CARD_W, 30)
	tag.position = Vector2(0, p.content_y + 116.0)
	p.card.add_child(tag)
	Audio.sfx(&"unlock")
	var bs: Array = _wire(p, 1)
	(bs[0] as Button).pressed.connect(
		func() -> void:
			p.close()
			if on_go.is_valid():
				on_go.call()
	)
	return p


static func feature_name(feature: String) -> String:
	if feature.begins_with("skill_"):
		return _t("H_FEAT_SKILL") + " · " + _t("H_SKILL_" + feature.substr(6).to_upper())
	return _t("H_FEAT_" + feature.to_upper())


static func feature_icon(feature: String) -> String:
	match feature:
		"signin":
			return "res://assets/ui/gift.png"
		"levels":
			return "res://assets/kit/ic_route.png"
		"collection":
			return "res://assets/ui/tank.png"
		"wheel":
			return "res://assets/kit/ic_wheel.png"
		"rank":
			return "res://assets/ui/tab_rank.png"
		"shop":
			return "res://assets/ui/tab_shop.png"
	var id: String = feature.substr(6)
	return "res://assets/ui/tool_%s.png" % ("blow" if id == "flow" else id)


# ---------- 金币不足 ----------


static func coin_shortage(host: Control, need: int, on_change: Callable) -> PopupCard:
	var m := HomeModel.get_inst()
	var lines: Array[String] = [_t("H_NEED_COINS_LINE") % maxi(0, need - m.coins())]
	var buttons: Array = []
	if Ads.available():
		buttons.append(
			[_t("H_WATCH_COINS") % m.free_coin_amount(), UiKit.PURPLE, Callable(), {"ad": true}]
		)
	else:
		buttons.append([_t("UI_CONFIRM"), UiKit.GREEN, Callable()])
	var p := PopupCard.open(host, _t("H_NEED_COINS"), lines, buttons, 100.0)
	var coin := UiKit.icon("res://assets/ui/coin.png", 90)
	_centered(p.card, coin, p.content_y + 2.0)
	coin.modulate = Color(0.8, 0.85, 0.95)
	Anim.wiggle(coin, 6.0, 1.0)
	var bs: Array = _wire(p, 1)
	if Ads.available():
		var ad_done := func() -> void:
			m.claim_free_coins()
			Audio.sfx(&"coins")
			_changed(on_change)
			if is_instance_valid(p):
				p.close()
		(bs[0] as Button).pressed.connect(_watch.bind(&"rv_free_coin", ad_done))
	else:
		(bs[0] as Button).pressed.connect(p.close)
	return p
