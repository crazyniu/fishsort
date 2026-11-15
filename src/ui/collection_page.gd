class_name CollectionPage
extends HomePage
## 图鉴页：60 张收藏卡按稀有度分档，木架鱼缸陈列。来源见 docs/01 §5.4。

const RARITIES: Array[String] = ["common", "uncommon", "rare", "epic", "legend"]
## 各稀有度页签选中时的底色（五档各一种颜色，一眼分得清）
const RARITY_PIECES: Array[String] = [
	"btn_blue", "btn_green", "btn_purple", "btn_red", "btn_orange"
]
const TABS_Y := 18.0
const TABS_H := 56.0
const PROGRESS_Y := 90.0
const LIST_TOP := 134.0

## 选中的稀有度。页面每次重建都是新实例，状态放静态变量里才不会点了又弹回「普通」
static var _rarity: int = 0


func build() -> void:
	# 深海底板托住整页内容，背景图只露在外圈
	var deep_h: float = size.y - 14.0
	add(UiKit.piece("deep"), Vector2(12, 4), Vector2(W - 24, deep_h))
	_build_tabs()
	var cards: Dictionary = Save.data["cards"]
	var pool: Array = Config.species.filter(
		func(sp: Dictionary) -> bool: return sp["rarity"] == RARITIES[_rarity]
	)
	var have: int = pool.filter(func(sp: Dictionary) -> bool: return cards.has(sp["id"])).size()
	_build_progress(have, pool.size())

	# 鱼缸一排三个摆在木架上，可上下滑动
	var list_top: float = LIST_TOP
	var list_h: float = deep_h - list_top - 4.0
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.clip_contents = true
	add(scroll, Vector2(12, list_top), Vector2(W - 24, list_h))
	var inner := Control.new()
	# 默认会拦下滚轮和拖动，放行给外层的滚动容器
	inner.mouse_filter = Control.MOUSE_FILTER_PASS
	scroll.add_child(inner)
	var row_h: float = 214.0
	var col_w: float = (W - 24 - 32) / 3.0
	for r: int in ceili(pool.size() / 3.0):
		add_to(inner, UiKit.piece("shelf"), Vector2(10, r * row_h + 160), Vector2(W - 44, 40))
	for n: int in pool.size():
		var sp: Dictionary = pool[n]
		var owned: int = int(cards.get(sp["id"], 0))
		var cx: float = 16 + (n % 3) * col_w + col_w / 2.0
		var top: float = (n / 3) * row_h
		var cell := Control.new()
		cell.mouse_filter = Control.MOUSE_FILTER_PASS
		add_to(inner, cell, Vector2(cx - 90, top), Vector2(180, 200))
		var tank := UiKit.icon("res://assets/ui/tank.png", 176)
		add_to(cell, tank, Vector2(2, 0))
		if owned == 0:
			tank.modulate = Color(0.78, 0.86, 0.95)
		var art_path: String = "res://assets/fish/%s.png" % sp["id"]
		if ResourceLoader.exists(art_path):
			var fish := UiKit.icon(art_path, 92)
			add_to(cell, fish, Vector2(44, 52))
			if owned > 0:
				Anim.wiggle(fish, 6.0, 1.8, randf())
			else:
				fish.modulate = Color(0.04, 0.14, 0.3, 0.85)
		else:
			add_to(cell, UiKit.label("?", 72), Vector2(40, 40), Vector2(100, 110))
		var name_text: String = sp["name"] if owned > 0 else tr("UI_UNKNOWN")
		# 名字写在木架上
		add_to(cell, UiKit.label(name_text, 24), Vector2(-10, 162), Vector2(200, 34))
		if owned > 1:
			add_to(cell, UiKit.badge("dot_red", 44), Vector2(140, 6))
			add_to(cell, UiKit.label(str(owned), 22), Vector2(140, 6), Vector2(44, 44))
		if n < 12:
			Anim.pop_in(cell, 0.03 * n, 0.25)
	inner.custom_minimum_size = Vector2(W - 24, ceili(pool.size() / 3.0) * row_h + 8)


## 稀有度页签：不要深色轨道和白块，选中的是该档颜色的按钮，其余只是字
func _build_tabs() -> void:
	var seg_w: float = (W - 64.0) / RARITIES.size()
	for i: int in RARITIES.size():
		var text: String = tr("UI_RARITY_" + RARITIES[i].to_upper())
		var pos := Vector2(32.0 + i * seg_w, TABS_Y)
		var area := Vector2(seg_w, TABS_H)
		if i == _rarity:
			var on := UiKit.piece(RARITY_PIECES[i])
			add(on, pos + Vector2(3, 0), area - Vector2(6, 0))
			Anim.bounce(on, 1.06, 0.2)
			add(UiKit.label(text, 26), pos, area)
		else:
			var l := UiKit.label(text, 24)
			l.modulate = Color(1, 1, 1, 0.78)
			add(l, pos, area)
			var hot := UiKit.hotspot(pos, area)
			hot.pressed.connect(_on_rarity.bind(i))
			Anim.press_fx(hot)
			add_child(hot)


## 收集进度：左边文字，右边一条细进度条
func _build_progress(have: int, total: int) -> void:
	var bar_x: float = 270.0
	var bar_w: float = W - 32.0 - bar_x
	add(
		UiKit.label(tr("UI_COLLECTED") % [have, total], 24),
		Vector2(36, PROGRESS_Y),
		Vector2(230, 32)
	)
	add(UiKit.piece("chip"), Vector2(bar_x, PROGRESS_Y + 4.0), Vector2(bar_w, 24))
	if have > 0 and total > 0:
		var fill_w: float = maxf(26.0, bar_w * have / total)
		add(UiKit.piece("fill"), Vector2(bar_x, PROGRESS_Y + 4.0), Vector2(fill_w, 24))


func _on_rarity(i: int) -> void:
	_rarity = i
	host.rebuild_page()
