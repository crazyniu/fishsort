extends SceneTree
## 开发辅助：在虚拟显示器里跑游戏并截图，用来在没有屏幕的机器上检查界面。
## 用法：xvfb-run -a godot --path . --rendering-driver opengl3 --resolution 750x1334 \
##       -s tools/shot.gd -- <输出.png> [关卡号] [自动点击步数]


func _init() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var out: String = args[0]
	var level: int = int(args[1]) if args.size() > 1 else 1
	var taps: int = int(args[2]) if args.size() > 2 else 0
	await process_frame
	var game: Control = (load("res://scenes/game.tscn") as PackedScene).instantiate()
	root.add_child(game)
	await process_frame
	game.call("start_level", level)
	var rng := Rng.new(1)
	for i: int in taps:
		var s: GameState = game.get("_s")
		if s.status != GameState.Status.PLAYING:
			break
		var open: Array[int] = Rules.open_bubbles(s)
		if open.is_empty():
			break
		var b: int = rng.pick(open)
		for k: int in s.bubbles[b].fish.size():
			if s.bubbles[b].fish[k] >= 0:
				game.call("_tap", b, k)
				break
		await create_timer(0.05).timeout
	await create_timer(1.2).timeout
	root.get_viewport().get_texture().get_image().save_png(out)
	quit()
