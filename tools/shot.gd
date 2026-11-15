extends SceneTree
## 开发辅助：在虚拟显示器里跑游戏并截图，用来在没有屏幕的机器上检查界面。
## 用法：xvfb-run -a godot --path . --rendering-driver opengl3 --resolution 750x1334 \
##       -s tools/shot.gd -- <输出.png> game [关卡号] [自动点击步数]
##       -s tools/shot.gd -- <输出.png> home [页签 0-4] [signin|adtest|stars]
## 最后可再加一个数字：截图前等待的秒数


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
			var calls: Dictionary = {
				"signin": "_show_signin", "adtest": "_show_ad_test", "stars": "_show_need_stars"
			}
			home.call(calls[args[3]])
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
		# 第 6 个参数填 combo：直接触发一次连击演出（数字,夸奖词）
		if args.size() > 5 and args[5] == "reveal":
			var card: Dictionary = {"id": "c01", "is_new": true, "rarity": "common", "coins": 0}
			load("res://src/ui/card_reveal.gd").call("open", game, card, func() -> void: pass)
		elif args.size() > 5:
			game.set("_combo", int(args[5]))
			game.call("_show_combo", args[6] if args.size() > 6 else "", 1.6)
	# 第 5 个参数：截图前再等几秒（看动画播到哪）
	await create_timer(float(args[4]) if args.size() > 4 else 1.5).timeout
	root.get_viewport().get_texture().get_image().save_png(out)
	quit()
