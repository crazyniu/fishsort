class_name CardReveal
extends Control
## 新收藏卡亮相：卡背朝上弹出 → 翻转（scale.x 1→0→1，中途换面）→ 正面是生物大图、名字、
## 稀有度颜色光圈；史诗以上再加金光和火花。重复卡在卡下写「已拥有，换 N 金币」。
## open 是全屏版（点任意处继续），show_card 是摆在任意容器里的版本（结算页宝箱用）。

const RAYS := 16
const CARD_W := 400.0
const CARD_H := 540.0
## 卡背弹出后停多久再翻
const FLIP_AT := 0.75
const FLIP_HALF := 0.18
## 各稀有度的光晕颜色
const GLOW: Dictionary = {
	"common": Color("6FD3FF"),
	"uncommon": Color("7BE05A"),
	"rare": Color("4D9BFF"),
	"epic": Color("C06BFF"),
	"legend": Color("FFC93C")
}
const GOLD_SPARK := Color("FFE27A")

var _ready_at: float = 0.0
var _done: Callable
var _closing: bool = false


## card 是 Cards.give 的返回值 { id, rarity, is_new, coins }；关闭后调用 on_done
static func open(
	host: Control, card: Dictionary, on_done: Callable, flip_at: float = FLIP_AT
) -> CardReveal:
	var fx := CardReveal.new()
	fx.size = host.size
	fx.z_index = 100
	fx.mouse_filter = Control.MOUSE_FILTER_STOP
	fx._done = on_done
	host.add_child(fx)
	fx._build(card, flip_at)
	return fx


## 一串卡依次亮相，点一下看下一张，全看完调用 on_done。后面几张翻得快一点
static func open_all(host: Control, cards: Array, on_done: Callable) -> void:
	if cards.is_empty():
		if on_done.is_valid():
			on_done.call()
		return
	var rest: Array = cards.slice(1)
	var next: Callable = open_all.bind(host, rest, on_done)
	open(host, cards[0], next, FLIP_AT if rest.size() == cards.size() - 1 else 0.35)


func _build(card: Dictionary, flip_at: float) -> void:
	var w: float = size.x
	var center := Vector2(w / 2.0, size.y * 0.44)
	var shade := ColorRect.new()
	shade.color = Color(0.01, 0.06, 0.16, 0.86)
	shade.size = size
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(shade)
	modulate.a = 0.0
	create_tween().tween_property(self, "modulate:a", 1.0, 0.2)
	show_card(self, center, card, 1.0, true, flip_at)
	var rank: int = Cards.rank(Config.eco, str(card["rarity"]))
	if rank >= Cards.rank(Config.eco, "epic"):
		var party: Tween = create_tween()
		party.tween_interval(flip_at + FLIP_HALF * 2.0)
		party.tween_callback(Anim.confetti.bind(self, w, 80))
	var hint := UiKit.label(tr("UI_TAP_CONTINUE"), 30)
	hint.size = Vector2(w, 50)
	hint.position = Vector2(0, size.y * 0.84)
	hint.modulate.a = 0.0
	add_child(hint)
	var tw: Tween = hint.create_tween()
	tw.tween_interval(flip_at + FLIP_HALF * 2.0 + 0.5)
	tw.tween_property(hint, "modulate:a", 1.0, 0.25)
	tw.tween_callback(
		func() -> void:
			hint.create_tween().set_loops().tween_property(hint, "modulate:a", 0.45, 0.6).from(1.0)
	)
	_ready_at = Time.get_ticks_msec() / 1000.0 + flip_at + FLIP_HALF * 2.0 + 0.4


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
	if _done.is_valid():
		tw.tween_callback(_done)
	tw.tween_callback(queue_free)


## 在 parent 里以 center 为中心摆出一张收藏卡的亮相（k 是整体缩放）。
## animated 为 false 时直接摆出翻开后的样子；flip_at 是卡背停多久再翻
static func show_card(
	parent: Control,
	center: Vector2,
	card: Dictionary,
	k: float,
	animated: bool = true,
	flip_at: float = FLIP_AT
) -> void:
	var tint: Color = GLOW.get(card["rarity"], Color.WHITE)
	var holder := Control.new()
	holder.size = Vector2(CARD_W, CARD_H) * k
	holder.position = center - holder.size / 2.0
	holder.pivot_offset = holder.size / 2.0
	holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
	parent.add_child(holder)
	if not animated:
		_face(parent, holder, center, card, k, tint, false)
		return
	_back(holder, k)
	Anim.pop_in(holder, 0.05, 0.3)
	Audio.sfx(&"swell")
	var tw: Tween = holder.create_tween()
	tw.tween_interval(0.05 + 0.3 + flip_at)
	tw.tween_property(holder, "scale:x", 0.0, FLIP_HALF).set_ease(Tween.EASE_IN)
	tw.tween_callback(_face.bind(parent, holder, center, card, k, tint, true))
	tw.tween_property(holder, "scale:x", 1.0, FLIP_HALF * 1.2).set_trans(Tween.TRANS_BACK).set_ease(
		Tween.EASE_OUT
	)


## 卡背：蓝色卡面 + 鱼缸 + 问号
static func _back(holder: Control, k: float) -> void:
	var base := UiKit.piece("card")
	base.size = holder.size
	base.modulate = Color(0.55, 0.7, 1.0)
	holder.add_child(base)
	var tank := UiKit.icon("res://assets/ui/tank.png", 240 * k)
	tank.position = Vector2((holder.size.x - tank.size.x) / 2.0, 90 * k)
	tank.modulate = Color(1, 1, 1, 0.85)
	holder.add_child(tank)
	var mark := UiKit.label("?", maxi(24, int(110 * k)), UiKit.GOLD)
	mark.size = Vector2(holder.size.x, 130 * k)
	mark.position = Vector2(0, 330 * k)
	holder.add_child(mark)


## 翻到正面：换掉卡背，摆上大图、名字、稀有度，再按稀有度加光和火花
static func _face(
	parent: Control,
	holder: Control,
	center: Vector2,
	card: Dictionary,
	k: float,
	tint: Color,
	animated: bool
) -> void:
	for c: Node in holder.get_children():
		c.queue_free()
	var sp: Dictionary = Config.species_by_id[card["id"]]
	var rarity: String = str(card["rarity"])
	var rank: int = Cards.rank(Config.eco, rarity)
	var high: bool = rank >= Cards.rank(Config.eco, "epic")
	var cw: float = holder.size.x
	# 史诗以上：卡后面转动的金色光芒
	if high:
		_rays(parent, holder, center, k)
	var glow := UiKit.badge("fx_glow", 560 * k)
	glow.position = center - glow.size / 2.0
	glow.modulate = Color(tint, 0.0)
	parent.add_child(glow)
	parent.move_child(glow, holder.get_index())
	glow.create_tween().tween_property(glow, "modulate:a", 0.6, 0.3)
	Anim.pulse(glow, 1.1, 1.6)
	var base := UiKit.piece("card_gold" if high else "card")
	base.size = holder.size
	holder.add_child(base)
	# 稀有度颜色的光圈，鱼在圈里
	var ring := UiKit.badge("fx_ring", 320 * k)
	ring.position = Vector2((cw - ring.size.x) / 2.0, 36 * k)
	ring.modulate = tint
	holder.add_child(ring)
	var disc := UiKit.badge("fx_glow", 300 * k)
	disc.position = Vector2((cw - disc.size.x) / 2.0, 46 * k)
	disc.modulate = Color(tint, 0.55)
	holder.add_child(disc)
	var art_path: String = "res://assets/fish/%s.png" % card["id"]
	var fish: Control
	if ResourceLoader.exists(art_path):
		fish = UiKit.icon(art_path, 250 * k)
		Anim.wiggle(fish, 6.0, 1.8)
	else:
		fish = UiKit.label("?", maxi(24, int(120 * k)))
		fish.size = Vector2(250, 250) * k
	fish.position = Vector2((cw - fish.size.x) / 2.0, 66 * k)
	fish.pivot_offset = fish.size / 2.0
	holder.add_child(fish)
	var name_label := UiKit.label(str(sp["name"]), maxi(24, int(42 * k)))
	name_label.size = Vector2(cw, 60 * k)
	name_label.position = Vector2(0, 372 * k)
	holder.add_child(name_label)
	var rarity_text := UiKit.label(
		parent.tr("UI_RARITY_" + rarity.to_upper()), maxi(24, int(30 * k)), tint.lightened(0.25)
	)
	rarity_text.size = Vector2(cw, 44 * k)
	rarity_text.position = Vector2(0, 440 * k)
	holder.add_child(rarity_text)
	if card["is_new"]:
		var tag := UiKit.badge("dot_red", maxf(60.0, 84.0 * k))
		tag.position = Vector2(cw - tag.size.x * 0.75, -tag.size.y * 0.25)
		holder.add_child(tag)
		var tag_text := UiKit.label(parent.tr("UI_NEW"), 28)
		tag_text.size = tag.size
		tag.add_child(tag_text)
		if animated:
			Anim.pop_in(tag, 0.15, 0.3)
	else:
		var line := UiKit.label(
			parent.tr("UI_CARD_OWNED") % int(card["coins"]), maxi(24, int(34 * k)), UiKit.GOLD
		)
		line.size = Vector2(700 * k, 56 * k)
		line.position = center + Vector2(-350 * k, CARD_H * k / 2.0 + 14.0 * k)
		line.pivot_offset = line.size / 2.0
		parent.add_child(line)
		if animated:
			Anim.pop_in(line, 0.2, 0.3)
	if not animated:
		return
	Audio.sfx(&"card")
	# 翻开瞬间的一圈光环
	var wave := UiKit.badge("fx_ring", 300 * k)
	wave.position = center - wave.size / 2.0
	wave.modulate = tint
	parent.add_child(wave)
	var rt: Tween = wave.create_tween().set_parallel()
	rt.tween_property(wave, "scale", Vector2(2.6, 2.6), 0.5).from(Vector2(0.5, 0.5)).set_ease(
		Tween.EASE_OUT
	)
	rt.tween_property(wave, "modulate:a", 0.0, 0.5)
	rt.chain().tween_callback(wave.queue_free)
	if high:
		_sparks(parent, center, k, tint)


## 金色光芒：16 道，慢慢转
static func _rays(parent: Control, holder: Control, center: Vector2, k: float) -> void:
	var rays := Node2D.new()
	rays.position = center
	for i: int in RAYS:
		var p := Polygon2D.new()
		var a: float = TAU * i / RAYS
		var half: float = TAU / RAYS * 0.25
		var reach: float = 460.0 * k
		p.polygon = PackedVector2Array(
			[
				Vector2.ZERO,
				Vector2.from_angle(a - half) * reach,
				Vector2.from_angle(a + half) * reach
			]
		)
		p.color = Color(1.0, 0.92, 0.55, 0.18)
		rays.add_child(p)
	rays.scale = Vector2.ZERO
	parent.add_child(rays)
	parent.move_child(rays, holder.get_index())
	(
		rays
		. create_tween()
		. tween_property(rays, "scale", Vector2.ONE, 0.4)
		. set_trans(Tween.TRANS_BACK)
		. set_ease(Tween.EASE_OUT)
	)
	rays.create_tween().set_loops().tween_property(rays, "rotation", TAU, 14.0).from(0.0)


## 火花：一次迸发，加几颗围着卡闪烁的星点
static func _sparks(parent: Control, center: Vector2, k: float, tint: Color) -> void:
	Audio.sfx(&"firework")
	Anim.burst(
		parent, center, 16, "res://assets/ui/star.png", 620.0 * k, 900.0 * k, Vector2(26, 46), 0.9
	)
	for i: int in 8:
		var star := UiKit.badge("fx_spark", randf_range(36, 64) * k)
		var at: Vector2 = (
			center + Vector2.from_angle(TAU * i / 8.0 + 0.3) * randf_range(250, 330) * k
		)
		star.position = at - star.size / 2.0
		star.modulate = GOLD_SPARK.lerp(tint, 0.2)
		star.scale = Vector2.ZERO
		parent.add_child(star)
		var st: Tween = star.create_tween().set_loops()
		st.tween_interval(0.2 + i * 0.15)
		st.tween_property(star, "scale", Vector2.ONE, 0.25)
		st.tween_property(star, "scale", Vector2.ZERO, 0.35)
