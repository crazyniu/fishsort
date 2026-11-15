class_name OceanPopupSkin
extends RefCounted
## Independent vector skin for the approved settings and life dialogs.
const ROOT := "res://assets/ui/ocean_popup/"

static func paint(patch: Patch, name: String) -> void:
	patch.texture = load(ROOT + name + ".svg")
	patch._mx = 0.0
	patch._my = 0.0
	patch._pad = 0.0
	patch.queue_redraw()

static func apply(p: PopupCard, fish_path: String) -> void:
	paint(p.card, "panel")
	# Only the original header and close controls exist at this point.
	for child: Node in p.card.get_children():
		if child is Patch:
			if child.size.x > 500:
				paint(child, "header")
			elif child.size.x == 56:
				paint(child, "close")
				child.position = Vector2(548, 12)
		elif child is Button and not child is KitButton:
			child.position = Vector2(536, 0)
		elif child is Label:
			child.add_theme_constant_override("outline_size", 5)
	# Price is a second centered line, never squeezed beside the action caption.
	for button: KitButton in p.buttons:
		var price: Label = null
		var coin: TextureRect = null
		for child: Node in button.get_children():
			if child is Label:
				price = child
			elif child is TextureRect:
				coin = child
		if price != null and coin != null:
			var caption := UiKit.label(button.text, 28 if button.text.length() < 12 else 23)
			button.text = ""
			caption.position = Vector2(10, 5)
			caption.size = Vector2(button.size.x - 20, 39)
			button.add_child(caption)
			price.position = Vector2(button.size.x / 2 - 10, 44)
			price.size = Vector2(72, 36)
			price.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
			price.add_theme_font_size_override("font_size", 27)
			coin.position = Vector2(button.size.x / 2 - 50, 45)
			coin.size = Vector2(34, 34)
	var fish := UiKit.icon(fish_path, 110)
	fish.position = Vector2(20, -52)
	p.card.add_child(fish)
	for side: int in 2:
		var coral := UiKit.icon(ROOT + "coral.svg", 112)
		coral.size = Vector2(112, 56)
		coral.position = Vector2(16 if side == 0 else 492, p.card.size.y - 50)
		coral.flip_h = side == 1
		p.card.add_child(coral)

static func row(parent: Control, y: float, h: float) -> Patch:
	var r := HomePopups._row(parent, y, h)
	paint(r, "row")
	return r

static func icon(name: String, parent: Control) -> void:
	var pic := UiKit.icon(ROOT + name + ".svg", 52)
	pic.position = Vector2(16, (parent.size.y - 52) / 2)
	parent.add_child(pic)
