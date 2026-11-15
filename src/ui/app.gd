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


## level > 0：重玩这一关（选关路线里点已通过的关）；0 = 打当前进度的关
func go_game(level: int = 0) -> void:
	var game: GameScreen = _new_game()
	game.start_id = level
	_swap(game)


## 每日挑战：打哪一关由 GameScreen 按日期定，进场次数已由每日挑战页记过
func go_daily() -> void:
	var game: GameScreen = _new_game()
	game.daily = true
	_swap(game)


func _new_game() -> GameScreen:
	return (load("res://scenes/game.tscn") as PackedScene).instantiate()


func _swap(next: Control) -> void:
	Ads.banner(false)
	if _current != null:
		Anim.fade_out_free(_current, 0.15)
	_current = next
	next.set_anchors_preset(Control.PRESET_FULL_RECT)
	next.modulate.a = 0.0
	add_child(next)
	next.create_tween().tween_property(next, "modulate:a", 1.0, 0.25)
