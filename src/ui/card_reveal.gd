class_name CardReveal
extends Control
## 过关得图鉴卡的全屏展示：压暗 → 光芒 → 鱼缸弹出 → 彩纸 → 点击任意位置继续。

const RAYS := 16
## 各稀有度的光晕颜色
const GLOW: Dictionary = {
	"common": Color("6FD3FF"),
	"uncommon": Color("7BE05A"),
	"rare": Color("4D9BFF"),
	"epic": Color("C06BFF"),
	"legend": Color("FFC93C")
}

var _ready_at: float = 0.0
var _done: Callable
var _closing: bool = false


## card 是 Cards.give 的返回值；关闭后调用 on_done
static func open(host: Control, card: Dictionary, on_done: Callable) -> CardReveal:
	var fx := CardReveal.new()
	fx.size = host.size
	fx.z_index = 100
	fx.mouse_filter = Control.MOUSE_FILTER_STOP
	fx._done = on_done
	host.add_child(fx)
	fx._build(card)
	return fx


func _build(card: Dictionary) -> void:
	var w: float = size.x
	var center := Vector2(w / 2.0, size.y * 0.45)
	var shade := ColorRect.new()
	shade.color = Color(0.01, 0.06, 0.16, 0.86)
	shade.size = size
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	modulate.a = 0.0
	create_tween().tween_property(self, "modulate:a", 1.0, 0.2)
	show_card(self, center, card, 1.0)
	Anim.confetti(self, w, 70)
	Anim.burst(
		self, center, 14, "res://assets/ui/star.png", 620.0, 900.0, Vector2(26, 46), 0.9, 101
	)
	Audio.sfx(&"star")
	var hint := UiKit.label(tr("UI_TAP_CONTINUE"), 30)
	hint.size = Vector2(w, 50)
	hint.position = Vector2(0, size.y * 0.8)
	hint.modulate.a = 0.0
	add_child(hint)
	var tw: Tween = hint.create_tween()
	tw.tween_interval(0.7)
	tw.tween_property(hint, "modulate:a", 1.0, 0.25)
	tw.tween_callback(
		func() -> void:
			hint.create_tween().set_loops().tween_property(hint, "modulate:a", 0.45, 0.6).from(1.0)
	)
	_ready_at = Time.get_ticks_msec() / 1000.0 + 0.7


func _gui_input(event: InputEvent) -> void:
	var pressed: bool = (
		(event is InputEventMouseButton and (event as InputEventMouseButton).pressed)
		or (event is InputEventScreenTouch and (event as InputEventScreenTouch).pressed)
	)
	if not pressed or _closing or Time.get_ticks_msec() / 1000.0 < _ready_at:
		return
	_closing = true
	Audio.sfx(&"click")
	var tw: Tween = create_tween()
	tw.tween_property(self, "modulate:a", 0.0, 0.2)
	tw.tween_callback(_done)
	tw.tween_callback(queue_free)


## 在 parent 里以 center 为中心摆出一张图鉴卡的完整演出：
## 旋转光芒 + 稀有度色光晕 + 鱼缸砸落 + 鱼游动 + 标题 + 「新」角标 + 闪光。结算页和开卡包共用
static func show_card(parent: Control, center: Vector2, card: Dictionary, k: float) -> void:
	var sp: Dictionary = Config.species_by_id[card["id"]]
	var tint: Color = GLOW.get(sp["rarity"], Color.WHITE)
	var rays := Node2D.new()
	rays.position = center
	for i: int in RAYS:
		var p := Polygon2D.new()
		var a: float = TAU * i / RAYS
		var half: float = TAU / RAYS * 0.25
		var reach: float = 430.0 * k
		p.polygon = PackedVector2Array(
			[
				Vector2.ZERO,
				Vector2.from_angle(a - half) * reach,
				Vector2.from_angle(a + half) * reach
			]
		)
		p.color = Color(1.0, 0.92, 0.55, 0.15)
		rays.add_child(p)
	rays.scale = Vector2.ZERO
	parent.add_child(rays)
	(
		rays
		. create_tween()
		. tween_property(rays, "scale", Vector2.ONE, 0.45)
		. set_trans(Tween.TRANS_BACK)
		. set_ease(Tween.EASE_OUT)
	)
	rays.create_tween().set_loops().tween_property(rays, "rotation", TAU, 14.0).from(0.0)
	var glow := UiKit.badge("fx_glow", 520 * k)
	glow.position = center - glow.size / 2.0
	glow.modulate = Color(tint, 0.6)
	parent.add_child(glow)
	Anim.pulse(glow, 1.12, 1.6)
	# 鱼缸从上方砸下来，落地压扁再弹起
	var side: float = 330.0 * k
	var tank := UiKit.icon("res://assets/ui/tank.png", side)
	tank.pivot_offset = Vector2(side / 2.0, side)
	tank.position = center - Vector2(side / 2.0, side / 2.0 + 500)
	parent.add_child(tank)
	var tw: Tween = tank.create_tween()
	tw.tween_interval(0.1)
	tw.tween_property(tank, "position:y", center.y - side / 2.0, 0.26).set_ease(Tween.EASE_IN)
	tw.tween_property(tank, "scale", Vector2(1.2, 0.78), 0.07)
	tw.tween_property(tank, "scale", Vector2.ONE, 0.3).set_trans(Tween.TRANS_ELASTIC).set_ease(
		Tween.EASE_OUT
	)
	var art_path: String = "res://assets/fish/%s.png" % card["id"]
	var fish: Control
	if ResourceLoader.exists(art_path):
		fish = UiKit.icon(art_path, side * 0.5)
		Anim.wiggle(fish, 7.0, 1.6)
	else:
		fish = UiKit.label("?", int(110 * k))
		fish.size = Vector2(side * 0.5, side * 0.5)
	fish.position = center - Vector2(side * 0.25, side * 0.19)
	fish.pivot_offset = fish.size / 2.0
	parent.add_child(fish)
	Anim.pop_in(fish, 0.45, 0.3)
	# 落地的一圈光环和闪光
	var ring := UiKit.badge("fx_ring", 300 * k)
	ring.position = center - ring.size / 2.0
	ring.modulate = Color(1, 1, 1, 0.0)
	parent.add_child(ring)
	var rt: Tween = ring.create_tween()
	rt.tween_interval(0.36)
	rt.tween_callback(Audio.sfx.bind(&"card"))
	rt.tween_property(ring, "modulate:a", 1.0, 0.01)
	rt.tween_property(ring, "scale", Vector2(2.4, 2.4), 0.45).from(Vector2(0.4, 0.4)).set_ease(
		Tween.EASE_OUT
	)
	rt.parallel().tween_property(ring, "modulate:a", 0.0, 0.45)
	for i: int in 6:
		var star := UiKit.badge("fx_spark", randf_range(30, 60) * k)
		var at: Vector2 = (
			center + Vector2.from_angle(TAU * i / 6.0 + 0.4) * randf_range(170, 250) * k
		)
		star.position = at - star.size / 2.0
		star.modulate = Color.WHITE.lerp(tint, 0.4)
		star.scale = Vector2.ZERO
		parent.add_child(star)
		var st: Tween = star.create_tween().set_loops()
		st.tween_interval(0.4 + i * 0.17)
		st.tween_property(star, "scale", Vector2.ONE, 0.25)
		st.tween_property(star, "scale", Vector2.ZERO, 0.35)
	var title: String = (
		parent.tr("UI_CARD_GET") % sp["name"]
		if card["is_new"]
		else parent.tr("UI_CARD_AGAIN") % [sp["name"], int(card["coins"])]
	)
	var head := UiKit.label(title, int((46 if card["is_new"] else 32) * k), UiKit.GOLD)
	head.size = Vector2(700 * k, 70 * k)
	head.position = center + Vector2(-350 * k, side * 0.52)
	head.pivot_offset = head.size / 2.0
	parent.add_child(head)
	Anim.pop_in(head, 0.5, 0.3)
	if card["is_new"]:
		var tag := UiKit.badge("dot_red", 76 * k)
		tag.position = center + Vector2(side * 0.3, -side * 0.5)
		parent.add_child(tag)
		var tag_text := UiKit.label(parent.tr("UI_NEW"), int(30 * k))
		tag_text.size = tag.size
		tag.add_child(tag_text)
		Anim.pop_in(tag, 0.6, 0.3)
