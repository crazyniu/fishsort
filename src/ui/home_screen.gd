class_name HomeScreen
extends Control
## 主界面：顶栏 + 中间页面 + 底部五个页签（商店 · 家园 · 主页 · 图鉴 · 每日挑战）。
## 数据与动作全部走 HomeModel，真实逻辑接入时只换那一个文件。

## 底栏五个页签：商店、家园、主页、图鉴、每日挑战（docs/01 §5.3）。
## 抽奖和排行不占页签，是从主页入口进去的子页面；选关也从主页入口打开
enum { TAB_SHOP, TAB_BASE, TAB_MAIN, TAB_COLLECTION, TAB_DAILY, TAB_WHEEL, TAB_RANK }

const W := 750.0
const BAR_Y := 16.0
const BAR_H := 96.0
const TOP_H := 124.0
const TABS_H := 150.0
const TAB_KEYS: Array[String] = [
	"UI_TAB_SHOP", "UI_TAB_BASE", "UI_TAB_MAIN", "UI_TAB_COLLECTION", "UI_TAB_DAILY"
]
const TAB_ICONS: Array[String] = [
	"res://assets/ui/tab_shop.png",
	"res://assets/ui/tab_levels.png",
	"res://assets/ui/tab_main.png",
	"res://assets/ui/tab_collection.png",
	"res://assets/ui/star.png",
]
## 每个页签对应的功能开放项，空串 = 始终开放
const TAB_FEATURES: Array[String] = ["", "homeBase", "", "album", "daily", "wheel", "rank"]
## 已经排了开放关、但页面还没做的功能：开放后先显示「即将开放」
const COMING_SOON: Array[String] = ["homeBase", "daily"]

var start_tab: int = TAB_MAIN
var model: HomeModel

var _tab: int = TAB_MAIN
var _stage: Control
var _page: Control
var _top_root: Control
var _tab_icons: Array[Control] = []
var _tab_marks: Array[Control] = []
var _tab_labels: Array[Label] = []
var _coin_label: Label
var _life_label: Label
var _life_timer: Label
var _life_icon: TextureRect
var _coin_shown: int = -1
var _carry: float = 0.0


func _ready() -> void:
	model = HomeModel.get_inst()
	_tab = start_tab
	resized.connect(_build)
	_build()


func _process(delta: float) -> void:
	# 生命倒计时由核心按真实时间算，这里每秒刷新一次显示
	_carry += delta
	if _carry >= 1.0:
		_carry = 0.0
		_refresh_lives()


func _build() -> void:
	for c: Node in get_children():
		c.queue_free()
	_coin_shown = -1
	var bg := TextureRect.new()
	bg.texture = UiKit.tex(HomeDeco.background_path())
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
	# 提示放在画面中间偏上，不压住底部的开始按钮和页签
	_add(_stage, l, Vector2(0, size.y * 0.42), Vector2(W, 50))
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


## 领了奖之后整页重建：金币、页签红点、当前页面一起刷新
func refresh_all() -> void:
	_build()


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


## level > 0：重玩一个已通过的关（奖励按重玩规则，由 Settle 把关）；0 = 当前关
func start_level(level: int = 0) -> void:
	var id: int = level if level > 0 else model.level()
	if not Lives.can_start(Save.data, Config.eco, id, Save.now()):
		HomePopups.lives(self, refresh_top)
		return
	App.inst.go_game(level)


# ---------- 顶栏 ----------


func _build_top() -> void:
	var mid: float = BAR_Y + BAR_H / 2.0
	# 顶栏单独放一个容器：只有主页显示，其它页面保持干净
	_top_root = Control.new()
	_top_root.size = Vector2(W, TOP_H)
	_top_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_stage.add_child(_top_root)
	# 没有整条底板：头像、金币、生命、设置各自悬浮，只在最上面垫一层淡渐变
	_add(_top_root, UiKit.top_scrim(W + 800, BAR_Y + BAR_H + 50.0), Vector2(-400, 0))
	var info: Dictionary = model.profile()
	var avatar := UiKit.icon(str(info["avatar"]), 68)
	_add(_top_root, avatar, Vector2(30, mid - 34))
	_hot(Vector2(24, mid - 40), Vector2(80, 80), func() -> void: MetaPopups.profile(self))
	# 金币：胶囊 + 右端的加号，点了去商店
	var coin: Dictionary = UiKit.capsule("res://assets/ui/coin.png", 240)
	_add(_top_root, coin["box"], Vector2(120, mid - 28))
	_coin_label = coin["label"]
	_coin_label.size.x -= 36.0
	var plus := UiKit.badge("plus", 44)
	_add(_top_root, plus, Vector2(120 + 240 - 50, mid - 22))
	Anim.pulse(plus, 1.12, 1.4)
	_hot(Vector2(120, mid - 30), Vector2(240, 60), go_tab.bind(TAB_SHOP))
	# 生命：心形 + 数量 + 恢复倒计时，点了开生命弹窗
	var life: Dictionary = UiKit.capsule("res://assets/ui/heart.png", 220)
	_add(_top_root, life["box"], Vector2(384, mid - 28))
	_life_label = life["label"]
	_life_icon = (life["box"] as Control).get_child(1)
	_life_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	_life_label.size.x = 50.0
	_life_timer = UiKit.label("", 26, UiKit.GOLD)
	_life_timer.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_life_timer.position = Vector2(384 + 108, mid - 28)
	_life_timer.size = Vector2(104, 56)
	_top_root.add_child(_life_timer)
	_hot(
		Vector2(384, mid - 30),
		Vector2(220, 60),
		func() -> void: HomePopups.lives(self, refresh_top)
	)
	var gear := UiKit.badge("btn_gear", 68)
	_add(_top_root, gear, Vector2(W - 16 - 14 - 68, mid - 34))
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
	_top_root.add_child(hot)


func _refresh_lives() -> void:
	if _life_label == null:
		return
	if model.infinite_secs() > 0:
		_life_icon.texture = UiKit.tex("res://assets/ui/heart_inf.png")
		# 心形图标自带 ∞，数字位置直接显示剩余时间，不再重复写 ∞
		_life_label.text = HomePopups._fmt_time(model.infinite_secs())
		_life_timer.text = ""
		return
	_life_icon.texture = UiKit.tex("res://assets/ui/heart.png")
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
		elif TAB_FEATURES[i] == "album" and Album.claimable(Save.data, Config.eco) > 0:
			# 图鉴有大奖可领：页签上亮红点
			var dot := UiKit.badge("dot_red", 30)
			dot.position = Vector2(56, -4)
			icon.add_child(dot)
		var text := UiKit.label(tr(TAB_KEYS[i]), 24)
		_add(_stage, text, Vector2(x, y + 96), Vector2(tab_w, 32))
		_tab_labels.append(text)
		var hot := UiKit.hotspot(Vector2(x, y), Vector2(tab_w, TABS_H))
		hot.pressed.connect(_on_tab.bind(i))
		_stage.add_child(hot)
	_mark_tabs()


func _tab_open(i: int) -> bool:
	var feature: String = TAB_FEATURES[i]
	if COMING_SOON.has(feature):
		return false
	return feature.is_empty() or model.is_unlocked(feature)


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
	Audio.sfx(&"click")
	var from_right: bool = i > _tab
	_tab = i
	_mark_tabs()
	_show_page(true, from_right)


func _make_page(tab: int) -> HomePage:
	match tab:
		TAB_SHOP:
			return ShopPage.new()
		TAB_WHEEL:
			return WheelPage.new()
		TAB_RANK:
			return RankPage.new()
		TAB_COLLECTION:
			return CollectionPage.new()
	return MainPage.new()


## 没开放的页签：页面里是大图标、「第 N 关解锁」和开放后能拿到的大奖预览
func _locked_page(tab: int) -> HomePage:
	var feature: String = TAB_FEATURES[tab]
	var page := LockedPage.new()
	page.feature = feature
	if tab < TAB_KEYS.size():
		page.feature_title = tr(TAB_KEYS[tab])
		page.icon_path = TAB_ICONS[tab]
	else:
		page.feature_title = HomePopups.feature_name(feature)
		page.icon_path = HomePopups.feature_icon(feature)
		page.with_back = true
	page.unlock_at = model.unlock_level(feature)
	page.coming_soon = COMING_SOON.has(feature) and model.is_unlocked(feature)
	return page


func _show_page(animate: bool, from_right: bool = true) -> void:
	if _page != null and is_instance_valid(_page):
		Anim.fade_out_free(_page, 0.12)
	if not _tab_open(_tab):
		_page = _locked_page(_tab)
	else:
		_page = _make_page(_tab)
	var page: HomePage = _page as HomePage
	page.host = self
	# 金币、生命、设置只在主页出现；其它页面不要顶栏，内容上移占满
	var with_top: bool = _tab == TAB_MAIN
	_top_root.visible = with_top
	var top_h: float = TOP_H if with_top else 0.0
	page.size = Vector2(W, size.y - top_h - TABS_H)
	_add(_stage, page, Vector2(0, top_h))
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
