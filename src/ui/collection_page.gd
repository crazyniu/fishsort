class_name CollectionPage
extends HomePage
## 图鉴页（docs/01 §5.4）：60 张收藏卡分成几册，每册按关开放。
## 首页是册子列表和总进度；点一册进去看这一册的卡，集齐领大奖；全部集齐领终极大奖。

const LIST_TOP := 190.0
const ROW_H := 158.0
const GRID_TOP := 250.0

## 正在看的册子，-1 = 册子列表。页面每次重建都是新实例，状态放静态变量里
static var _book: int = -1


func build() -> void:
	add(UiKit.piece("deep"), Vector2(12, 4), Vector2(W - 24, size.y - 14.0))
	if _book < 0:
		_build_list()
	else:
		_build_book()


# ---------- 册子列表 ----------


func _build_list() -> void:
	title(tr("UI_TAB_COLLECTION"))
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
	add(UiKit.piece("chip"), Vector2(bar_x, 108), Vector2(bar_w, 28))
	if have > 0:
		add(UiKit.piece("fill"), Vector2(bar_x, 108), Vector2(maxf(28.0, bar_w * have / total), 28))
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
	var row := UiKit.piece("popup_row")
	row.mouse_filter = Control.MOUSE_FILTER_PASS
	add_to(inner, row, Vector2(14, i * ROW_H + 6.0), Vector2(W - 52, ROW_H - 12.0))
	# 封面：这一册最稀有的那张（列表最后一张）
	var cover := UiKit.icon("res://assets/ui/tank.png", 120)
	add_to(row, cover, Vector2(14, 12))
	var art := UiKit.icon("res://assets/fish/%s.png" % cards[cards.size() - 1], 64)
	add_to(row, art, Vector2(42, 46))
	add_to(
		row, _left(tr("ALBUM_BOOK_%d" % int(book["id"])), 34), Vector2(152, 22), Vector2(330, 46)
	)
	if not open:
		cover.modulate = Color(0.6, 0.68, 0.8)
		art.modulate = Color(0.04, 0.14, 0.3, 0.85)
		var lock := UiKit.icon("res://assets/ui/lock.png", 56)
		add_to(row, lock, Vector2(W - 52 - 86.0, 40))
		var at := _left(tr("H_UNLOCKS_AT") % int(book["unlock"]), 26, UiKit.GOLD)
		add_to(row, at, Vector2(152, 80), Vector2(330, 36))
		return
	add_to(row, UiKit.piece("chip"), Vector2(152, 86), Vector2(250, 26))
	if have > 0:
		var fill_w: float = maxf(26.0, 250.0 * have / cards.size())
		add_to(row, UiKit.piece("fill"), Vector2(152, 86), Vector2(fill_w, 26))
	add_to(row, UiKit.label("%d/%d" % [have, cards.size()], 24), Vector2(410, 80), Vector2(80, 36))
	var hot := UiKit.hotspot(Vector2.ZERO, row.size)
	hot.mouse_filter = Control.MOUSE_FILTER_PASS
	hot.pressed.connect(_open_book.bind(i))
	row.add_child(hot)
	var right := Vector2(W - 52 - 178.0, 38)
	if Album.can_claim(save, eco, i):
		var take := btn(
			row, tr("ALBUM_TAKE"), UiKit.GREEN, right, Vector2(160, 70), _claim.bind(i), 30
		)
		Anim.pulse(take, 1.06, 0.9)
	elif Album.is_claimed(save, i):
		add_to(row, UiKit.label(tr("ALBUM_CLAIMED"), 26, UiKit.GOLD), right, Vector2(160, 70))
	else:
		add_to(row, UiKit.icon("res://assets/ui/chest_closed.png", 76), right + Vector2(60, -4))
	if i < 5:
		Anim.pop_in(row, 0.05 * i, 0.25)


# ---------- 一册的卡 ----------


func _build_book() -> void:
	var eco: Dictionary = Config.eco
	var book: Dictionary = Album.books(eco)[_book]
	title(tr("ALBUM_BOOK_%d" % int(book["id"])))
	btn(self, tr("H_BACK"), UiKit.BLUE, Vector2(24, 24), Vector2(150, 70), _close_book, 30)
	_build_reward(book)
	var by_id: Dictionary = {}
	for sp: Dictionary in Config.species:
		by_id[sp["id"]] = sp
	var scroll := _scroll(GRID_TOP)
	var inner: Control = scroll.get_child(0)
	var ids: Array = book["cards"]
	var row_h: float = 214.0
	var col_w: float = (W - 24 - 32) / 3.0
	for r: int in ceili(ids.size() / 3.0):
		add_to(inner, UiKit.piece("shelf"), Vector2(10, r * row_h + 160), Vector2(W - 44, 40))
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
	add(UiKit.piece("popup_row"), Vector2(26, 112), Vector2(W - 52, 120))
	add(_left(tr("H_GRAND_PRIZE"), 28, UiKit.GOLD), Vector2(48, 152), Vector2(110, 40))
	var x: float = 160.0
	add(UiKit.icon("res://assets/ui/coin.png", 64), Vector2(x, 126))
	add(UiKit.label(str(int(reward["coins"])), 24), Vector2(x - 18, 188), Vector2(100, 34))
	for id: String in save["tools"]:
		x += 84.0
		add(UiKit.icon(HomePrize.skill_icon(id), 64), Vector2(x, 126))
		add(UiKit.label("×%d" % int(reward["tools"]), 24), Vector2(x - 18, 188), Vector2(100, 34))
	var right := Vector2(W - 52 - 150.0, 138)
	if Album.can_claim(save, eco, _book):
		var take := btn(
			self, tr("ALBUM_TAKE"), UiKit.GREEN, right, Vector2(160, 70), _claim.bind(_book), 30
		)
		Anim.pulse(take, 1.06, 0.9)
	elif Album.is_claimed(save, _book):
		add(UiKit.label(tr("ALBUM_CLAIMED"), 26, UiKit.GOLD), right, Vector2(160, 70))
	else:
		var cards: Array = book["cards"]
		var text: String = "%d/%d" % [Album.have(save, eco, _book), cards.size()]
		add(UiKit.label(text, 34), right, Vector2(160, 70))


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
	var tint: Color = HomePrize.RARITY_COLORS[sp["rarity"]] if owned > 0 else Color.WHITE
	add_to(cell, UiKit.label(name_text, 24, tint), Vector2(-10, 162), Vector2(200, 34))
	if owned > 1:
		add_to(cell, UiKit.badge("dot_red", 44), Vector2(140, 6))
		add_to(cell, UiKit.label(str(owned), 22), Vector2(140, 6), Vector2(44, 44))
	return cell


# ---------- 小工具与动作 ----------


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
