class_name MetaPopups
extends RefCounted
## 统一弹窗里的局外内容：设置/暂停、七日签到、个人资料、概率表、开奖。
## 数据来自 HomeModel；host 是弹窗挂靠的界面。

const ROW_H := 64.0
const GAP := 12.0


static func _t(key: String) -> String:
	return TranslationServer.translate(key)


static func _changed(on_change: Callable) -> void:
	if on_change.is_valid():
		on_change.call()


static func _label_left(
	text: String, size: int, color: Color, pos: Vector2, area: Vector2
) -> Label:
	var l := UiKit.text(text, size, color)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	l.position = pos
	l.size = area
	return l


# ---------- 设置 / 暂停 ----------


## 开关：深色轨道 + 绿色填充 + 白色旋钮。返回的节点用 set_switch 切换
static func _make_switch(on: bool) -> Control:
	var box := Control.new()
	box.size = Vector2(120, 58)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var track := UiKit.piece("track")
	OceanPopupSkin.paint(track, "switch_off")
	track.size = box.size
	box.add_child(track)
	var fill := UiKit.piece("fill")
	OceanPopupSkin.paint(fill, "switch_on")
	fill.size = box.size
	box.add_child(fill)
	var knob := UiKit.piece("seg_on")
	OceanPopupSkin.paint(knob, "knob")
	knob.size = Vector2(48, 48)
	box.add_child(knob)
	box.set_meta("fill", fill)
	box.set_meta("knob", knob)
	set_switch(box, on, false)
	return box


static func set_switch(box: Control, on: bool, animate: bool = true) -> void:
	(box.get_meta("fill") as Control).visible = on
	var knob: Control = box.get_meta("knob")
	var x: float = 66.0 if on else 6.0
	if animate:
		(
			knob
			. create_tween()
			. tween_property(knob, "position", Vector2(x, 5), 0.14)
			. set_trans(Tween.TRANS_BACK)
			. set_ease(Tween.EASE_OUT)
		)
	else:
		knob.position = Vector2(x, 5)


## mode: "home"（设置）或 "pause"（局内暂停，多出「回主页」「重试」两个按钮）。
## on_home / on_retry 只在 pause 模式用；on_lang 在切换语言后调用，界面据此重建
static func settings(
	host: Control,
	mode: String,
	on_home: Callable = Callable(),
	on_retry: Callable = Callable(),
	on_lang: Callable = Callable()
) -> PopupCard:
	var buttons: Array = []
	if mode == "pause":
		buttons.append([_t("H_TO_HOME"), UiKit.BLUE, Callable()])
		buttons.append([_t("H_RETRY"), UiKit.GREEN, Callable()])
	elif Platform.impl.id() == &"debug":
		buttons.append([_t("UI_AD_TEST"), UiKit.BLUE, Callable()])
	var rows: int = 4
	var row_h := 86.0
	var empty: Array[String] = []
	var p := PopupCard.open(
		host, _t("UI_SETTINGS"), empty, buttons, rows * row_h + (rows - 1) * GAP + 18.0
	)
	OceanPopupSkin.apply(p, "res://assets/fish/c01.png")
	var settings_data: Dictionary = Save.data["settings"]
	var model := HomeModel.get_inst()
	var specs: Array = [
		["H_MUSIC", bool(settings_data["music"])],
		["H_SOUND", bool(settings_data["sound"])],
		["H_VIBRATION", model.vibration_on()],
	]
	for i: int in specs.size():
		var y: float = p.content_y + i * (row_h + GAP)
		var row := OceanPopupSkin.row(p.card, y, row_h)
		row.add_child(
			_label_left(_t(specs[i][0]), 32, Color.WHITE, Vector2(84, 0), Vector2(270, row_h))
		)
		OceanPopupSkin.icon(["music", "sound", "vibration"][i], row)
		var sw := _make_switch(specs[i][1])
		sw.position = Vector2(row.size.x - 120.0 - 20.0, (row_h - 58.0) / 2.0)
		row.add_child(sw)
		var hot := UiKit.hotspot(Vector2.ZERO, row.size)
		hot.pressed.connect(_toggle.bind(i, sw))
		row.add_child(hot)
	# 语言：两个并排的选项，选中的是亮蓝
	var ly: float = p.content_y + 3 * (row_h + GAP)
	var lrow := OceanPopupSkin.row(p.card, ly, row_h)
	lrow.add_child(
		_label_left(_t("H_LANGUAGE"), 32, Color.WHITE, Vector2(84, 0), Vector2(180, row_h))
	)
	OceanPopupSkin.icon("language", lrow)
	var zh: bool = TranslationServer.get_locale().begins_with("zh")
	for k: int in 2:
		var on: bool = (k == 0) == zh
		var x: float = lrow.size.x - 20.0 - 2 * 128.0 - 8.0 + k * 136.0
		var opt := UiKit.piece("tab_on" if on else "track")
		OceanPopupSkin.paint(opt, "switch_on" if on else "switch_off")
		opt.position = Vector2(x, 14)
		opt.size = Vector2(128, row_h - 28.0)
		lrow.add_child(opt)
		var cap := UiKit.label(_t("H_LANG_ZH" if k == 0 else "H_LANG_EN"), 26)
		cap.position = opt.position
		cap.size = opt.size
		lrow.add_child(cap)
		var hot := UiKit.hotspot(opt.position, opt.size)
		hot.pressed.connect(_set_lang.bind(k == 0, p, on_lang))
		lrow.add_child(hot)
	var bs: Array = p.buttons
	if mode == "pause" and bs.size() == 2:
		(bs[0] as Button).pressed.connect(
			func() -> void:
				p.close()
				if on_home.is_valid():
					on_home.call()
		)
		(bs[1] as Button).pressed.connect(
			func() -> void:
				p.close()
				if on_retry.is_valid():
					on_retry.call()
		)
	elif bs.size() == 1:
		(bs[0] as Button).pressed.connect(
			func() -> void:
				p.close()
				var page := AdTestPage.new()
				page.size = host.size
				page.z_index = 100
				host.add_child(page)
		)
	return p


static func _toggle(which: int, sw: Control) -> void:
	var model := HomeModel.get_inst()
	var on: bool
	match which:
		0:
			on = not bool(Save.data["settings"]["music"])
			Audio.set_music(on)
		1:
			on = not bool(Save.data["settings"]["sound"])
			Audio.set_sound(on)
		_:
			on = not model.vibration_on()
			model.set_vibration(on)
	set_switch(sw, on)
	Audio.sfx(&"click")


static func _set_lang(zh: bool, p: PopupCard, on_lang: Callable) -> void:
	var locale: String = "zh_CN" if zh else "en"
	if TranslationServer.get_locale() == locale:
		return
	TranslationServer.set_locale(locale)
	p.close()
	_changed(on_lang)


# ---------- 七日签到 ----------


static func signin(host: Control, on_change: Callable) -> PopupCard:
	var m := HomeModel.get_inst()
	var can: bool = m.can_sign_in()
	var today: int = m.signin_today()
	var buttons: Array = []
	if can:
		if Ads.available():
			buttons.append([_t("H_AD_DOUBLE"), UiKit.PURPLE, Callable(), {"ad": true}])
		buttons.append([_t("UI_CLAIM"), UiKit.GREEN, Callable()])
	else:
		buttons.append([_t("UI_CONFIRM"), UiKit.GREEN, Callable()])
	var lines: Array[String] = []
	if not can:
		lines.append(_t("UI_CLAIMED"))
	var cell_h: float = 150.0
	var p := PopupCard.open(host, _t("UI_SIGNIN"), lines, buttons, cell_h * 2.0 + GAP)
	var days: Array = m.signin_days()
	var inner: float = PopupCard.CARD_W - PopupCard.SIDE * 2.0
	var cw: float = (inner - 3.0 * GAP) / 4.0
	for i: int in days.size():
		var pos := Vector2(PopupCard.SIDE, p.content_y)
		var w: float = cw
		if i < 4:
			pos.x += i * (cw + GAP)
		elif i < 6:
			pos.x += (i - 4) * (cw + GAP)
			pos.y += cell_h + GAP
		else:
			pos.x += 2.0 * (cw + GAP)
			pos.y += cell_h + GAP
			w = 2.0 * cw + GAP
		var claimed: bool = i < m.signin_count() % days.size() or (i == today and not can)
		_signin_cell(p.card, days[i], i, pos, Vector2(w, cell_h), claimed, i == today and can)
	var bs: Array = p.buttons
	if can:
		(bs[bs.size() - 1] as Button).pressed.connect(_claim.bind(p, host, false, on_change))
		if bs.size() > 1:
			(bs[0] as Button).pressed.connect(
				HomePopups._watch.bind(&"rv_signin_double", _claim.bind(p, host, true, on_change))
			)
	else:
		(bs[0] as Button).pressed.connect(p.close)
	return p


static func _signin_cell(
	parent: Control,
	prize: Dictionary,
	index: int,
	pos: Vector2,
	area: Vector2,
	claimed: bool,
	is_today: bool
) -> void:
	var cell := UiKit.piece("card_gold" if is_today else "popup_row")
	cell.position = pos
	cell.size = area
	cell.pivot_offset = area / 2.0
	parent.add_child(cell)
	var ink: Color = UiKit.INK if is_today else Color.WHITE
	var day := UiKit.text(_t("UI_SIGNIN_DAY") % (index + 1), 22, ink)
	day.position = Vector2(0, 8)
	day.size = Vector2(area.x, 30)
	cell.add_child(day)
	var icon := UiKit.icon(HomePrize.icon_path(prize), 66)
	icon.position = Vector2((area.x - 66.0) / 2.0, 40)
	cell.add_child(icon)
	var amount: String = HomePrize.short(prize)
	if str(prize["kind"]) == "big_chest":
		amount = "1000"
	var num := UiKit.text(amount, 24, ink)
	num.position = Vector2(0, 108)
	num.size = Vector2(area.x, 32)
	cell.add_child(num)
	if claimed:
		# 已领的格子只留天数和一个绿色对勾
		icon.queue_free()
		num.queue_free()
		day.modulate = Color(1, 1, 1, 0.55)
		var done := UiKit.badge("badge_green", 56)
		done.position = (area - Vector2(56, 56)) / 2.0 + Vector2(0, 12)
		cell.add_child(done)
		var tick := UiKit.label("✓", 36)
		tick.size = Vector2(56, 56)
		tick.position = done.position
		cell.add_child(tick)
	if is_today:
		Anim.pulse(cell, 1.05, 0.9)
	else:
		Anim.pop_in(cell, 0.03 * index, 0.25)


static func _claim(p: PopupCard, host: Control, double: bool, on_change: Callable) -> void:
	var reward: Array = HomeModel.get_inst().sign_in(double)
	if reward.is_empty():
		return
	Audio.sfx(&"coins")
	_changed(on_change)
	if is_instance_valid(p):
		p.close()
	if is_instance_valid(host):
		prize_reveal(host, reward, _t("H_CONGRATS"))


# ---------- 个人资料 ----------


static func profile(host: Control) -> PopupCard:
	var info: Dictionary = HomeModel.get_inst().profile()
	var empty: Array[String] = []
	var p := PopupCard.open(host, _t("H_PROFILE"), empty, [], 450.0)
	# A dedicated blue vector shell; do not alter the shared settings/life skin.
	p.card.texture = load("res://assets/ui/rank_profile/panel.svg")
	p.card._mx = 0.0
	p.card._my = 0.0
	p.card._pad = 0.0
	p.card.queue_redraw()
	for child: Node in p.card.get_children():
		if child is Patch:
			if child.size.x > 500:
				child.texture = load("res://assets/ui/rank_profile/header.svg")
				child.size = Vector2(430, 96)
				child.position = Vector2(95, -12)
				child._mx = 0.0
				child._my = 0.0
				child._pad = 0.0
				child.queue_redraw()
			elif child.size.x == 56:
				OceanPopupSkin.paint(child, "close")
				child.position = Vector2(548, 14)
		elif child is Button:
			child.position = Vector2(536, 2)
	var portrait := UiKit.icon("res://assets/ui/rank_profile/avatar.svg", 174)
	portrait.position = Vector2(42, p.content_y)
	p.card.add_child(portrait)
	var avatar := UiKit.icon(str(info["avatar"]), 158)
	avatar.position = Vector2(50, p.content_y + 8)
	p.card.add_child(avatar)
	AvatarFrame.attach(avatar, bool(info["frame"]))
	var name := UiKit.label(str(info["nickname"]), 36)
	name.position = Vector2(238, p.content_y + 44)
	name.size = Vector2(338, 80)
	name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS

	p.card.add_child(name)
	var stats: Array = [
		["H_CUR_LEVEL", _t("UI_LEVEL") % int(info["level"])],
		["H_BEST_COMBO", str(int(info["best_combo"]))],
		["H_COLLECTION", "%d/%d" % [int(info["cards_have"]), int(info["cards_total"])]],
	]
	for i: int in stats.size():
		var y: float = p.content_y + 190 + i * 86
		var row := UiKit.icon("res://assets/ui/rank_profile/stat.svg", 556)
		row.stretch_mode = TextureRect.STRETCH_SCALE
		row.size = Vector2(556, 78)
		row.position = Vector2(32, y)
		p.card.add_child(row)
		var caption := _label_left(_t(stats[i][0]), 28, Color.WHITE, Vector2(62, y), Vector2(286, 78))
		caption.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		caption.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		caption.clip_text = true
		p.card.add_child(caption)
		var value := UiKit.icon("res://assets/ui/rank_profile/value.svg", 188)
		value.size = Vector2(188, 60)
		value.position = Vector2(376, y + 9)
		p.card.add_child(value)
		var v := UiKit.label(str(stats[i][1]), 30)
		v.position = Vector2(380, y + 9)
		v.size = Vector2(180, 60)
		p.card.add_child(v)
	return p


# ---------- 概率表 ----------


static func odds(host: Control) -> PopupCard:
	var m := HomeModel.get_inst()
	var list: Array = m.odds()
	var empty: Array[String] = []
	var row_h: float = 50.0
	var p := PopupCard.open(host, _t("H_ODDS"), empty, [], list.size() * (row_h + 6.0) + 100.0)
	for i: int in list.size():
		var prize: Dictionary = list[i]
		var row := HomePopups._row(p.card, p.content_y + i * (row_h + 6.0), row_h)
		var icon := UiKit.icon(HomePrize.icon_path(prize), 40)
		icon.position = Vector2(14, 5)
		icon.modulate = HomePrize.tint(prize)
		row.add_child(icon)
		var text: String = HomePrize.title(prize)
		if str(prize["kind"]) in ["coin", "skill", "inf_life"]:
			text += " " + HomePrize.short(prize)
		row.add_child(_label_left(text, 26, Color.WHITE, Vector2(66, 0), Vector2(330, row_h)))
		var pct := UiKit.text(str(prize["pct"]), 26, UiKit.GOLD)
		pct.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		pct.position = Vector2(row.size.x - 150.0, 0)
		pct.size = Vector2(130, row_h)
		row.add_child(pct)
	var ny: float = p.content_y + list.size() * (row_h + 6.0) + 6.0
	for k: int in 2:
		var n := UiKit.text(_t("H_ODDS_NOTE_%d" % (k + 1)), 24, Color(1, 1, 1, 0.8))
		n.position = Vector2(0, ny + k * 34.0)
		n.size = Vector2(PopupCard.CARD_W, 32)
		p.card.add_child(n)
	return p


# ---------- 开奖 ----------


## 一个或多个奖品：单个放大展示，多个排成网格。图标弹出 + 金币飞溅 + 音效。
## 奖品里有收藏卡时，先逐张翻卡（CardReveal），翻完再弹奖品窗；这种情况返回 null，
## 要接「领取」按钮的事件请传 on_close
static func prize_reveal(
	host: Control, prizes: Array, title: String, on_close: Callable = Callable()
) -> PopupCard:
	var cards: Array = []
	for prize: Dictionary in prizes:
		if str(prize["kind"]) == "card" and prize.has("card_id"):
			(
				cards
				. append(
					{
						"id": str(prize["card_id"]),
						"rarity": str(prize["rarity"]),
						"is_new": bool(prize.get("is_new", true)),
						"coins": int(prize.get("dupe_coins", 0)),
					}
				)
			)
	if cards.is_empty():
		return _show_prizes(host, prizes, title, on_close)
	CardReveal.open_all(
		host,
		cards,
		func() -> void:
			if is_instance_valid(host):
				_show_prizes(host, prizes, title, on_close)
	)
	return null


static func _show_prizes(
	host: Control, prizes: Array, title: String, on_close: Callable
) -> PopupCard:
	var p: PopupCard = _prize_popup(host, prizes, title)
	if on_close.is_valid():
		p.buttons[0].pressed.connect(on_close)
	return p


static func _prize_popup(host: Control, prizes: Array, title: String) -> PopupCard:
	var single: bool = prizes.size() == 1
	var cols: int = 5
	var grid_rows: int = ceili(prizes.size() / float(cols))
	var area_h: float = 190.0 if single else grid_rows * 130.0 + 10.0
	var empty: Array[String] = []
	var p := PopupCard.open(
		host, title, empty, [[_t("H_TAKE"), UiKit.GREEN, Callable()]], area_h, {"closable": false}
	)
	var top: float = p.content_y + 10.0
	if single:
		var prize: Dictionary = prizes[0]
		var glow := UiKit.icon("res://assets/kit/fx_glow.png", 230)
		glow.modulate = Color(UiKit.GOLD, 0.6)
		HomePopups._centered(p.card, glow, top - 50.0)
		var icon := UiKit.icon(HomePrize.icon_path(prize), 120)
		icon.modulate = HomePrize.tint(prize)
		HomePopups._centered(p.card, icon, top - 8.0)
		Anim.pop_in(icon, 0.1, 0.4)
		Anim.wiggle(icon, 4.0, 1.6)
		var caption := UiKit.label(_prize_line(prize), 40, UiKit.GOLD)
		caption.size = Vector2(PopupCard.CARD_W, 56)
		caption.position = Vector2(0, top + 118.0)
		p.card.add_child(caption)
		Anim.pop_in(caption, 0.25, 0.3)
	else:
		var cw: float = (PopupCard.CARD_W - PopupCard.SIDE * 2.0) / cols
		for i: int in prizes.size():
			var prize: Dictionary = prizes[i]
			var cell := Control.new()
			cell.position = Vector2(PopupCard.SIDE + (i % cols) * cw, top + (i / cols) * 130.0)
			cell.size = Vector2(cw, 120)
			cell.pivot_offset = cell.size / 2.0
			p.card.add_child(cell)
			var icon := UiKit.icon(HomePrize.icon_path(prize), 70)
			icon.modulate = HomePrize.tint(prize)
			icon.position = Vector2((cw - 70.0) / 2.0, 0)
			cell.add_child(icon)
			var amount := UiKit.label(HomePrize.short(prize), 24)
			amount.position = Vector2(0, 74)
			amount.size = Vector2(cw, 34)
			cell.add_child(amount)
			Anim.pop_in(cell, 0.06 * i, 0.3)
	var kind: String = str((prizes[0] as Dictionary)["kind"])
	Audio.sfx(&"win" if kind in ["card", "big_chest"] else &"coins")
	Anim.burst(
		p,
		p.card.position + Vector2(PopupCard.CARD_W / 2.0, top + 60.0),
		16,
		"res://assets/ui/coin.png",
		560.0,
		800.0,
		Vector2(26, 44),
		0.9,
		120
	)
	p.buttons[0].pressed.connect(p.close)
	return p


static func _prize_line(prize: Dictionary) -> String:
	match str(prize["kind"]):
		"coin":
			return "%s ×%d" % [HomePrize.title(prize), int(prize["amount"])]
		"inf_life":
			return "%s %s" % [HomePrize.title(prize), HomePrize.short(prize)]
		"skill":
			var id: String = str(prize.get("skill", ""))
			var name: String = _t(HomePopups.SKILL_KEYS[id]) if id != "" else HomePrize.title(prize)
			return "%s ×%d" % [name, int(prize["amount"])]
		"card":
			var sp: Dictionary = Config.species_by_id.get(str(prize.get("card_id", "")), {})
			return str(sp.get("name", HomePrize.title(prize)))
	return HomePrize.title(prize)
