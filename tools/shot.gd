extends SceneTree
## 开发辅助：在虚拟显示器里跑游戏并截图，用来在没有屏幕的机器上检查界面。
## 用法：xvfb-run -a godot --path . --rendering-driver opengl3 --resolution 750x1334 \
##       -s tools/shot.gd -- <输出.png> game [关卡号] [自动点击步数]
##       -s tools/shot.gd -- <输出.png> home [页签 0-4] [令牌 ...] [等待秒数]
## 主页令牌（按顺序执行）：
##   先改假数据：level:N coins:N lives:N inf:秒 pending:功能
##   再打开界面：signin settings pause profile lives leave slot revive unlock:功能
##              shortage odds prize route adtest spin tenspin
##       -s tools/shot.gd -- <输出.png> series <关卡号> <先走几步> <事件> <秒> [秒 ...]
##         按关卡的参考解先走几步，再一直走到下一步会触发 <事件> 为止（tap / bowl_done /
##         bubble_drop / fish_to_buffer / none），等画面静下来后点下这一步；事件填 intro 则从进关卡起算，
##         然后在点击后的各个时刻连续截图：<输出>_0.png、<输出>_1.png ……
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
	elif mode == "series":
		await _series(app, args)
		quit()
		return
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
				game.get("_stage"), Vector2(0, 466), Vector2(750, 290)
			)
			var tier: int = int(args[6]) if args.size() > 6 else 0
			hud.call("hit", int(args[5]), tier, true, "太强了！", 2.0, int(args[5]) * 3)
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


## 连续截图：见文件头的用法
func _series(app: Node, args: PackedStringArray) -> void:
	(root.get_node("Save").get("data") as Dictionary)["level"] = int(args[2])
	app.call("go_game")
	var want: StringName = StringName(args[4])
	# intro：不等入场动画，从进关卡那一刻起按时刻截图
	if want == &"intro":
		await _capture(args, 5)
		return
	await create_timer(2.2).timeout
	var game: Node = app.get_child(app.get_child_count() - 1)
	var lv: LevelData = game.get("_lv")
	var skip: int = int(args[3])
	var step: int = 0
	while step < lv.ref.size():
		var s: GameState = game.get("_s")
		var b: int = int(lv.ref[step][0])
		var k: int = int(lv.ref[step][1])
		var hit: bool = want == &"tap" or want == &"none"
		for e: Dictionary in Rules.tap(s.clone(), b, k):
			hit = hit or e["t"] == want
		if step >= skip and hit:
			break
		game.call("_tap", b, k)
		step += 1
		await create_timer(0.12).timeout
	# 等之前的动画都播完
	await create_timer(2.0).timeout
	if want != &"none" and step < lv.ref.size():
		game.call("_tap", int(lv.ref[step][0]), int(lv.ref[step][1]))
	await _capture(args, 5)


## 从现在起，在 args[first] 之后列出的各个时刻（秒）截图
func _capture(args: PackedStringArray, first: int) -> void:
	var base: String = args[0].trim_suffix(".png")
	var now: float = 0.0
	for i: int in range(first, args.size()):
		var at: float = float(args[i])
		if at > now:
			await create_timer(at - now).timeout
			now = at
		await RenderingServer.frame_post_draw
		root.get_viewport().get_texture().get_image().save_png("%s_%d.png" % [base, i - first])


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
