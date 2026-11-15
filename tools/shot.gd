extends SceneTree
## 开发辅助：在虚拟显示器里跑游戏并截图，用来在没有屏幕的机器上检查界面。
## 用法：xvfb-run -a godot --path . --rendering-driver opengl3 --resolution 750x1334 \
##       -s tools/shot.gd -- <输出.png> game [关卡号] [自动点击步数]
##       -s tools/shot.gd -- <输出.png> home [页签 0-4] [popup: signin|adtest]


func _init() -> void:
	var args: PackedStringArray = OS.get_cmdline_user_args()
	var out: String = args[0]
	var mode: String = args[1] if args.size() > 1 else "game"
	await process_frame
	# 不能写成 App 类型：-s 脚本编译时 autoload 还没注册，引用 App 会连带编译失败
	var app: Node = (load("res://scenes/main.tscn") as PackedScene).instantiate()
	root.add_child(app)
	await process_frame
	if mode == "home":
		app.call("go_home", int(args[2]) if args.size() > 2 else 2)
		await create_timer(0.3).timeout
		if args.size() > 3:
			var home: Node = app.get_child(app.get_child_count() - 1)
			home.call("_show_signin" if args[3] == "signin" else "_show_ad_test")
	else:
		# -s 脚本编译时还没有 autoload 名字，只能按路径取
		(root.get_node("Save").get("data") as Dictionary)["level"] = (
			int(args[2]) if args.size() > 2 else 1
		)
		app.call("go_game")
		await create_timer(1.6).timeout
		var game: Node = app.get_child(app.get_child_count() - 1)
		var rng := Rng.new(1)
		for i: int in int(args[3]) if args.size() > 3 else 0:
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
			await create_timer(0.12).timeout
	await create_timer(1.5).timeout
	root.get_viewport().get_texture().get_image().save_png(out)
	quit()
