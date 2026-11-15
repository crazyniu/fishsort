class_name BasePage
extends HomePage
## 家园「重建海湾」页（docs/01 §5.12，规格 docs/ux/home_base.md）。
## 上面是星星和金币；中间是当前区域的场景，建好的物件亮着，没建的是暗影，下一步的位置有光圈；
## 下面是区域进度（5 格 + 区域宝箱）和「建造」按钮（写着这一步花几颗星、多少金币）。
## 建完一个区域：宝箱晃动弹开，弹出奖品，收下后整页换成下一个区域。
## 场景图、物件图按 art/briefs/batch6_home_base.md 的命名找，找不到就用 basePage 里配的占位图。

const STAR := "res://assets/ui/star.png"
const COIN := "res://assets/ui/coin.png"
const CHEST := "res://assets/ui/chest_closed.png"
const CHEST_OPEN := "res://assets/ui/chest_open.png"
const PIP := 64.0

var _cfg: Dictionary
var _scene: Control
var _scene_at: Vector2
var _star_label: Label
var _coin_label: Label
## 刚建好的那一步（播建造动画用），-1 = 没有
var _fresh_step: int = -1
var _busy: bool = false


func build() -> void:
	_cfg = GameCfg.d()["basePage"]
	for c: Node in get_children():
		c.queue_free()
	var save: Dictionary = Save.data
	var eco: Dictionary = Config.eco
	var count: int = HomeBase.area_count(eco)
	var done: bool = HomeBase.all_done(save, eco)
	# 全部建完就停在最后一个区域
	var area: int = mini(HomeBase.current_area(save, eco), count - 1)
	var area_id: String = str(HomeBase.areas(eco)[area]["id"])
	var locked: bool = not done and not HomeBase.is_open(eco, area, int(save["level"]))
	title(tr("BASE_AREA_" + area_id.to_upper()))
	_build_counters(area, count)
	_build_scene(area, area_id, locked)
	var below: float = _scene_at.y + float(_cfg["scene"]) + 18.0
	_build_progress(below, area, area_id, done, locked)
	_build_button(maxf(below + 128.0, size.y - 160.0), area, done, locked)


## 顶部一行：左边星星，右边金币，中间「区域 1/5」
func _build_counters(area: int, count: int) -> void:
	var star: Dictionary = UiKit.capsule(STAR, 200)
	add(star["box"], Vector2(40, 96))
	_star_label = star["label"]
	_star_label.text = str(HomeBase.stars(Save.data))
	var coin: Dictionary = UiKit.capsule(COIN, 220)
	add(coin["box"], Vector2(W - 40.0 - 220.0, 96))
	_coin_label = coin["label"]
	_coin_label.text = str(int(Save.data["coins"]))
	add(
		UiKit.label(tr("BASE_PROGRESS") % [area + 1, count], 26, Color("BFE6FF")),
		Vector2(240, 96),
		Vector2(W - 480.0 - 20.0, 56)
	)


static func scene_path(area_id: String) -> String:
	return "res://assets/base/%s_bg.jpg" % area_id


static func step_path(area_id: String, step: int) -> String:
	return "res://assets/base/%s_%d.png" % [area_id, step + 1]


## 场景：圆角底图 + 每一步一个物件。建好的亮，没建的暗影，下一步有呼吸光圈
func _build_scene(area: int, area_id: String, locked: bool) -> void:
	var side: float = float(_cfg["scene"])
	_scene_at = Vector2((W - side) / 2.0, 170)
	add(UiKit.piece("deep"), _scene_at - Vector2(8, 8), Vector2(side + 16.0, side + 16.0))
	_scene = Control.new()
	_scene.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add(_scene, _scene_at, Vector2(side, side))
	var bg_path: String = scene_path(area_id)
	if not ResourceLoader.exists(bg_path):
		bg_path = str(_cfg["fallbackScene"])
	_scene.add_child(UiKit.rounded_picture(bg_path, Vector2(side, side), float(_cfg["radius"])))
	var built: int = HomeBase.built(Save.data, area)
	var slots: Array = _cfg["steps"][area_id]
	for i: int in slots.size():
		_build_item(area_id, i, slots[i], i < built, i == built and not locked)
	if locked:
		_build_lock(area, side)
	else:
		Anim.pop_in(_scene, 0.0, 0.25)


## slot: [x 占比, y 占比, 边长, 占位图]
func _build_item(area_id: String, step: int, slot: Array, built: bool, next: bool) -> void:
	var side: float = float(slot[2])
	var center := Vector2(float(slot[0]), float(slot[1])) * float(_cfg["scene"])
	var path: String = step_path(area_id, step)
	var real: bool = ResourceLoader.exists(path)
	if not real:
		path = str(slot[3])
	if built:
		# 占位图下面垫一层金光，表示「已建好」；正式物件图自带完整画面，光弱一些
		var glow := UiKit.badge("fx_glow", side * 1.7)
		glow.modulate = Color(1.0, 0.9, 0.4, 0.5 if real else 1.0)
		add_to(_scene, glow, center - glow.size / 2.0)
	var item := UiKit.icon(path, side)
	add_to(_scene, item, center - item.size / 2.0)
	if not built:
		# 没建的：深色剪影
		item.modulate = Color(0.06, 0.16, 0.34, 0.55)
	if next:
		var ring := UiKit.badge("fx_ring", side * 1.15)
		ring.modulate = Color(1, 0.95, 0.6, 0.85)
		add_to(_scene, ring, center - ring.size / 2.0)
		Anim.pulse(ring, 1.12, 1.4)
	if step == _fresh_step:
		_play_build(item, center, side)


## 建造动画：物件从小弹大，金光一闪，星星飞溅
func _play_build(item: Control, center: Vector2, side: float) -> void:
	var t: float = float(_cfg["buildFx"])
	item.scale = Vector2(0.2, 0.2)
	item.modulate.a = 0.0
	var tw: Tween = item.create_tween()
	tw.tween_property(item, "modulate:a", 1.0, t * 0.3)
	tw.parallel().tween_property(item, "scale", Vector2(1.25, 1.25), t * 0.6).set_ease(
		Tween.EASE_OUT
	)
	tw.tween_property(item, "scale", Vector2.ONE, t * 0.4).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)
	var flash := UiKit.badge("fx_glow", side * 2.2)
	flash.modulate = Color(UiKit.GOLD, 0.9)
	add_to(_scene, flash, center - flash.size / 2.0)
	var ft: Tween = flash.create_tween().set_parallel()
	ft.tween_property(flash, "scale", Vector2(1.5, 1.5), t).from(Vector2(0.3, 0.3))
	ft.tween_property(flash, "modulate:a", 0.0, t)
	ft.chain().tween_callback(flash.queue_free)
	Audio.sfx(&"unlock")
	Anim.burst(_scene, center, 12, STAR, 420.0, 700.0, Vector2(22, 40), 0.7)


## 没到开放关的区域：场景压暗，中间一把锁和「第 N 关开放」
func _build_lock(area: int, side: float) -> void:
	var shade := ColorRect.new()
	shade.color = Color(0.01, 0.06, 0.18, 0.55)
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_to(_scene, shade, Vector2.ZERO, Vector2(side, side))
	var lock := UiKit.icon("res://assets/ui/lock_skill.png", 150)
	add_to(_scene, lock, Vector2((side - 150.0) / 2.0, side / 2.0 - 150.0))
	Anim.pop_in(lock, 0.1, 0.3)
	var at: int = HomeBase.unlock_level(Config.eco, area)
	var text := UiKit.label(tr("H_UNLOCKS_AT") % at, 48, UiKit.GOLD)
	add_to(_scene, text, Vector2(0, side / 2.0 + 20.0), Vector2(side, 70))


## 区域进度：一行字（下一步做什么）+ 5 格星星 + 区域宝箱
func _build_progress(top: float, area: int, area_id: String, done: bool, locked: bool) -> void:
	var steps: int = HomeBase.step_count(Config.eco, area)
	var built: int = HomeBase.built(Save.data, area)
	var line: String
	if done:
		line = tr("BASE_ALL_DONE")
	elif locked:
		line = tr("BASE_NEXT_AREA")
	else:
		var step_name: String = tr("BASE_STEP_%s_%d" % [area_id.to_upper(), built + 1])
		line = tr("BASE_STEP_OF") % [built + 1, steps, step_name]
	add(UiKit.label(line, 30, UiKit.GOLD), Vector2(0, top), Vector2(W, 42))
	var gap: float = 14.0
	var cells: int = steps + 1
	var row_w: float = cells * PIP + (cells - 1) * gap
	for i: int in cells:
		var pos := Vector2((W - row_w) / 2.0 + i * (PIP + gap), top + 50.0)
		var cell := UiKit.piece("tile")
		add(cell, pos, Vector2(PIP, PIP))
		var is_chest: bool = i == steps
		var lit: bool = (built >= steps) if is_chest else i < built
		var path: String = (CHEST_OPEN if lit else CHEST) if is_chest else STAR
		var icon := UiKit.icon(path, PIP - 14.0)
		add(icon, pos + Vector2(7, 5), Vector2(PIP - 14.0, PIP - 14.0))
		if not lit:
			cell.modulate = Color(0.62, 0.68, 0.76)
			if not is_chest:
				icon.modulate = Color(0.35, 0.42, 0.55, 0.9)
		if i == _fresh_step:
			Anim.pop_in(icon, 0.15, 0.3)


## 主按钮：建造（写着星星和金币花费）；没开放 / 全建完时是灰的说明键
func _build_button(y: float, area: int, done: bool, locked: bool) -> void:
	var at := Vector2(95, y)
	var area_size := Vector2(560, 116)
	if done or locked:
		var key: String = "BASE_ALL_DONE" if done else "H_UNLOCKS_AT"
		var text: String = tr(key) if done else tr(key) % HomeBase.unlock_level(Config.eco, area)
		var b := btn(self, text, UiKit.BLUE, at, area_size, Callable(), 36)
		b.disabled = true
		return
	var cost: Dictionary = HomeBase.next_cost(Save.data, Config.eco)
	var go := btn(self, "", UiKit.GREEN, at, area_size, _on_build)
	var caption := UiKit.label(tr("BASE_BUILD"), 44)
	add_to(go, caption, Vector2(24, 0), Vector2(200, area_size.y - 8.0))
	var short_stars: bool = HomeBase.stars(Save.data) < int(cost["stars"])
	var short_coins: bool = int(Save.data["coins"]) < int(cost["coins"])
	_cost_tag(go, STAR, str(int(cost["stars"])), short_stars, Vector2(226, 0), 100.0)
	_cost_tag(go, COIN, str(int(cost["coins"])), short_coins, Vector2(330, 0), 210.0)
	if not short_stars and not short_coins:
		Anim.pulse(go, 1.04, 1.2)


## 按钮上的一个花费：图标 + 数字；不够时数字变红
func _cost_tag(b: Control, path: String, text: String, short: bool, pos: Vector2, w: float) -> void:
	var h: float = b.size.y - 8.0
	add_to(b, UiKit.icon(path, 50), pos + Vector2(0, (h - 50.0) / 2.0))
	var num := UiKit.label(text, 34, UiKit.RED if short else Color.WHITE)
	num.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	add_to(b, num, pos + Vector2(56, 0), Vector2(w - 56.0, h))


func _on_build() -> void:
	if _busy:
		return
	var save: Dictionary = Save.data
	var reason: String = HomeBase.check(save, Config.eco)
	if reason == "stars":
		Audio.sfx(&"error")
		host.toast(tr("BASE_NEED_STARS"))
		return
	if reason == "coins":
		var need: int = int(HomeBase.next_cost(save, Config.eco)["coins"])
		HomePopups.coin_shortage(host, need, build)
		return
	if not reason.is_empty():
		return
	var stars_before: int = HomeBase.stars(save)
	var coins_before: int = int(save["coins"])
	var res: Dictionary = HomeBase.build(save, Config.eco, Save.now())
	if not res["ok"]:
		return
	Save.save()
	var prizes: Array = res["prizes"]
	# 重建这一页：停在刚建好的区域，新物件播建造动画
	_fresh_step = int(res["step"])
	_rebuild_area(int(res["area"]))
	_fresh_step = -1
	Anim.count_to(_star_label, stars_before, HomeBase.stars(save))
	# 宝箱里的金币已经入账，但开箱前先不显示出来
	Anim.count_to(_coin_label, coins_before, int(save["coins"]) - _prize_coins(prizes))
	if res["completed"]:
		_busy = true
		var tw: Tween = create_tween()
		tw.tween_interval(float(_cfg["chestDelay"]))
		tw.tween_callback(_open_chest.bind(prizes))


func _prize_coins(prizes: Array) -> int:
	var n: int = 0
	for p: Dictionary in prizes:
		if str(p["kind"]) == "coin":
			n += int(p["amount"])
	return n


## 刚建完一个区域时，核心已经把「当前区域」推到下一个了；这里先按刚建好的区域画一遍
func _rebuild_area(area: int) -> void:
	for c: Node in get_children():
		c.queue_free()
	var eco: Dictionary = Config.eco
	var area_id: String = str(HomeBase.areas(eco)[area]["id"])
	var complete: bool = HomeBase.is_complete(Save.data, eco, area)
	title(tr("BASE_AREA_" + area_id.to_upper()))
	_build_counters(area, HomeBase.area_count(eco))
	_build_scene(area, area_id, false)
	var below: float = _scene_at.y + float(_cfg["scene"]) + 18.0
	if complete:
		_fresh_step = HomeBase.step_count(eco, area)
		_build_progress(below, area, area_id, true, false)
		_fresh_step = -1
		add(
			UiKit.label(tr("BASE_AREA_DONE"), 40, UiKit.GOLD),
			Vector2(0, maxf(below + 128.0, size.y - 160.0) + 30.0),
			Vector2(W, 56)
		)
		return
	_build_progress(below, area, area_id, false, false)
	_build_button(maxf(below + 128.0, size.y - 160.0), area, false, false)


## 区域宝箱：压暗 → 宝箱弹出、左右越晃越大 → 弹开冒金币 → 开奖弹窗，收下后换下一个区域
func _open_chest(prizes: Array) -> void:
	if not is_inside_tree():
		return
	var shade := ColorRect.new()
	shade.color = Color(0.01, 0.06, 0.18, 0.75)
	shade.mouse_filter = Control.MOUSE_FILTER_STOP
	add(shade, Vector2(-400, 0), Vector2(W + 800.0, size.y))
	shade.modulate.a = 0.0
	shade.create_tween().tween_property(shade, "modulate:a", 1.0, 0.2)
	var mid := Vector2(W / 2.0, size.y * 0.42)
	var glow := UiKit.badge("fx_glow", 460)
	glow.modulate = Color(UiKit.GOLD, 0.0)
	add(glow, mid - glow.size / 2.0)
	add(UiKit.label(tr("BASE_CHEST"), 48, UiKit.GOLD), Vector2(0, mid.y - 260.0), Vector2(W, 64))
	var chest := UiKit.icon(CHEST, 260)
	add(chest, mid - chest.size / 2.0)
	Anim.pop_in(chest, 0.0, 0.25)
	Audio.sfx(&"swell")
	var shake: float = float(_cfg["chestShake"])
	var tw: Tween = chest.create_tween()
	tw.tween_interval(0.3)
	var steps: int = maxi(2, int(shake / 0.08))
	for i: int in steps:
		var side: float = 1.0 if i % 2 == 0 else -1.0
		var amp: float = 0.06 + 0.12 * i / steps
		tw.tween_property(chest, "rotation", amp * side, 0.04)
		tw.tween_property(chest, "rotation", 0.0, 0.04)
		tw.parallel().tween_property(chest, "scale", Vector2.ONE * (1.0 + 0.2 * i / steps), 0.04)
	tw.tween_callback(_chest_pop.bind(chest, mid, prizes))
	glow.create_tween().tween_property(glow, "modulate:a", 0.9, shake + 0.3)


func _chest_pop(chest: TextureRect, mid: Vector2, prizes: Array) -> void:
	chest.texture = UiKit.tex(CHEST_OPEN)
	chest.rotation = 0.0
	Anim.squash(chest, 0.2)
	Audio.sfx(&"chest")
	Anim.burst(self, mid, 14, COIN, 520.0, 900.0, Vector2(26, 44), 0.8)
	Anim.burst(self, mid, 10, STAR, 440.0, 600.0, Vector2(22, 38), 0.7)
	Anim.confetti(self, W, 60)
	var tw: Tween = create_tween()
	tw.tween_interval(0.5)
	tw.tween_callback(_reveal.bind(prizes))


func _reveal(prizes: Array) -> void:
	if not is_inside_tree():
		return
	var p := MetaPopups.prize_reveal(host, prizes, tr("BASE_CHEST"))
	p.buttons[0].pressed.connect(_after_chest)


func _after_chest() -> void:
	_busy = false
	# 整页重建：顶栏、页签红点、下一个区域一起刷新
	host.refresh_all()
