class_name CardReveal
extends Control
## 过关得图鉴卡的全屏展示：压暗 → 光芒 → 鱼缸弹出 → 彩纸 → 点击任意位置继续。

const RAYS := 16

var _rays: Node2D
var _ready_at: float = 0.0
var _done: Callable
var _closing: bool = false


## card 是 Meta.draw_card 的返回值；关闭后调用 on_done
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
	_rays = Node2D.new()
	_rays.position = center
	for i: int in RAYS:
		var p := Polygon2D.new()
		var a: float = TAU * i / RAYS
		var half: float = TAU / RAYS * 0.25
		p.polygon = PackedVector2Array(
			[
				Vector2.ZERO,
				Vector2.from_angle(a - half) * 520.0,
				Vector2.from_angle(a + half) * 520.0
			]
		)
		p.color = Color(1, 0.9, 0.5, 0.13)
		_rays.add_child(p)
	_rays.scale = Vector2.ZERO
	add_child(_rays)
	(
		create_tween()
		. tween_property(_rays, "scale", Vector2.ONE, 0.5)
		. set_trans(Tween.TRANS_BACK)
		. set_ease(Tween.EASE_OUT)
	)
	var sp: Dictionary = Config.species_by_id[card["id"]]
	var title: String = (
		tr("UI_CARD_GET") % sp["name"]
		if card["is_new"]
		else tr("UI_CARD_AGAIN") % [sp["name"], int(card["coins"])]
	)
	var head := UiKit.label(title, 50 if card["is_new"] else 38, UiKit.GOLD)
	head.size = Vector2(w, 80)
	head.position = Vector2(0, center.y - 290)
	head.pivot_offset = head.size / 2.0
	add_child(head)
	Anim.pop_in(head, 0.15, 0.35)
	# 鱼缸 + 鱼
	var tank := UiKit.icon("res://assets/ui/tank.png", 360)
	tank.position = center - Vector2(180, 180)
	tank.pivot_offset = Vector2(180, 180)
	add_child(tank)
	Anim.pop_in(tank, 0.05, 0.4)
	var art_path: String = "res://assets/fish/%s.png" % card["id"]
	if ResourceLoader.exists(art_path):
		var fish := UiKit.icon(art_path, 180)
		fish.position = center - Vector2(90, 70)
		add_child(fish)
		Anim.pop_in(fish, 0.25, 0.35)
		Anim.wiggle(fish, 7.0, 1.6)
	else:
		var q := UiKit.label("?", 120)
		q.size = Vector2(200, 160)
		q.position = center - Vector2(100, 60)
		add_child(q)
	if card["is_new"]:
		var tag := UiKit.badge("dot_red", 76)
		tag.position = center + Vector2(110, -190)
		tag.pivot_offset = Vector2(38, 38)
		add_child(tag)
		var tag_text := UiKit.label(tr("UI_NEW"), 30)
		tag_text.size = Vector2(76, 76)
		tag.add_child(tag_text)
		Anim.pop_in(tag, 0.5, 0.3)
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


func _process(delta: float) -> void:
	_rays.rotation += delta * 0.35


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
