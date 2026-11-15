class_name ShopPage
extends HomePage
## 商店页（docs/01 §7.4）：看广告领金币 · 金币买技能 · 金币买生命。

const ROW_H := 120.0
const GAP := 12.0

var _model: HomeModel
var _row_n: int = 0
var _inner: Patch


func build() -> void:
	_model = host.model
	title(tr("UI_TAB_SHOP"))
	_inner = UiKit.piece("deep")
	add(_inner, Vector2(12, 96), Vector2(W - 24, 6.0 * (ROW_H + GAP) + GAP + 12.0))
	_row_n = 0
	if Ads.available():
		_free_coin_row()
	for id: String in HomeModel.SKILL_IDS:
		_skill_row(id)
	_life_row()


func _row(icon_path: String, name: String, sub: String, tint: Color = Color.WHITE) -> Patch:
	var row := UiKit.piece("popup_row")
	add_to(
		_inner, row, Vector2(14, 14 + _row_n * (ROW_H + GAP)), Vector2(_inner.size.x - 28.0, ROW_H)
	)
	var icon := UiKit.icon(icon_path, 84)
	icon.position = Vector2(18, (ROW_H - 84.0) / 2.0)
	icon.modulate = tint
	row.add_child(icon)
	var name_label := UiKit.label(name, 32)
	name_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	name_label.position = Vector2(122, 18)
	name_label.size = Vector2(300, 44)
	row.add_child(name_label)
	var sub_label := UiKit.text(sub, 26, Color(1, 1, 1, 0.75))
	sub_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	sub_label.position = Vector2(122, 64)
	sub_label.size = Vector2(300, 36)
	row.add_child(sub_label)
	Anim.pop_in(row, 0.05 * _row_n, 0.28)
	_row_n += 1
	return row


func _row_button(row: Patch, text: String, color: Color, action: Callable) -> KitButton:
	var b := UiKit.button(text, color, 30)
	b.pressed.connect(action)
	Anim.press_fx(b)
	add_to(row, b, Vector2(row.size.x - 232.0 - 16.0, (ROW_H - 80.0) / 2.0 - 2.0), Vector2(232, 80))
	return b


func _free_coin_row() -> void:
	var row := _row(
		"res://assets/ui/coin.png",
		tr("UI_FREE_COINS") % _model.free_coin_amount(),
		tr("H_TODAY_COUNT") % [_model.free_coin_used(), _model.free_coin_cap()]
	)
	var b := _row_button(row, tr("UI_CLAIM"), UiKit.PURPLE, _on_free_coin.bind(row))
	ad_badge(b)
	b.disabled = _model.free_coin_used() >= _model.free_coin_cap()


func _on_free_coin(row: Control) -> void:
	if not await Ads.rewarded(&"rv_free_coin") or not is_inside_tree():
		return
	if _model.claim_free_coins():
		Audio.sfx(&"coins")
		Anim.burst(
			host,
			row.get_global_rect().get_center(),
			12,
			"res://assets/ui/coin.png",
			520.0,
			700.0,
			Vector2(26, 44),
			0.8,
			60
		)
		host.refresh_top()
		host.rebuild_page()


func _skill_row(id: String) -> void:
	var open: bool = _model.skill_unlocked(id)
	var icon: String = "res://assets/ui/tool_%s.png" % ("blow" if id == "flow" else id)
	var tint: Color = Color(0.6, 0.9, 1.0) if id == "flow" else Color.WHITE
	var sub: String = (
		tr("UI_OWNED") % mini(_model.skill_count(id), 99)
		if open
		else tr("H_UNLOCKS_AT") % _model.unlock_level("skill_" + id)
	)
	var row := _row(
		icon, tr("H_SKILL_" + id.to_upper()), sub, tint if open else Color(0.5, 0.56, 0.64)
	)
	var b := _row_button(row, "", UiKit.GREEN, _on_buy_skill.bind(id, row))
	coin_price(b, _model.skill_price(id))
	b.disabled = not open


func _on_buy_skill(id: String, row: Control) -> void:
	var price: int = _model.skill_price(id)
	if not _model.buy_skill(id):
		Audio.sfx(&"error")
		HomePopups.coin_shortage(host, price, _after_coins)
		return
	Audio.sfx(&"coin")
	Anim.bounce(row, 1.05, 0.25)
	host.refresh_top()
	var tw: Tween = create_tween()
	tw.tween_interval(0.25)
	tw.tween_callback(host.rebuild_page)


func _after_coins() -> void:
	host.refresh_top()
	host.rebuild_page()


func _life_row() -> void:
	var m: HomeModel = _model
	var sub: String = tr("H_LIVES_FULL")
	if m.infinite_secs() > 0:
		sub = tr("H_INF_LEFT") % HomePopups._fmt_time(m.infinite_secs())
	elif m.next_life_secs() > 0:
		sub = tr("H_NEXT_LIFE") % HomePopups._fmt_time(m.next_life_secs())
	var count: String = "∞" if m.infinite_secs() > 0 else "%d/%d" % [m.lives(), m.max_lives()]
	var row := _row("res://assets/kit/heart.png", tr("H_LIVES_TITLE") + "  " + count, sub)
	_row_button(row, tr("H_BUY_LIVES"), UiKit.GREEN, _open_lives)


func _open_lives() -> void:
	HomePopups.lives(host, _after_coins)
