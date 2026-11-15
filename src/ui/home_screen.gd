class_name HomeScreen
extends Control
## 主界面：顶栏 + 中间页面 + 底部五个页签（商店 · 抽奖 · 主页 · 排行 · 图鉴）。
## 数据与动作全部走 HomeModel，真实逻辑接入时只换那一个文件。

enum { TAB_SHOP, TAB_WHEEL, TAB_MAIN, TAB_RANK, TAB_COLLECTION }

const W := 750.0
const BAR_Y := 16.0
const BAR_H := 96.0
const TOP_H := 124.0
const TABS_H := 150.0
const TAB_KEYS: Array[String] = [
	"UI_TAB_SHOP", "H_TAB_WHEEL", "UI_TAB_MAIN", "UI_TAB_RANK", "UI_TAB_COLLECTION"
]
const TAB_ICONS: Array[String] = [
	"res://assets/ui/tab_shop.png",
	"res://assets/kit/ic_wheel.png",
	"res://assets/ui/tab_main.png",
	"res://assets/ui/tab_rank.png",
	"res://assets/ui/tab_collection.png",
]
## 每个页签对应的功能开放项，空串 = 始终开放
const TAB_FEATURES: Array[String] = ["shop", "wheel", "", "rank", "collection"]

var start_tab: int = TAB_MAIN
var model: HomeModel

var _tab: int = TAB_MAIN
var _stage: Control
var _page: Control
var _tab_icons: Array[Control] = []
var _tab_marks: Array[Control] = []
var _tab_labels: Array[Label] = []
var _coin_label: Label
var _life_label: Label
var _life_timer: Label
var _coin_shown: int = -1
var _carry: float = 0.0


func _ready() -> void:
	model = HomeModel.get_inst()
	_tab = start_tab
	resized.connect(_build)
	_build()


func _process(delta: float) -> void:
	_carry = model.tick(delta, _carry)
	_refresh_lives()


func _build() -> void:
	for c: Node in get_children():
		c.queue_free()
	_coin_shown = -1
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
	return HomePage.add_to(parent, node, pos, area)


# ---------- 对页面开放的工具 ----------


func toast(text: String) -> void:
	var l := UiKit.label(text, 30)
	l.z_index = 90
	_add(_stage, l, Vector2(0, size.y - TABS_H - 70), Vector2(W, 50))
	Anim.pop_in(l, 0.0, 0.2)
	var tw: Tween = l.create_tween()
	tw.tween_interval(1.5)
	tw.tween_property(l, "modulate:a", 0.0, 0.3)
	tw.tween_callback(l.queue_free)


## 数据变化后刷新顶栏（金币数字滚动、生命）
func refresh_top() -> void:
	var value: int = model.coins()
	if _coin_shown >= 0 and _coin_shown != value:
		Anim.count_to(_coin_label, _coin_shown, value)
	else:
		_coin_label.text = str(value)
	_coin_shown = value
	_refresh_lives()


## 重建当前页面（不带动画）
func rebuild_page() -> void:
	_show_page(false)


func go_tab(i: int) -> void:
	_on_tab(i)


## 点击某个受功能开放限制的入口：没开放就提示并返回 false
func check_unlocked(feature: String) -> bool:
	if model.is_unlocked(feature):
		return true
	Audio.sfx(&"error")
	toast(tr("H_UNLOCKS_AT") % model.unlock_level(feature))
	return false


func start_level() -> void:
	if not model.can_start():
		HomePopups.lives(self, refresh_top)
		return
	App.inst.go_game()


# ---------- 顶栏 ----------


func _build_top() -> void:
	var mid: float = BAR_Y + BAR_H / 2.0
	_add(_stage, UiKit.piece("glass"), Vector2(16, BAR_Y), Vector2(W - 32, BAR_H))
	var info: Dictionary = model.profile()
	var avatar := UiKit.icon(str(info["avatar"]), 68)
	_add(_stage, avatar, Vector2(30, mid - 34))
	_hot(Vector2(24, mid - 40), Vector2(80, 80), func() -> void: MetaPopups.profile(self))
	# 金币：胶囊 + 右端的加号，点了去商店
	var coin: Dictionary = UiKit.capsule("res://assets/ui/coin.png", 240)
	_add(_stage, coin["box"], Vector2(120, mid - 28))
	_coin_label = coin["label"]
	_coin_label.size.x -= 36.0
	var plus := UiKit.badge("plus", 44)
	_add(_stage, plus, Vector2(120 + 240 - 50, mid - 22))
	Anim.pulse(plus, 1.12, 1.4)
	_hot(Vector2(120, mid - 30), Vector2(240, 60), go_tab.bind(TAB_SHOP))
	# 生命：心形 + 数量 + 恢复倒计时，点了开生命弹窗
	var life: Dictionary = UiKit.capsule("res://assets/kit/heart.png", 220)
	_add(_stage, life["box"], Vector2(384, mid - 28))
	_life_label = life["label"]
	_life_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_life_label.size.x = 50.0
	_life_timer = UiKit.label("", 26, UiKit.GOLD)
	_life_timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_life_timer.position = Vector2(384 + 108, mid - 28)
	_life_timer.size = Vector2(104, 56)
	_stage.add_child(_life_timer)
	_hot(
		Vector2(384, mid - 30),
		Vector2(220, 60),
		func() -> void: HomePopups.lives(self, refresh_top)
	)
	var gear := UiKit.badge("btn_gear", 68)
	_add(_stage, gear, Vector2(W - 16 - 14 - 68, mid - 34))
	_hot(
		Vector2(W - 16 - 14 - 68 - 8, mid - 42),
		Vector2(84, 84),
		func() -> void: MetaPopups.settings(self, "home", Callable(), Callable(), _build)
	)
	refresh_top()


func _hot(pos: Vector2, area: Vector2, action: Callable) -> void:
	var hot := UiKit.hotspot(pos, area)
	hot.pressed.connect(action)
	Anim.press_fx(hot)
	_stage.add_child(hot)


func _refresh_lives() -> void:
	if _life_label == null:
		return
	if model.infinite_secs() > 0:
		_life_label.text = "∞"
		_life_timer.text = HomePopups._fmt_time(model.infinite_secs())
		return
	_life_label.text = str(mini(model.lives(), 99))
	var next: int = model.next_life_secs()
	_life_timer.text = HomePopups._fmt_time(next) if next > 0 else ""


# ---------- 底部页签 ----------


## 一条实色蓝底，选中的页签是抬高的亮色块并显示文字，其余只显示图标；未开放的置灰
func _build_tabs() -> void:
	var y: float = size.y - TABS_H
	_add(_stage, UiKit.piece("fade"), Vector2(-400, y - 40), Vector2(W + 800, TABS_H + 40))
	_add(_stage, UiKit.piece("glass"), Vector2(8, y + 34), Vector2(W - 16, TABS_H - 42))
	_tab_icons.clear()
	_tab_marks.clear()
	_tab_labels.clear()
	var tab_w: float = (W - 32) / TAB_KEYS.size()
	for i: int in TAB_KEYS.size():
		var x: float = 16 + i * tab_w
		var locked: bool = not _tab_open(i)
		var mark := UiKit.piece("tab_on")
		_add(_stage, mark, Vector2(x + 2, y + 8), Vector2(tab_w - 4, TABS_H - 20))
		_tab_marks.append(mark)
		if i > 0:
			var line := ColorRect.new()
			line.color = Color("1B4FA6")
			line.mouse_filter = Control.MOUSE_FILTER_IGNORE
			_add(_stage, line, Vector2(x - 1, y + 50), Vector2(2, TABS_H - 76))
		var icon := UiKit.icon(TAB_ICONS[i], 76)
		_add(_stage, icon, Vector2(x + (tab_w - 76) / 2.0, y + 46))
		_tab_icons.append(icon)
		if locked:
			icon.modulate = Color(0.5, 0.58, 0.7)
			var lock := UiKit.icon("res://assets/ui/lock.png", 34)
			lock.position = Vector2(46, 42)
			icon.add_child(lock)
		var text := UiKit.label(tr(TAB_KEYS[i]), 24)
		_add(_stage, text, Vector2(x, y + 96), Vector2(tab_w, 32))
		_tab_labels.append(text)
		var hot := UiKit.hotspot(Vector2(x, y), Vector2(tab_w, TABS_H))
		hot.pressed.connect(_on_tab.bind(i))
		_stage.add_child(hot)
	_mark_tabs()


func _tab_open(i: int) -> bool:
	return TAB_FEATURES[i].is_empty() or model.is_unlocked(TAB_FEATURES[i])


func _mark_tabs() -> void:
	var y: float = size.y - TABS_H
	for i: int in _tab_marks.size():
		var on: bool = i == _tab
		_tab_marks[i].visible = on
		_tab_labels[i].visible = on
		# 选中的图标放大并上浮，给文字让出位置
		var icon: Control = _tab_icons[i]
		var tw: Tween = icon.create_tween().set_parallel()
		(
			tw
			. tween_property(icon, "scale", Vector2.ONE * (1.15 if on else 1.0), 0.18)
			. set_trans(Tween.TRANS_BACK)
			. set_ease(Tween.EASE_OUT)
		)
		tw.tween_property(icon, "position:y", y + (16.0 if on else 46.0), 0.18)
		if on:
			Anim.bounce(_tab_labels[i], 1.2)


func _on_tab(i: int) -> void:
	if i == _tab:
		return
	if not _tab_open(i):
		Audio.sfx(&"error")
		Anim.shake(_tab_icons[i], 6.0)
		toast(tr("H_UNLOCKS_AT") % model.unlock_level(TAB_FEATURES[i]))
		return
	Audio.sfx(&"click")
	var from_right: bool = i > _tab
	_tab = i
	_mark_tabs()
	_show_page(true, from_right)


func _show_page(animate: bool, from_right: bool = true) -> void:
	if _page != null and is_instance_valid(_page):
		Anim.fade_out_free(_page, 0.12)
	match _tab:
		TAB_SHOP:
			_page = ShopPage.new()
		TAB_WHEEL:
			_page = WheelPage.new()
		TAB_MAIN:
			_page = MainPage.new()
		TAB_RANK:
			_page = RankPage.new()
		_:
			_page = CollectionPage.new()
	var page: HomePage = _page as HomePage
	page.host = self
	page.size = Vector2(W, size.y - TOP_H - TABS_H)
	_add(_stage, page, Vector2(0, TOP_H))
	_stage.move_child(page, 0)
	page.build()
	if animate:
		# 新页面从切换方向滑入
		_page.position.x = 120.0 if from_right else -120.0
		_page.modulate.a = 0.0
		var tw: Tween = _page.create_tween().set_parallel()
		tw.tween_property(_page, "position:x", 0.0, 0.22).set_trans(Tween.TRANS_QUAD).set_ease(
			Tween.EASE_OUT
		)
		tw.tween_property(_page, "modulate:a", 1.0, 0.22)
