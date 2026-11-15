class_name HomeScreen
extends Control
## 主界面：顶部资料栏 + 中间页面 + 底部五个页签。

enum { TAB_SHOP, TAB_SCENE, TAB_MAIN, TAB_RANK, TAB_COLLECTION }

const W := 750.0
const BAR_Y := 16.0
const BAR_H := 96.0
const TOP_H := 124.0
const TABS_H := 150.0
const TAB_KEYS: Array[String] = [
	"UI_TAB_SHOP", "UI_TAB_SCENE", "UI_TAB_MAIN", "UI_TAB_RANK", "UI_TAB_COLLECTION"
]
const TAB_ICONS: Array[String] = ["tab_shop", "tab_scene", "tab_main", "tab_rank", "tab_collection"]
const RARITIES: Array[String] = ["common", "uncommon", "rare", "epic", "legend"]
## 各稀有度页签选中时的按钮颜色
const RARITY_BUTTONS: Array[Color] = [
	UiKit.BLUE, UiKit.GREEN, UiKit.BLUE, UiKit.PURPLE, UiKit.ORANGE
]
const TOOLS: Array[String] = ["net", "blow", "shuffle"]
const TOOL_KEYS: Dictionary = {
	"net": "UI_TOOL_NET", "blow": "UI_TOOL_BLOW", "shuffle": "UI_TOOL_SHUFFLE"
}

var start_tab: int = TAB_MAIN

var _tab: int = TAB_MAIN
var _rarity: int = 0
var _stage: Control
var _page: Control
var _popup: PopupCard
var _stat_labels: Dictionary = {}
var _stat_shown: Dictionary = {}
var _tab_icons: Array[Control] = []
var _tab_marks: Array[Control] = []
var _tab_labels: Array[Label] = []


func _ready() -> void:
	_tab = start_tab
	resized.connect(_build)
	_build()


func _build() -> void:
	for c: Node in get_children():
		c.queue_free()
	_popup = null
	_stat_shown.clear()
	var bg := TextureRect.new()
	bg.texture = UiKit.tex("res://assets/ui/bg_home.jpg")
	bg.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	bg.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	bg.size = size
	add_child(bg)
	_stage = Control.new()
	_stage.position = Vector2((size.x - W) / 2.0, 0)
	_stage.size = Vector2(W, size.y)
	add_child(_stage)
	_build_top()
	_build_tabs()
	_show_page(false)


func _add(parent: Control, node: Control, pos: Vector2, area: Vector2 = Vector2.ZERO) -> Control:
	node.position = pos
	if area != Vector2.ZERO:
		node.size = area
		node.pivot_offset = area / 2.0
	parent.add_child(node)
	return node


func _btn(
	parent: Control,
	text: String,
	color: Color,
	pos: Vector2,
	area: Vector2,
	action: Callable,
	font: int = 32
) -> Button:
	var b := UiKit.button(text, color, font)
	b.pressed.connect(action)
	Anim.press_fx(b)
	_add(parent, b, pos, area)
	return b


# ---------- 顶部资料栏 ----------


## 顶栏：玻璃横栏里头像、昵称、三个资源胶囊，全部垂直居中
func _build_top() -> void:
	var mid: float = BAR_Y + BAR_H / 2.0
	_add(_stage, UiKit.piece("glass"), Vector2(16, BAR_Y), Vector2(W - 32, BAR_H))
	var profile: Dictionary = Platform.impl.get_profile()
	_add(_stage, UiKit.icon(profile.get("avatar", ""), 68), Vector2(30, mid - 34))
	var name := UiKit.label(profile.get("nickname", ""), 22)
	name.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	name.clip_text = true
	_add(_stage, name, Vector2(110, mid - 20), Vector2(112, 40))
	var keys: Array = [["coins", "coin"], ["tickets", "ticket"], ["stars", "star"]]
	for i: int in keys.size():
		var cap: Dictionary = UiKit.capsule("res://assets/ui/%s.png" % keys[i][1], 158)
		_add(_stage, cap["box"], Vector2(230 + i * 166, mid - 28))
		_stat_labels[keys[i][0]] = cap["label"]
	_refresh_stats()


func _refresh_stats() -> void:
	for key: String in _stat_labels:
		var value: int = int(Save.data[key])
		var label: Label = _stat_labels[key]
		if _stat_shown.has(key) and _stat_shown[key] != value:
			Anim.count_to(label, _stat_shown[key], value)
		else:
			label.text = str(value)
		_stat_shown[key] = value


# ---------- 底部页签 ----------


## 底部页签：一条玻璃横栏，选中的页签有高亮底、图标放大上浮
func _build_tabs() -> void:
	var y: float = size.y - TABS_H
	_add(_stage, UiKit.piece("fade"), Vector2(-400, y - 60), Vector2(W + 800, TABS_H + 60))
	_add(_stage, UiKit.piece("glass"), Vector2(16, y + 14), Vector2(W - 32, TABS_H - 28))
	_tab_icons.clear()
	_tab_marks.clear()
	_tab_labels.clear()
	var tab_w: float = (W - 48) / TAB_KEYS.size()
	for i: int in TAB_KEYS.size():
		var x: float = 24 + i * tab_w
		var mark := UiKit.piece("tab_on")
		_add(_stage, mark, Vector2(x + 4, y + 20), Vector2(tab_w - 8, TABS_H - 40))
		_tab_marks.append(mark)
		var icon := UiKit.icon("res://assets/ui/%s.png" % TAB_ICONS[i], 78)
		_add(_stage, icon, Vector2(x + (tab_w - 78) / 2.0, y + 22))
		_tab_icons.append(icon)
		var text := UiKit.label(tr(TAB_KEYS[i]), 22)
		_add(_stage, text, Vector2(x, y + 94), Vector2(tab_w, 30))
		_tab_labels.append(text)
		var hot := UiKit.hotspot(Vector2(x, y), Vector2(tab_w, TABS_H))
		hot.pressed.connect(_on_tab.bind(i))
		_stage.add_child(hot)
	_mark_tabs()


func _mark_tabs() -> void:
	var y: float = size.y - TABS_H
	for i: int in _tab_marks.size():
		var on: bool = i == _tab
		_tab_marks[i].visible = on
		# 选中的图标放大并上浮一点，其余稍微暗一些
		var icon: Control = _tab_icons[i]
		var tw: Tween = icon.create_tween().set_parallel()
		(
			tw
			. tween_property(icon, "scale", Vector2.ONE * (1.22 if on else 1.0), 0.18)
			. set_trans(Tween.TRANS_BACK)
			. set_ease(Tween.EASE_OUT)
		)
		tw.tween_property(icon, "position:y", y + (10.0 if on else 22.0), 0.18)
		icon.modulate = Color.WHITE if on else Color(0.86, 0.9, 0.96)
		_tab_labels[i].add_theme_color_override("font_color", UiKit.GOLD if on else Color.WHITE)


func _on_tab(i: int) -> void:
	if i == _tab:
		return
	Audio.sfx(&"click")
	var from_right: bool = i > _tab
	_tab = i
	_mark_tabs()
	_show_page(true, from_right)


func _show_page(animate: bool, from_right: bool = true) -> void:
	if _page != null and is_instance_valid(_page):
		Anim.fade_out_free(_page, 0.12)
	_page = Control.new()
	_page.size = Vector2(W, size.y - TOP_H - TABS_H)
	_add(_stage, _page, Vector2(0, TOP_H))
	_stage.move_child(_page, 0)
	match _tab:
		TAB_SHOP:
			_page_shop()
		TAB_SCENE:
			_page_scene()
		TAB_MAIN:
			_page_main()
		TAB_RANK:
			_page_rank()
		TAB_COLLECTION:
			_page_collection()
	if animate:
		# 新页面从切换方向滑入
		_page.position.x = 120.0 if from_right else -120.0
		_page.modulate.a = 0.0
		var tw: Tween = _page.create_tween().set_parallel()
		tw.tween_property(_page, "position:x", 0.0, 0.22).set_trans(Tween.TRANS_QUAD).set_ease(
			Tween.EASE_OUT
		)
		tw.tween_property(_page, "modulate:a", 1.0, 0.22)


func _title(text: String) -> void:
	_add(_page, UiKit.label(text, 52), Vector2(0, 18), Vector2(W, 72))


func _toast(text: String) -> void:
	var l := UiKit.label(text, 30)
	l.z_index = 90
	_add(_stage, l, Vector2(0, size.y - TABS_H - 70), Vector2(W, 50))
	Anim.pop_in(l, 0.0, 0.2)
	var tw: Tween = l.create_tween()
	tw.tween_interval(1.5)
	tw.tween_property(l, "modulate:a", 0.0, 0.3)
	tw.tween_callback(l.queue_free)


func _close_popup() -> void:
	if _popup != null:
		_popup.close()
		_popup = null


# ---------- 主页 ----------


func _page_main() -> void:
	var h: float = _page.size.y
	var title := UiKit.label(tr("UI_TITLE"), 96, UiKit.GOLD)
	_add(_page, title, Vector2(0, h * 0.1), Vector2(W, 130))
	Anim.pop_in(title, 0.05, 0.45)
	# 几条鱼在泡泡里漂着当装饰
	var deco: Array = [
		["c04", 120.0, 0.36, 150.0], ["c16", 520.0, 0.33, 120.0], ["c27", 330.0, 0.44, 170.0]
	]
	for i: int in deco.size():
		var d: Array = deco[i]
		var side: float = d[3]
		var holder := Control.new()
		_add(_page, holder, Vector2(d[1], h * float(d[2])))
		var bubble := UiKit.icon("res://assets/ui/bubble.png", side)
		bubble.modulate.a = 0.8
		holder.add_child(bubble)
		var fish := UiKit.icon("res://assets/fish/%s.png" % d[0], side * 0.6)
		fish.position = Vector2(side, side) * 0.2
		holder.add_child(fish)
		Anim.wiggle(fish, 7.0, 1.6 + i * 0.3)
		Anim.pop_in(holder, 0.15 + 0.1 * i, 0.4)
		Anim.bob(holder, 10.0, 3.0 + i * 0.5, i * 0.3)
	var start := _btn(
		_page,
		tr("UI_START") % int(Save.data["level"]),
		UiKit.GREEN,
		Vector2(135, h * 0.7),
		Vector2(480, 120),
		_on_start,
		46
	)
	Anim.pulse(start, 1.05, 1.2)
	var gift := UiKit.icon("res://assets/ui/gift.png", 96)
	_add(_page, gift, Vector2(W - 124, 20))
	_add(_page, UiKit.label(tr("UI_SIGNIN"), 24), Vector2(W - 146, 112), Vector2(140, 34))
	var hot := UiKit.hotspot(Vector2(W - 146, 14), Vector2(140, 136))
	hot.pressed.connect(_show_signin)
	Anim.press_fx(hot)
	_page.add_child(hot)
	if Meta.can_sign_in(Save.data, Save.today()):
		# 还没签到：礼物盒摇晃提醒
		Anim.wiggle(gift, 10.0, 0.7)
	_add(_page, UiKit.badge("btn_gear", 68), Vector2(24, 24))
	var gear := UiKit.hotspot(Vector2(16, 16), Vector2(84, 84))
	gear.pressed.connect(_show_settings)
	Anim.press_fx(gear)
	_page.add_child(gear)


func _show_settings() -> void:
	_close_popup()
	var music: bool = Save.data["settings"]["music"]
	var sound: bool = Save.data["settings"]["sound"]
	var buttons: Array = [
		[tr("UI_MUSIC_ON" if music else "UI_MUSIC_OFF"), UiKit.BLUE, _toggle.bind("music")],
		[tr("UI_SOUND_ON" if sound else "UI_SOUND_OFF"), UiKit.BLUE, _toggle.bind("sound")],
	]
	# 广告测试页只在调试平台出现
	if Platform.impl.id() == &"debug":
		buttons.append([tr("UI_AD_TEST"), UiKit.PURPLE, _show_ad_test])
	buttons.append([tr("UI_CLOSE"), UiKit.GREEN, _close_popup])
	var lines: Array[String] = []
	_popup = PopupCard.open(self, tr("UI_SETTINGS"), lines, buttons)


func _toggle(what: String) -> void:
	if what == "music":
		Audio.set_music(not bool(Save.data["settings"]["music"]))
	else:
		Audio.set_sound(not bool(Save.data["settings"]["sound"]))
	_show_settings()


func _on_start() -> void:
	App.inst.go_game()


func _show_signin() -> void:
	var day: int = Save.today()
	var can: bool = Meta.can_sign_in(Save.data, day)
	var days: Array = Config.signin["days"]
	var idx: int = int(Save.data["signin"]["count"]) % days.size()
	var buttons: Array = []
	if can:
		buttons.append([tr("UI_CLAIM"), UiKit.GREEN, _claim_signin.bind(false)])
		if Ads.available():
			buttons.append([tr("UI_CLAIM_DOUBLE"), UiKit.PURPLE, _claim_signin.bind(true)])
	buttons.append([tr("UI_CLOSE"), UiKit.ORANGE, _close_popup])
	var lines: Array[String] = []
	if not can:
		lines.append(tr("UI_CLAIMED"))
	_popup = PopupCard.open(self, tr("UI_SIGNIN"), lines, buttons, 330)
	for i: int in days.size():
		var cell_w: float = 132.0 if i < 6 else 560.0
		var pos := (
			Vector2(30 + (i % 4) * 142, _popup.content_y + (i / 4) * 160)
			if i < 6
			else Vector2(30, _popup.content_y + 0)
		)
		if i >= 4 and i < 6:
			pos = Vector2(30 + (i - 4) * 142, _popup.content_y + 160)
		if i == 6:
			pos = Vector2(314, _popup.content_y + 160)
			cell_w = 276.0
		var claimed: bool = i < idx or (i == idx and not can)
		var color: Color = (
			UiKit.GOLD if (i == idx and can) else (Color("CFE9E4") if claimed else Color.WHITE)
		)
		var cell_tex: String = "card_gold" if color == UiKit.GOLD else "card"
		var cell: Control = UiKit.piece(cell_tex)
		cell.self_modulate = Color(0.72, 0.8, 0.86) if claimed else Color.WHITE
		_add(_popup.card, cell, pos, Vector2(cell_w, 148))
		var day_label := UiKit.text(tr("UI_SIGNIN_DAY") % (i + 1), 22)
		_add(cell, day_label, Vector2(0, 8), Vector2(cell_w, 30))
		var reward: Dictionary = days[i]
		var icon_path: String = "res://assets/ui/coin.png"
		var amount: String = ""
		if reward.has("coins") and reward.has("tools"):
			icon_path = "res://assets/ui/chest.png"
		elif reward.has("coins"):
			amount = str(int(reward["coins"]))
		elif reward.has("tickets"):
			icon_path = "res://assets/ui/ticket.png"
			amount = str(int(reward["tickets"]))
		elif reward.has("tools"):
			icon_path = "res://assets/ui/tool_%s.png" % (reward["tools"] as Dictionary).keys()[0]
			amount = "1"
		_add(cell, UiKit.icon(icon_path, 70), Vector2((cell_w - 70) / 2.0, 38))
		_add(
			cell, UiKit.label("✓" if claimed else amount, 28), Vector2(0, 106), Vector2(cell_w, 36)
		)
		Anim.pop_in(cell, 0.05 * i, 0.25)
		if i == idx and can:
			Anim.pulse(cell, 1.05, 0.9)


func _claim_signin(double: bool) -> void:
	if double and not await Ads.rewarded(&"rv_signin_double"):
		return
	var reward: Dictionary = Meta.sign_in(Save.data, Config.signin, Save.today())
	if reward.is_empty():
		return
	if double:
		Meta.grant(Save.data, reward)
	Save.save()
	Audio.sfx(&"coin")
	_close_popup()
	_refresh_stats()
	_show_page(false)


func _show_ad_test() -> void:
	_close_popup()
	var page := AdTestPage.new()
	page.size = size
	page.z_index = 100
	add_child(page)


# ---------- 商店 ----------


func _page_shop() -> void:
	_title(tr("UI_TAB_SHOP"))
	var eco: Dictionary = Config.eco
	var left: int = (
		int(eco["freeCoin"]["daily"])
		- (
			int(Save.data["daily"]["freeCoin"])
			if int(Save.data["daily"]["day"]) == Save.today()
			else 0
		)
	)
	_shop_row(
		0,
		"res://assets/ui/coin.png",
		tr("UI_FREE_COINS") % int(eco["freeCoin"]["amount"]),
		tr("UI_WATCH_AD_LEFT") % left,
		UiKit.PURPLE,
		_on_free_coin,
		left > 0 and Ads.available()
	)
	for i: int in TOOLS.size():
		var tool: String = TOOLS[i]
		var price: int = int(eco["toolPrice"][tool])
		var title: String = (
			"%s  ·  %s" % [tr(TOOL_KEYS[tool]), tr("UI_OWNED") % int(Save.data["tools"][tool])]
		)
		_shop_row(
			i + 1,
			"res://assets/ui/tool_%s.png" % tool,
			title,
			str(price),
			UiKit.GREEN,
			_on_buy_tool.bind(tool),
			int(Save.data["coins"]) >= price
		)


func _shop_row(
	i: int,
	icon: String,
	title: String,
	action: String,
	color: Color,
	on_press: Callable,
	enabled: bool
) -> void:
	var row := UiKit.piece("row")
	_add(_page, row, Vector2(30, 110 + i * 150), Vector2(W - 60, 132))
	_add(row, UiKit.icon(icon, 96), Vector2(18, 16))
	var l := UiKit.text(title, 28)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_add(row, l, Vector2(130, 12), Vector2(250, 108))
	var b := _btn(row, action, color, Vector2(384, 26), Vector2(290, 80), on_press, 22)
	b.clip_text = true
	b.disabled = not enabled
	Anim.pop_in(row, 0.06 * i, 0.3)


func _on_free_coin() -> void:
	if not await Ads.rewarded(&"rv_free_coin"):
		return
	if Meta.take_free_coin(Save.data, Config.eco, Save.today()):
		Save.save()
		Audio.sfx(&"coin")
	_refresh_stats()
	_show_page(false)


func _on_buy_tool(tool: String) -> void:
	if Meta.buy_tool(Save.data, Config.eco, tool):
		Save.save()
		Audio.sfx(&"coin")
		_refresh_stats()
		_show_page(false)
	else:
		_toast(tr("UI_NO_COINS"))


# ---------- 家园 ----------


func _page_scene() -> void:
	var list: Array = Config.scenes["scenes"]
	var index: int = int(Save.data["scene"])
	var done_all: bool = index >= list.size()
	var scene: Dictionary = list[mini(index, list.size() - 1)]
	_title(tr(scene["name"]))
	var side: float = minf(620.0, _page.size.y - 330.0)
	var frame := UiKit.piece("row")
	_add(_page, frame, Vector2((W - side) / 2.0 - 12, 96), Vector2(side + 24, side + 24))
	var art := TextureRect.new()
	art.texture = UiKit.tex("res://assets/ui/scene1.jpg")
	art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	art.size = Vector2(side, side)
	art.position = Vector2(12, 12)
	frame.add_child(art)
	var steps: Array = scene["steps"]
	var step: int = steps.size() if done_all else int(Save.data["sceneStep"])
	# 还没建的部分用灰度表示：建得越多画面越鲜亮
	art.modulate = Color.WHITE.lerp(Color(0.45, 0.5, 0.55), 1.0 - float(step) / steps.size())
	var y: float = side + 140
	_add(_page, UiKit.piece("chip"), Vector2(95, y - 4), Vector2(560, 52))
	if step > 0:
		_add(
			_page,
			UiKit.piece("fill"),
			Vector2(95, y),
			Vector2(maxf(48.0, 560.0 * step / steps.size()), 44)
		)
	_add(
		_page,
		UiKit.text("%d/%d" % [step, steps.size()], 28, UiKit.INK),
		Vector2(95, y),
		Vector2(560, 42)
	)
	if done_all:
		_add(_page, UiKit.label(tr("UI_BUILD_DONE"), 26), Vector2(0, y + 60), Vector2(W, 60))
		return
	var cost: int = int(steps[step])
	var build := _btn(
		_page,
		tr("UI_BUILD") % cost,
		UiKit.ORANGE,
		Vector2(175, y + 62),
		Vector2(400, 96),
		_on_build.bind(frame),
		38
	)
	if int(Save.data["stars"]) >= cost:
		Anim.pulse(build, 1.05, 1.0)


func _on_build(frame: Control) -> void:
	var before: int = int(Save.data["scene"])
	if not Meta.build_step(Save.data, Config.scenes):
		_show_need_stars()
		return
	Save.save()
	Audio.sfx(&"bowl_done")
	Anim.squash(frame, 0.05)
	Anim.burst(
		_stage,
		frame.position + frame.size / 2.0 + Vector2(0, TOP_H),
		14,
		"res://assets/ui/star.png",
		520.0,
		700.0,
		Vector2(26, 46),
		0.8,
		60
	)
	_refresh_stats()
	if int(Save.data["scene"]) != before:
		Audio.sfx(&"win")
		Anim.confetti(self, size.x)
		_toast(tr("UI_SCENE_CHEST"))
	await get_tree().create_timer(0.35).timeout
	if is_inside_tree() and _tab == TAB_SCENE:
		_show_page(false)


## 星星不够：告诉玩家还差几颗，并给一个直接去闯关的按钮
func _show_need_stars() -> void:
	Audio.sfx(&"error")
	var list: Array = Config.scenes["scenes"]
	var steps: Array = list[int(Save.data["scene"])]["steps"]
	var missing: int = int(steps[int(Save.data["sceneStep"])]) - int(Save.data["stars"])
	var lines: Array[String] = [tr("UI_NEED_STARS_MORE") % missing]
	_popup = (
		PopupCard
		. open(
			self,
			tr("UI_NEED_STARS_TITLE"),
			lines,
			[
				[tr("UI_GO_PLAY"), UiKit.GREEN, _on_start],
				[tr("UI_CLOSE"), UiKit.BLUE, _close_popup],
			],
			150
		)
	)
	var star := UiKit.icon("res://assets/ui/star.png", 130)
	_add(_popup.card, star, Vector2((PopupCard.CARD_W - 130) / 2.0, _popup.content_y + 6))
	star.modulate = Color(0.75, 0.8, 0.9, 0.9)
	Anim.wiggle(star, 10.0, 0.9)


# ---------- 排行 ----------


func _page_rank() -> void:
	_title(tr("UI_RANK_TITLE"))
	var days_left: int = 7 - (Save.today() + 3) % 7
	_add(_page, UiKit.label(tr("UI_RANK_RESET") % days_left, 24), Vector2(0, 84), Vector2(W, 34))
	var me_score: int = (
		int(Save.data["week"]["cleared"])
		if int(Save.data["week"]["id"]) == (Save.today() + 3) / 7
		else 0
	)
	var profile: Dictionary = Platform.impl.get_profile()
	var rows: Array = Platform.impl.get_rank_list(&"weekly")
	rows.append(
		{
			"name": profile.get("nickname", ""),
			"avatar": profile.get("avatar", ""),
			"score": me_score,
			"me": true
		}
	)
	rows.sort_custom(
		func(a: Dictionary, b: Dictionary) -> bool: return int(a["score"]) > int(b["score"])
	)
	var medal: Array[Color] = [Color("FFE08A"), Color("DCE6F0"), Color("F2C29B")]
	var row_h: float = minf(96.0, (_page.size.y - 140.0) / rows.size())
	for i: int in rows.size():
		var r: Dictionary = rows[i]
		var color: Color = (
			Color(0.62, 1.0, 0.62) if r.get("me", false) else (medal[i] if i < 3 else Color.WHITE)
		)
		var row := UiKit.piece("row")
		row.self_modulate = color
		_add(_page, row, Vector2(30, 128 + i * row_h), Vector2(W - 60, row_h - 10))
		_add(row, UiKit.label(str(i + 1), 34), Vector2(10, 0), Vector2(70, row_h - 14))
		_add(row, UiKit.icon(r["avatar"], row_h - 26), Vector2(86, 6))
		var name := UiKit.label(r["name"], 28)
		name.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		_add(row, name, Vector2(100 + row_h - 20, 0), Vector2(300, row_h - 14))
		_add(
			row,
			UiKit.label(tr("UI_RANK_LEVELS") % int(r["score"]), 30),
			Vector2(W - 60 - 190, 0),
			Vector2(170, row_h - 14)
		)
		Anim.pop_in(row, 0.04 * i, 0.28)


# ---------- 图鉴 ----------


func _page_collection() -> void:
	# 稀有度分段页签：一条玻璃底上五段，选中的那段是彩色按钮
	_add(_page, UiKit.piece("glass"), Vector2(16, 8), Vector2(W - 32, 84))
	var seg_w: float = (W - 32 - 16) / RARITIES.size()
	for i: int in RARITIES.size():
		var text: String = tr("UI_RARITY_" + RARITIES[i].to_upper())
		var pos := Vector2(24 + i * seg_w, 16)
		if i == _rarity:
			var on := _btn(
				_page,
				text,
				RARITY_BUTTONS[i],
				pos + Vector2(3, 0),
				Vector2(seg_w - 6, 68),
				_on_rarity.bind(i),
				28
			)
			Anim.bounce(on, 1.08, 0.22)
		else:
			_add(_page, UiKit.label(text, 26, Color(0.92, 0.96, 1.0)), pos, Vector2(seg_w, 68))
			var hot := UiKit.hotspot(pos, Vector2(seg_w, 68))
			hot.pressed.connect(_on_rarity.bind(i))
			_page.add_child(hot)
	# 收集进度
	var cards: Dictionary = Save.data["cards"]
	var pool: Array = Config.species.filter(
		func(sp: Dictionary) -> bool: return sp["rarity"] == RARITIES[_rarity]
	)
	var have: int = pool.filter(func(sp: Dictionary) -> bool: return cards.has(sp["id"])).size()
	_add(_page, UiKit.piece("chip"), Vector2(16, 104), Vector2(W - 32, 44))
	if have > 0:
		_add(
			_page,
			UiKit.piece("fill"),
			Vector2(16, 104),
			Vector2(maxf(44.0, (W - 32) * have / pool.size()), 44)
		)
	_add(
		_page,
		UiKit.text(tr("UI_COLLECTED") % [have, pool.size()], 24, UiKit.INK),
		Vector2(16, 104),
		Vector2(W - 32, 42)
	)
	# 卡片列表
	var list_top: float = 162.0
	var list_h: float = _page.size.y - list_top - 122.0
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_add(_page, scroll, Vector2(0, list_top), Vector2(W, list_h))
	var inner := Control.new()
	# 默认会拦下滚轮和拖动，放行给外层的滚动容器
	inner.mouse_filter = Control.MOUSE_FILTER_PASS
	scroll.add_child(inner)
	var cell_w: float = (W - 32 - 24) / 3.0
	for n: int in pool.size():
		var sp: Dictionary = pool[n]
		var owned: int = int(cards.get(sp["id"], 0))
		var cell := UiKit.piece("card")
		cell.self_modulate = Color.WHITE if owned > 0 else Color(0.88, 0.92, 0.97)
		_add(
			inner,
			cell,
			Vector2(16 + (n % 3) * (cell_w + 12), 6 + (n / 3) * 262),
			Vector2(cell_w, 250)
		)
		var art_path: String = "res://assets/fish/%s.png" % sp["id"]
		var bub := UiKit.icon("res://assets/ui/bubble.png", 164)
		_add(cell, bub, Vector2((cell_w - 164) / 2.0, 10)).modulate.a = 0.75
		if ResourceLoader.exists(art_path):
			var fish := UiKit.icon(art_path, 112)
			_add(cell, fish, Vector2((cell_w - 112) / 2.0, 36))
			if owned > 0:
				Anim.wiggle(fish, 6.0, 1.8, randf())
			else:
				fish.modulate = Color(0.05, 0.2, 0.3, 0.7)
		else:
			_add(cell, UiKit.label("?", 84), Vector2((cell_w - 164) / 2.0, 10), Vector2(164, 164))
		var name_text: String = sp["name"] if owned > 0 else tr("UI_UNKNOWN")
		_add(
			cell,
			UiKit.text(name_text, 28, UiKit.NAVY if owned > 0 else UiKit.BODY),
			Vector2(0, 186),
			Vector2(cell_w, 44)
		)
		if owned > 1:
			_add(cell, UiKit.badge("dot_red", 44), Vector2(cell_w - 52, 8))
			_add(cell, UiKit.label(str(owned), 22), Vector2(cell_w - 52, 8), Vector2(44, 44))
		if n < 12:
			Anim.pop_in(cell, 0.03 * n, 0.25)
	inner.custom_minimum_size = Vector2(W, 12 + ceili(pool.size() / 3.0) * 262)
	# 珍稀卡包：图标 + 名称 + 价格胶囊，旁边是概率说明
	var y: float = _page.size.y - 108
	var pack := _btn(_page, "", UiKit.PURPLE, Vector2(16, y), Vector2(W - 32 - 100, 92), _on_pack)
	_add(pack, UiKit.icon("res://assets/ui/chest.png", 84), Vector2(20, 2))
	var pack_name := UiKit.label(tr("UI_PACK_NAME"), 34)
	pack_name.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_add(pack, pack_name, Vector2(116, 0), Vector2(260, 88))
	var price: Dictionary = UiKit.capsule("res://assets/ui/ticket.png", 150, 56)
	(price["label"] as Label).text = str(int(Config.eco["ticketPack"]["cost"]))
	_add(pack, price["box"], Vector2(pack.size.x - 170, 16))
	var info := _btn(
		_page, "?", UiKit.BLUE, Vector2(W - 16 - 88, y), Vector2(88, 92), _show_rates, 40
	)
	info.tooltip_text = tr("UI_RATES_TITLE")


func _show_rates() -> void:
	var lines: Array[String] = [
		tr("UI_RATES_PACK_1"),
		tr("UI_RATES_PACK_2"),
		tr("UI_RATES_LEVEL_1"),
		tr("UI_RATES_LEVEL_2"),
		tr("UI_RATES_PITY")
	]
	_popup = PopupCard.open(
		self, tr("UI_RATES_TITLE"), lines, [[tr("UI_CONFIRM"), UiKit.GREEN, _close_popup]]
	)


func _on_rarity(i: int) -> void:
	_rarity = i
	_show_page(false)


func _on_pack() -> void:
	var card: Dictionary = Meta.draw_card(
		Save.data, Config.eco, Config.species, "ticketPack", Rng.new(Time.get_ticks_usec())
	)
	if card.is_empty():
		_toast(tr("UI_NEED_TICKETS"))
		Audio.sfx(&"error")
		return
	Save.save()
	Audio.sfx(&"win")
	_refresh_stats()
	var sp: Dictionary = Config.species_by_id[card["id"]]
	var line: String = (
		tr("UI_CARD_NEW") % sp["name"]
		if card["is_new"]
		else tr("UI_CARD_DUPE") % [sp["name"], int(card["coins"])]
	)
	_rarity = RARITIES.find(sp["rarity"])
	_show_page(false)
	_popup = PopupCard.open(
		self,
		tr("UI_RARITY_" + str(sp["rarity"]).to_upper()),
		[line],
		[[tr("UI_CONFIRM"), UiKit.GREEN, _close_popup]],
		220
	)
	var art_path: String = "res://assets/fish/%s.png" % sp["id"]
	var show: Control = (
		UiKit.icon(art_path, 200) if ResourceLoader.exists(art_path) else UiKit.label("?", 140)
	)
	_add(_popup.card, show, Vector2(210, _popup.content_y + 6), Vector2(200, 200))
	Anim.pop_in(show, 0.2, 0.5)
	Anim.confetti(self, size.x, 40)
