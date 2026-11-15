class_name App
extends Control
## 根节点：在主页和局内之间切换。

static var inst: App

var _current: Control


func _ready() -> void:
	inst = self
	Audio.play_music()
	go_home()


func go_home(tab: int = HomeScreen.TAB_MAIN) -> void:
	var home := HomeScreen.new()
	home.start_tab = tab
	_swap(home)


func go_game() -> void:
	_swap((load("res://scenes/game.tscn") as PackedScene).instantiate())


func _swap(next: Control) -> void:
	Ads.banner(false)
	if _current != null:
		Anim.fade_out_free(_current, 0.15)
	_current = next
	next.set_anchors_preset(Control.PRESET_FULL_RECT)
	next.modulate.a = 0.0
	add_child(next)
	next.create_tween().tween_property(next, "modulate:a", 1.0, 0.25)
