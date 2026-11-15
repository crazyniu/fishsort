class_name DexPage
extends HomePage
## 图鉴页（docs/01 §5.13）：局内出场的生物，救过才亮；每种救够数量领金币。

const ROW_H := 232.0


func build() -> void:
	add(UiKit.piece("deep"), Vector2(12, 4), Vector2(W - 24, size.y - 14.0))
	title(tr("UI_TAB_DEX"))
	var pool: Array = Config.species.filter(
		func(sp: Dictionary) -> bool: return bool(sp.get("inLevel", false))
	)
	var met: int = pool.filter(func(sp: Dictionary) -> bool: return _count(sp) > 0).size()
	add(UiKit.label(tr("DEX_MET") % [met, pool.size()], 26), Vector2(0, 88), Vector2(W, 36))
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.clip_contents = true
	add(scroll, Vector2(12, 134), Vector2(W - 24, size.y - 14.0 - 134.0))
	var inner := Control.new()
	inner.mouse_filter = Control.MOUSE_FILTER_PASS
	scroll.add_child(inner)
	var col_w: float = (W - 24 - 32) / 3.0
	for n: int in pool.size():
		var cell := _cell(pool[n], col_w - 12.0)
		add_to(inner, cell, Vector2(22 + (n % 3) * col_w, (n / 3) * ROW_H + 6.0))
		if n < 9:
			Anim.pop_in(cell, 0.03 * n, 0.25)
	inner.custom_minimum_size = Vector2(W - 24, ceili(pool.size() / 3.0) * ROW_H + 8)


func _count(sp: Dictionary) -> int:
	return Dex.count(Save.data, sp["id"])


## 一格：气泡里的生物、名字、救了多少只；有奖时下面是领取按钮，否则是到下一档的进度
func _cell(sp: Dictionary, w: float) -> Control:
	var id: String = sp["id"]
	var n: int = _count(sp)
	var cell := UiKit.piece("popup_row")
	cell.mouse_filter = Control.MOUSE_FILTER_PASS
	cell.size = Vector2(w, ROW_H - 12.0)
	cell.pivot_offset = cell.size / 2.0
	var bubble := UiKit.icon("res://assets/ui/bubble.png", 116)
	add_to(cell, bubble, Vector2((w - 116.0) / 2.0, 8))
	var fish := UiKit.icon("res://assets/fish/%s.png" % id, 76)
	add_to(cell, fish, Vector2((w - 76.0) / 2.0, 28), Vector2(76, 76))
	if n == 0:
		fish.modulate = Color(0.04, 0.14, 0.3, 0.85)
		add_to(cell, UiKit.label(tr("UI_UNKNOWN"), 24), Vector2(0, 128), Vector2(w, 34))
		return cell
	Anim.wiggle(fish, 6.0, 1.8, randf())
	add_to(cell, UiKit.label(str(sp["name"]), 24), Vector2(0, 124), Vector2(w, 34))
	if Dex.can_claim(Save.data, Config.eco, id):
		var take := btn(
			cell,
			tr("ALBUM_TAKE"),
			UiKit.GREEN,
			Vector2(20, 160),
			Vector2(w - 40.0, 52),
			_claim.bind(id),
			26
		)
		Anim.pulse(take, 1.06, 0.9)
		return cell
	var need: int = Dex.next_need(Save.data, Config.eco, id)
	var text: String = "%d/%d" % [n, need] if need > 0 else str(n)
	add_to(cell, UiKit.piece("chip"), Vector2(20, 168), Vector2(w - 40.0, 30))
	if need > 0:
		var fill_w: float = maxf(26.0, (w - 40.0) * minf(1.0, float(n) / need))
		add_to(cell, UiKit.piece("fill"), Vector2(20, 168), Vector2(fill_w, 30))
	add_to(cell, UiKit.label(text, 22), Vector2(0, 166), Vector2(w, 34))
	return cell


func _claim(id: String) -> void:
	var coins: int = Dex.claim(Save.data, Config.eco, id)
	if coins <= 0:
		return
	Save.save()
	var prizes: Array = [{"kind": "coin", "amount": coins}]
	MetaPopups.prize_reveal(host, prizes, tr("UI_TAB_DEX")).buttons[0].pressed.connect(
		host.refresh_all
	)
