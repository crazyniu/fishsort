class_name LockedPage
extends HomePage
## 还没开放的页签点进来看到的页面：标题、功能的大图标、「第 N 关解锁」，
## 下面一块「大奖」预览，告诉玩家开放后能拿到什么（docs/01 §5.3）。
## 不用一闪而过的小提示，直接在页面里说清楚。

const PRIZE := 96.0

var feature: String = ""
var feature_title: String = ""
var icon_path: String = ""
var unlock_at: int = 0
## 已到开放关、但页面还没做完
var coming_soon: bool = false
## 子页面（从主页入口进来的）左上角放返回键
var with_back: bool = false


func build() -> void:
	if feature == "homeBase" or feature == "daily":
		_build_preview()
		return
	title(feature_title)
	if with_back:
		btn(self, tr("H_BACK"), UiKit.BLUE, Vector2(24, 24), Vector2(150, 70), _on_back, 30)
	var mid: float = size.y * 0.36
	var glow := UiKit.badge("fx_glow", 520)
	glow.modulate = Color(1, 1, 1, 0.55)
	add(glow, Vector2((W - 520.0) / 2.0, mid - 260.0))
	var icon := UiKit.icon(icon_path, 280)
	add(icon, Vector2((W - 280.0) / 2.0, mid - 140.0), Vector2(280, 280))
	Anim.pop_in(icon, 0.05, 0.4)
	Anim.bob(icon, 10.0, 3.2)
	if not coming_soon:
		var lock := UiKit.icon("res://assets/ui/lock_skill.png", 96)
		add(lock, Vector2(W / 2.0 + 70.0, mid + 60.0))
		Anim.pop_in(lock, 0.2, 0.3)
	var line: String = tr("H_COMING_SOON") if coming_soon else tr("H_UNLOCKS_AT") % unlock_at
	var text := UiKit.label(line, 52, UiKit.GOLD)
	add(text, Vector2(0, mid + 180.0), Vector2(W, 72))
	Anim.pop_in(text, 0.15, 0.3)
	_build_prizes(mid + 280.0)


## 大奖预览：一块深色底板，标题 + 一排奖励图标，图标下面是数量
func _build_prizes(top: float) -> void:
	var cfg: Dictionary = GameCfg.d()["lockedPrizes"].get(feature, {})
	if cfg.is_empty():
		return
	var items: Array = cfg["items"]
	var panel_w: float = 560.0
	var x: float = (W - panel_w) / 2.0
	var panel := UiKit.piece("deep")
	add(panel, Vector2(x, top), Vector2(panel_w, 220))
	Anim.pop_in(panel, 0.25, 0.3)
	add(UiKit.label(tr(cfg["title"]), 34, UiKit.GOLD), Vector2(x, top + 12.0), Vector2(panel_w, 44))
	var gap: float = 44.0
	var row_w: float = items.size() * PRIZE + (items.size() - 1) * gap
	for i: int in items.size():
		var pos := Vector2((W - row_w) / 2.0 + i * (PRIZE + gap), top + 66.0)
		var prize := UiKit.icon(str(items[i][0]), PRIZE)
		add(prize, pos, Vector2(PRIZE, PRIZE))
		# 第三项是图标染色（占位图标用）
		if items[i].size() > 2:
			prize.modulate = Color(str(items[i][2]))
		Anim.pop_in(prize, 0.3 + i * 0.08, 0.3)
		var amount: String = tr(str(items[i][1]))
		if not amount.is_empty():
			add(UiKit.label(amount, 28), pos + Vector2(-30, PRIZE + 2.0), Vector2(PRIZE + 60.0, 38))


func _on_back() -> void:
	host.go_tab(HomeScreen.TAB_MAIN)


## 家园与每日挑战仍为预告页，开放条件和奖励来自现有配置。
func _build_preview() -> void:
	var scene_path: String = "res://assets/ui/daily_scene.png" if feature == "daily" else "res://assets/ui/bay_scene.png"
	var scene := UiKit.icon(scene_path, W)
	scene.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	add(scene, Vector2.ZERO, size)
	_bay_panel(Rect2(154, 32, 442, 100), Color("0877DD"), Color("85EFFF"))
	add(UiKit.label(feature_title, 56), Vector2(154, 32), Vector2(442, 100))
	var status_y: float = size.y * 0.69
	var line: String = tr("H_COMING_SOON") if coming_soon else tr("H_UNLOCKS_AT") % unlock_at
	_bay_panel(Rect2(108, status_y, 534, 88), Color("075CCA"), UiKit.GOLD)
	var left: float = 124.0
	if not coming_soon:
		add(UiKit.icon("res://assets/ui/lock_skill.png", 60), Vector2(132, status_y + 14))
		left = 196.0
	var label := UiKit.label(line, 38)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add(label, Vector2(left, status_y + 4), Vector2(626 - left, 80))
	var cfg: Dictionary = GameCfg.d()["lockedPrizes"].get(feature, {})
	if cfg.is_empty():
		return
	var top: float = status_y + 112.0
	var panel_h: float = minf(192.0, size.y - top - 18.0)
	_bay_panel(Rect2(72, top, 606, panel_h), Color("B8EBFF"), Color("68CFFF"))
	add(UiKit.label(tr(cfg["title"]), 30), Vector2(88, top + 6), Vector2(574, 44))
	var items: Array = cfg["items"]
	var side: float = minf(98.0, panel_h - 66.0)
	var slot: float = 540.0 / maxi(1, items.size())
	for i: int in items.size():
		var pos := Vector2(105 + slot * i + (slot - side) / 2, top + 55)
		add(UiKit.icon(str(items[i][0]), side), pos, Vector2(side, side))
		var amount: String = str(items[i][1])
		if not amount.is_empty():
			add(UiKit.label(amount, 24), pos + Vector2(-20, side - 8), Vector2(side + 40, 32))


func _bay_panel(rect: Rect2, color: Color, rim: Color) -> void:
	var panel := Panel.new()
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.border_color = rim
	style.set_border_width_all(4)
	style.set_corner_radius_all(38)
	style.shadow_color = Color(0.015, 0.16, 0.4, 0.4)
	style.shadow_size = 5
	style.shadow_offset = Vector2(0, 5)
	panel.add_theme_stylebox_override("panel", style)
	add(panel, rect.position, rect.size)
