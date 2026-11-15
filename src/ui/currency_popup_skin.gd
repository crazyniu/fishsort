class_name CurrencyPopupSkin
extends RefCounted

const ROOT := "res://assets/ui/currency/"

static func paint(patch: Patch, file: String) -> void:
	patch.texture = load(ROOT + file + ".svg")
	patch._mx = 0.0
	patch._my = 0.0
	patch._pad = 0.0
	patch.queue_redraw()

static func layout(p: PopupCard, host: Control, title: String, caption: String, bowl: bool) -> void:
	var height := 660.0 if p.buttons.size() == 2 else 550.0
	p.card.size = Vector2(620, height)
	p.card.position = (host.size - p.card.size) / 2.0
	p.card.pivot_offset = p.card.size / 2.0
	paint(p.card, "panel")
	for child: Node in p.card.get_children():
		if child is KitButton:
			continue
		child.queue_free()
	var header := Patch.new()
	header.position = Vector2(102, -28)
	header.size = Vector2(416, 102)
	OceanPopupSkin.paint(header, "header")
	p.card.add_child(header)
	var heading := UiKit.label(title, 44)
	heading.position = Vector2(112, -23)
	heading.size = Vector2(396, 90)
	p.card.add_child(heading)
	var close_face := Patch.new()
	close_face.position = Vector2(540, -6)
	close_face.size = Vector2(64, 64)
	OceanPopupSkin.paint(close_face, "close")
	p.card.add_child(close_face)
	var close_hit := UiKit.hotspot(Vector2(532, -14), Vector2(80, 80))
	close_hit.pressed.connect(p.close)
	Anim.press_fx(close_hit)
	p.card.add_child(close_hit)
	var art := UiKit.icon(ROOT + ("bowl.svg" if bowl else "coins.svg"), 250)
	art.position = Vector2(185, 90)
	p.card.add_child(art)
	var text := UiKit.label(caption, 32)
	text.position = Vector2(24, 344)
	text.size = Vector2(572, 54)
	text.add_theme_font_size_override("font_size", 30 if caption.length() > 25 else 32)
	p.card.add_child(text)
	for i: int in p.buttons.size():
		var b: KitButton = p.buttons[i]
		b.position = Vector2(66, 420 + i * 108)
		b.size = Vector2(488, 92)
		b.pivot_offset = b.size / 2.0
		b.add_theme_font_size_override("font_size", 32 if b.text.length() < 18 else 25)
		paint(b.face, "primary" if i == 0 else "secondary")
		for child: Node in b.get_children():
			if child != b.face:
				child.queue_free()
		if Ads.available() and (not bowl or i > 0):
			var words := b.text
			b.text = ""
			var line := HBoxContainer.new()
			line.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			line.alignment = BoxContainer.ALIGNMENT_CENTER
			line.add_theme_constant_override("separation", 12)
			line.mouse_filter = Control.MOUSE_FILTER_IGNORE
			b.add_child(line)
			var video := UiKit.icon(ROOT + "video.svg", 48)
			video.custom_minimum_size = Vector2(48, 40)
			video.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			line.add_child(video)
			line.add_child(UiKit.label(words, 30 if words.length() < 18 else 23))

static func price(button: KitButton, amount: int) -> void:
	button.text = ""
	var group := HBoxContainer.new()
	group.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	group.alignment = BoxContainer.ALIGNMENT_CENTER
	group.add_theme_constant_override("separation", 16)
	group.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(group)
	var coin := UiKit.icon(ROOT + "coin.svg", 52)
	coin.custom_minimum_size = Vector2(52, 52)
	coin.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	group.add_child(coin)
	var value := UiKit.label(str(amount), 46)
	group.add_child(value)
