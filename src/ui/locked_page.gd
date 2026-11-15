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
		Anim.pop_in(prize, 0.3 + i * 0.08, 0.3)
		var amount: String = str(items[i][1])
		if not amount.is_empty():
			add(UiKit.label(amount, 28), pos + Vector2(-30, PRIZE + 2.0), Vector2(PRIZE + 60.0, 38))


func _on_back() -> void:
	host.go_tab(HomeScreen.TAB_MAIN)
