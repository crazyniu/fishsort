extends SceneTree
## 开发辅助：在虚拟显示器里跑游戏并截图，用来在没有屏幕的机器上检查界面。
## 用法：xvfb-run -a godot --path . --rendering-driver opengl3 --resolution 750x1334 \
##       -s tools/shot.gd -- <输出.png> game [关卡号] [自动点击步数]
##       -s tools/shot.gd -- <输出.png> home [页签 0-4] [令牌 ...] [等待秒数]
## 主页令牌（按顺序执行）：
##   先改假数据：level:N coins:N lives:N inf:秒 pending:功能
##   再打开界面：signin settings pause profile lives leave slot revive unlock:功能
##              shortage odds prize route adtest spin tenspin
## 最后可再加一个数字：截图前等待的秒数

const SET_TOKENS: Array[String] = ["level", "coins", "lives", "inf", "pending"]


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
		await _home(app, args)
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
		# 第 6 个参数：win = 直接出结算页；数字 = 触发一次该连击数的演出（第 7 个是档位）
		if args.size() > 5 and args[5] == "win":
			var card: Dictionary = {"id": "c01", "is_new": true, "rarity": "common", "coins": 0}
			var reward: Dictionary = {
				"coins": 20,
				"stars": 1,
				"tickets": 1,
				"first_win": true,
				"combo_coins": 23,
				"best": 12,
				"best_bonus": 24
			}
			var cards: Array[Dictionary] = [card]
			var nop := func() -> void: pass
			load("res://src/game/win_panel.gd").call("open", game, reward, cards, nop, nop, nop)
		elif args.size() > 5:
			var hud: Object = load("res://src/game/combo_hud.gd").new(
				game.get("_stage"), Vector2(0, 398), Vector2(750, 250)
			)
			var tier: int = int(args[6]) if args.size() > 6 else 0
			hud.call("hit", int(args[5]), tier, true, "太强了！", 2.0)
	# 最后一个参数是数字时：截图前再等几秒（看动画播到哪）
	var wait: float = 1.5
	if mode == "home":
		wait = (
			float(args[args.size() - 1]) if args.size() > 3 and args[-1].is_valid_float() else 0.6
		)
	elif args.size() > 4:
		wait = float(args[4])
	await create_timer(wait).timeout
	root.get_viewport().get_texture().get_image().save_png(out)
	quit()


func _home(app: Node, args: PackedStringArray) -> void:
	var model: Object = load("res://src/ui/home_model.gd").call("get_inst")
	var tokens: PackedStringArray = args.slice(3)
	for t: String in tokens:
		var kv: PackedStringArray = t.split(":")
		if kv[0] not in SET_TOKENS or kv.size() < 2:
			continue
		match kv[0]:
			"level":
				model.call("set_level", int(kv[1]))
			"coins":
				model.call("set_coins", int(kv[1]))
			"lives":
				model.call("set_lives", int(kv[1]))
			"inf":
				model.call("set_infinite_secs", int(kv[1]))
			"pending":
				model.call("set_pending_unlock", kv[1])
	app.call("go_home", int(args[2]) if args.size() > 2 else 2)
	await create_timer(0.3).timeout
	var home: Node = app.get_child(app.get_child_count() - 1)
	var popups: Script = load("res://src/ui/home_popups.gd")
	var metas: Script = load("res://src/ui/meta_popups.gd")
	var none := Callable()
	for t: String in tokens:
		var kv: PackedStringArray = t.split(":")
		match kv[0]:
			"signin":
				metas.call("signin", home, none)
			"settings":
				metas.call("settings", home, "home", none, none, none)
			"pause":
				metas.call("settings", home, "pause", none, none, none)
			"profile":
				metas.call("profile", home)
			"lives":
				if kv.size() == 1:
					popups.call("lives", home, none)
			"leave":
				popups.call("leave_confirm", home, none)
			"slot":
				popups.call("slot_unlock", home, none, none)
			"revive":
				popups.call("revive", home, none, none)
			"unlock":
				popups.call("feature_unlocked", home, kv[1], none)
			"shortage":
				popups.call("coin_shortage", home, 800, none)
			"odds":
				metas.call("odds", home)
			"prize":
				var prize: Dictionary = {"kind": "coin", "amount": 500}
				metas.call("prize_reveal", home, [prize], "恭喜获得")
			"route":
				load("res://src/ui/level_route.gd").call("open", home)
			"adtest":
				var page: Control = (load("res://src/ui/ad_test_page.gd") as GDScript).new()
				page.size = (home as Control).size
				page.z_index = 100
				home.add_child(page)
			"spin":
				home.get("_page").call("spin")
			"tenspin":
				home.get("_page").call("_on_ten")
