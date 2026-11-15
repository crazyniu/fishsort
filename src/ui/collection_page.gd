class_name CollectionPage
extends HomePage
## 收藏页（docs/01 §5.4）：60 张收藏卡分成几册，每册按关开放。
## 首页是册子列表和总进度；点一册进去看这一册的卡，集齐领大奖；全部集齐领终极大奖。

const LIST_TOP := 174.0
const ROW_H := 182.0
const GRID_TOP := 336.0

## 正在看的册子，-1 = 册子列表。页面每次重建都是新实例，状态放静态变量里
static var _book: int = -1


func build() -> void:
	var background := _art("ocean")
	add(background, Vector2(0, 0), Vector2(W, size.y))
	if _book < 0:
		_build_list()
	else:
		_build_book()


# ---------- 册子列表 ----------


func _build_list() -> void:
	_heading(tr("UI_TAB_COLLECTION"))
	_build_total()
	var eco: Dictionary = Config.eco
	var scroll := _scroll(LIST_TOP)
	var inner: Control = scroll.get_child(0)
	var books: Array = Album.books(eco)
	for i: int in books.size():
		_book_row(inner, i, books[i])
	inner.custom_minimum_size = Vector2(W - 24, books.size() * ROW_H + 8.0)


## 总进度：文字 + 进度条，右端是终极大奖
func _build_total() -> void:
	var have: int = (Save.data["cards"] as Dictionary).size()
	var total: int = Config.species.size()
	add(UiKit.label(tr("UI_COLLECTED") % [have, total], 26), Vector2(36, 104), Vector2(230, 36))
	var bar_x: float = 270.0
	var bar_w: float = W - 150.0 - bar_x
	_progress(self, Vector2(bar_x, 106), Vector2(bar_w, 34), have, total)
	var chest := UiKit.icon("res://assets/ui/chest_closed.png", 96)
	add(chest, Vector2(W - 136.0, 74), Vector2(96, 96))
	if bool(Save.data["album"]["final"]):
		chest.texture = UiKit.tex("res://assets/ui/chest_open.png")
	elif Album.can_claim_final(Save.data, Config.eco):
		Anim.pulse(chest, 1.15, 0.8)
		var hot := UiKit.hotspot(Vector2(W - 140.0, 70), Vector2(104, 104))
		hot.pressed.connect(_claim_final)
		add_child(hot)


func _book_row(inner: Control, i: int, book: Dictionary) -> void:
	var save: Dictionary = Save.data
	var eco: Dictionary = Config.eco
	var open: bool = Album.is_open(eco, i, int(save["level"]))
	var cards: Array = book["cards"]
	var have: int = Album.have(save, eco, i)
	var row := _art("panel")
	row.mouse_filter = Control.MOUSE_FILTER_PASS
	add_to(inner, row, Vector2(12, i * ROW_H + 4), Vector2(690, ROW_H - 12))
	add_to(row, _art("cover"), Vector2(12, 12), Vector2(158, 144))
	var fish := UiKit.icon("res://assets/fish/%s.png" % cards[cards.size() - 1], 124)
	add_to(row, fish, Vector2(30, 22))
	var name_label := _clear_label(tr("ALBUM_BOOK_%d" % int(book["id"])), 36, Color("123c79"))
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_to(row, name_label, Vector2(184, 14), Vector2(350, 74))
	if not open:
		row.modulate = Color(0.72, 0.85, 0.98)
		fish.modulate = Color(0.08, 0.25, 0.43)
		add_to(row, UiKit.icon("res://assets/ui/lock.png", 64), Vector2(582, 52))
		var at := _clear_label(tr("H_UNLOCKS_AT") % int(book["unlock"]), 28, Color("123c79"))
		at.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		add_to(row, at, Vector2(190, 100), Vector2(340, 44))
		return
	_progress(row, Vector2(190, 102), Vector2(320, 36), have, cards.size())
	var hot := UiKit.hotspot(Vector2.ZERO, row.size)
	hot.mouse_filter = Control.MOUSE_FILTER_PASS
	hot.pressed.connect(_open_book.bind(i))
	row.add_child(hot)
	var claimed: bool = Album.is_claimed(save, i)
	var chest_path: String = "res://assets/ui/chest_open.png" if claimed else "res://assets/ui/chest_closed.png"
	add_to(row, UiKit.icon(chest_path, 90), Vector2(560, 18))
	if Album.can_claim(save, eco, i):
		btn(row, tr("ALBUM_TAKE"), UiKit.GREEN, Vector2(534, 106), Vector2(144, 52), _claim.bind(i), 26)
	elif claimed:
		add_to(row, UiKit.label(tr("ALBUM_CLAIMED"), 24), Vector2(528, 111), Vector2(150, 36))



# ---------- 一册的卡 ----------


func _build_book() -> void:
	var eco: Dictionary = Config.eco
	var book: Dictionary = Album.books(eco)[_book]
	_heading(tr("ALBUM_BOOK_%d" % int(book["id"])))
	btn(self, tr("H_BACK"), UiKit.BLUE, Vector2(24, 30), Vector2(118, 64), _close_book, 26)
	_build_reward(book)
	var by_id: Dictionary = {}
	for sp: Dictionary in Config.species:
		by_id[sp["id"]] = sp
	var scroll := _scroll(GRID_TOP)
	var inner: Control = scroll.get_child(0)
	var ids: Array = book["cards"]
	var row_h: float = 232.0
	var col_w: float = (W - 24 - 32) / 3.0
	for n: int in ids.size():
		var cx: float = 16 + (n % 3) * col_w + col_w / 2.0
		var cell := _card_cell(by_id[ids[n]])
		add_to(inner, cell, Vector2(cx - 90, (n / 3) * row_h), Vector2(180, 200))
		Anim.pop_in(cell, 0.03 * n, 0.25)
	inner.custom_minimum_size = Vector2(W - 24, ceili(ids.size() / 3.0) * row_h + 8)


## 这一册的大奖：奖励图标一排，集齐后右边是领取按钮
func _build_reward(book: Dictionary) -> void:
	var save: Dictionary = Save.data
	var eco: Dictionary = Config.eco
	var reward: Dictionary = book["reward"]
	add(_art("panel"), Vector2(24, 110), Vector2(702, 210))
	add(UiKit.icon("res://assets/ui/chest_closed.png", 100), Vector2(38, 126))
	add(_clear_label(tr("H_GRAND_PRIZE"), 34, Color("123c79")), Vector2(150, 122), Vector2(320, 42))
	_progress(self, Vector2(150, 173), Vector2(330, 32), Album.have(save, eco, _book), book["cards"].size())
	var tool_ids: Array = save["tools"].keys()
	var slots: int = tool_ids.size() + 1
	var spacing: float = 650.0 / slots
	for index: int in slots:
		var x: float = 50.0 + index * spacing
		var icon_path: String = "res://assets/ui/coin.png" if index == 0 else HomePrize.skill_icon(tool_ids[index - 1])
		var quantity: int = int(reward["coins"]) if index == 0 else int(reward["tools"])
		add(UiKit.icon(icon_path, 48), Vector2(x + (spacing - 48) / 2, 220))
		add(_clear_label(str(quantity), 28, Color("123c79")), Vector2(x, 270), Vector2(spacing, 38))
	if Album.can_claim(save, eco, _book):
		btn(self, tr("ALBUM_TAKE"), UiKit.GREEN, Vector2(516, 145), Vector2(180, 64), _claim.bind(_book), 30)
	elif Album.is_claimed(save, _book):
		add(UiKit.label(tr("ALBUM_CLAIMED"), 28), Vector2(516, 145), Vector2(180, 64))


## 一张卡：鱼缸里的生物，名字写在木架上并按稀有度上色；没有的是剪影
func _card_cell(sp: Dictionary) -> Control:
	var owned: int = int(Save.data["cards"].get(sp["id"], 0))
	var cell := Control.new()
	cell.mouse_filter = Control.MOUSE_FILTER_PASS
	var tank := UiKit.icon("res://assets/ui/tank.png", 176)
	add_to(cell, tank, Vector2(2, 0))
	if owned == 0:
		tank.modulate = Color(0.78, 0.86, 0.95)
	var fish := UiKit.icon("res://assets/fish/%s.png" % sp["id"], 92)
	add_to(cell, fish, Vector2(44, 52))
	if owned > 0:
		Anim.wiggle(fish, 6.0, 1.8, randf())
	else:
		fish.modulate = Color(0.04, 0.14, 0.3, 0.85)
	var name_text: String = sp["name"] if owned > 0 else tr("UI_UNKNOWN")
	add_to(cell, _art("name"), Vector2(-14, 166), Vector2(208, 42))
	var fish_name := _clear_label(name_text, 27, Color.WHITE)
	fish_name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	add_to(cell, fish_name, Vector2(-10, 166), Vector2(200, 42))
	if owned == 0:
		add_to(cell, UiKit.icon("res://assets/ui/lock.png", 40), Vector2(70, 108))
	if owned > 1:
		add_to(cell, UiKit.badge("dot_red", 44), Vector2(140, 6))
		add_to(cell, UiKit.label(str(owned), 22), Vector2(140, 6), Vector2(44, 44))
	return cell


# ---------- 小工具与动作 ----------


func _clear_label(content: String, font_size: int, color: Color) -> Label:
	var label := UiKit.text(content, font_size, color)
	if color == Color.WHITE:
		label.add_theme_constant_override("outline_size", 2)
		label.add_theme_color_override("font_outline_color", Color("124981"))
	return label


func _art(part: String) -> TextureRect:
	var node := UiKit.icon("res://assets/ui/album/%s.svg" % part, 1)
	node.stretch_mode = TextureRect.STRETCH_SCALE
	return node


func _heading(text: String) -> void:
	add(_art("title"), Vector2(157, 20), Vector2(436, 84))
	var heading := _clear_label(text, 42, Color.WHITE)
	heading.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add(heading, Vector2(166, 22), Vector2(418, 76))


func _progress(parent: Control, pos: Vector2, area: Vector2, have: int, total: int) -> void:
	var bar := ProgressBar.new()
	bar.min_value = 0
	bar.max_value = maxi(1, total)
	bar.value = clampi(have, 0, maxi(1, total))
	bar.show_percentage = false
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var track := StyleBoxFlat.new()
	track.bg_color = Color("124b94")
	track.border_color = Color("a5efff")
	track.set_border_width_all(2)
	track.set_corner_radius_all(int(area.y / 2))
	var fill := StyleBoxFlat.new()
	fill.bg_color = Color("27ab25")
	fill.border_color = Color("86e74f")
	fill.set_border_width_all(2)
	fill.set_corner_radius_all(int(area.y / 2))
	bar.add_theme_stylebox_override("background", track)
	bar.add_theme_stylebox_override("fill", fill)
	add_to(parent, bar, pos, area)
	var number := _clear_label("%d/%d" % [have, total], 28, Color.WHITE)
	number.add_theme_color_override("font_outline_color", Color("083867"))
	number.add_theme_constant_override("outline_size", 3)
	add_to(parent, number, pos, area)


func _left(text: String, font: int, color: Color = Color.WHITE) -> Label:
	var l := UiKit.label(text, font, color)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	return l


## 可上下滑动的列表区，返回的容器第一个子节点用来放内容
func _scroll(top: float) -> ScrollContainer:
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.clip_contents = true
	add(scroll, Vector2(12, top), Vector2(W - 24, size.y - 14.0 - top))
	var inner := Control.new()
	# 默认会拦下滚轮和拖动，放行给外层的滚动容器
	inner.mouse_filter = Control.MOUSE_FILTER_PASS
	scroll.add_child(inner)
	return scroll


func _open_book(i: int) -> void:
	Audio.sfx(&"click")
	_book = i
	host.rebuild_page()


func _close_book() -> void:
	_book = -1
	host.rebuild_page()


func _claim(i: int) -> void:
	_after_claim(Album.claim(Save.data, Config.eco, i, Save.now()))


func _claim_final() -> void:
	_after_claim(Album.claim_final(Save.data, Config.eco, Save.now()))


func _after_claim(prizes: Array) -> void:
	if prizes.is_empty():
		return
	Save.save()
	var p := MetaPopups.prize_reveal(host, prizes, tr("H_GRAND_PRIZE"))
	p.buttons[0].pressed.connect(host.refresh_all)
