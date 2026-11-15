class_name LockedPage
extends HomePage
## 还没开放的页签点进来看到的页面：标题、功能的大图标、「第 N 关解锁」。
## 不用一闪而过的小提示，直接在页面里说清楚。

var feature_title: String = ""
var icon_path: String = ""
var unlock_at: int = 0


func build() -> void:
	title(feature_title)
	var mid: float = size.y * 0.42
	var glow := UiKit.badge("fx_glow", 520)
	glow.modulate = Color(1, 1, 1, 0.55)
	add(glow, Vector2((W - 520.0) / 2.0, mid - 260.0))
	var icon := UiKit.icon(icon_path, 280)
	add(icon, Vector2((W - 280.0) / 2.0, mid - 140.0), Vector2(280, 280))
	Anim.pop_in(icon, 0.05, 0.4)
	Anim.bob(icon, 10.0, 3.2)
	var lock := UiKit.icon("res://assets/ui/lock_skill.png", 96)
	add(lock, Vector2(W / 2.0 + 70.0, mid + 60.0))
	Anim.pop_in(lock, 0.2, 0.3)
	var text := UiKit.label(tr("H_UNLOCKS_AT") % unlock_at, 52, UiKit.GOLD)
	add(text, Vector2(0, mid + 190.0), Vector2(W, 72))
	Anim.pop_in(text, 0.15, 0.3)
