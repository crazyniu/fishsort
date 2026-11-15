class_name RankPage
extends HomePage
## 排行页：本周过关榜。v1.0 只接平台自带的榜，开发阶段是假数据。


func build() -> void:
	var header := UiKit.icon("res://assets/ui/rank_profile/header.svg", 430)
	add(header, Vector2(160, 25), Vector2(430, 96))
	add(UiKit.label(tr("UI_RANK_TITLE"), 46), Vector2(168, 25), Vector2(414, 90))
	add(UiKit.icon("res://assets/ui/rank_profile/back.svg", 90), Vector2(26, 28))
	var back := UiKit.hotspot(Vector2(22, 24), Vector2(98, 98))
	back.pressed.connect(_on_back)
	add_child(back)
	var days_left: int = 7 - (Save.today() + 3) % 7
	add(UiKit.label(tr("UI_RANK_RESET") % days_left, 24), Vector2(0, 130), Vector2(W, 40))
	var me_score: int = (
		int(Save.data["week"]["cleared"])
		if int(Save.data["week"]["id"]) == (Save.today() + 3) / 7
		else 0
	)
	var profile: Dictionary = Platform.impl.get_profile()
	var rows: Array = Platform.impl.get_rank_list(&"weekly")
	rows.append(
		{
			"name": profile.get("nickname", ""),
			"avatar": profile.get("avatar", ""),
			"score": me_score,
			"me": true
		}
	)
	rows.sort_custom(
		func(a: Dictionary, b: Dictionary) -> bool: return int(a["score"]) > int(b["score"])
	)
	# Keep every platform row accessible without shrinking names or avatars.
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	add(scroll, Vector2(24, 200), Vector2(W - 48, maxf(150, size.y - 220)))
	var list := VBoxContainer.new()
	list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	list.add_theme_constant_override("separation", 12)
	scroll.add_child(list)
	for i: int in rows.size():
		var r: Dictionary = rows[i]
		var me: bool = r.get("me", false)
		var row := Control.new()
		row.custom_minimum_size = Vector2(686, 132)
		list.add_child(row)
		var skin := UiKit.icon("res://assets/ui/rank_profile/%s.svg" % ("me" if me else "row"), 686)
		skin.stretch_mode = TextureRect.STRETCH_SCALE
		add_to(row, skin, Vector2.ZERO, Vector2(686, 132))
		if i < 3:
			add_to(row, UiKit.icon("res://assets/ui/rank_profile/medal%d.svg" % (i + 1), 92), Vector2(14, 17))
		add_to(row, UiKit.label(str(i + 1), 38), Vector2(19, 20 if i < 3 else 0), Vector2(82, 64 if i < 3 else 128))
		add_to(row, UiKit.icon(str(r.get("avatar", "")), 110), Vector2(110, 10))
		var name := UiKit.label(str(r.get("name", "")), 30)
		name.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		name.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		add_to(row, name, Vector2(232, 0), Vector2(228, 126))
		var value := UiKit.icon("res://assets/ui/rank_profile/value.svg", 176)
		add_to(row, value, Vector2(480, 33), Vector2(176, 64))
		var score := UiKit.label(tr("UI_RANK_LEVELS") % int(r["score"]), 30)
		add_to(row, score, Vector2(484, 31), Vector2(168, 66))


func _on_back() -> void:
	host.go_tab(HomeScreen.TAB_MAIN)
