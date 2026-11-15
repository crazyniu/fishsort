class_name RankPage
extends HomePage
## 排行页：本周过关榜。v1.0 只接平台自带的榜，开发阶段是假数据。


func build() -> void:
	title(tr("UI_RANK_TITLE"))
	# 排行是主页的子页面，左上角返回
	btn(self, tr("H_BACK"), UiKit.BLUE, Vector2(24, 24), Vector2(150, 70), _on_back, 30)
	var days_left: int = 7 - (Save.today() + 3) % 7
	add(UiKit.label(tr("UI_RANK_RESET") % days_left, 24), Vector2(0, 84), Vector2(W, 34))
	var me_score: int = (
		int(Save.data["week"]["cleared"])
		if int(Save.data["week"]["id"]) == (Save.today() + 3) / 7
		else 0
	)
	var profile: Dictionary = Platform.impl.get_profile()
	var mine: Dictionary = {
		"name": profile.get("nickname", ""), "avatar": profile.get("avatar", ""), "score": me_score
	}
	# 排序规则和每周结算（WeeklyRank）用同一个
	var rows: Array = WeeklyRank.sorted(Platform.impl.get_rank_list(&"weekly"), mine)
	_build_prize_note(118.0)
	var medal: Array[Color] = [Color("FFC93C"), Color("DCE6F0"), Color("F2A56B")]
	var top: float = 190.0
	var row_h: float = minf(92.0, (size.y - top - 44.0) / rows.size())
	add(UiKit.piece("deep"), Vector2(12, top), Vector2(W - 24, rows.size() * row_h + 20.0))
	for i: int in rows.size():
		var r: Dictionary = rows[i]
		var me: bool = r.get("me", false)
		var row := UiKit.piece("card_gold" if me else "popup_row")
		add(row, Vector2(26, top + 10.0 + i * row_h), Vector2(W - 52, row_h - 8))
		var ink: Color = UiKit.INK if me else Color.WHITE
		var rank_color: Color = ink if i >= 3 or me else medal[i]
		var rank := UiKit.text(str(i + 1), 36, rank_color)
		add_to(row, rank, Vector2(10, 0), Vector2(70, row_h - 12))
		add_to(row, UiKit.icon(r["avatar"], row_h - 24), Vector2(86, 6))
		var name := UiKit.text(r["name"], 28, ink)
		name.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		add_to(row, name, Vector2(100 + row_h - 20, 0), Vector2(300, row_h - 12))
		var score := UiKit.text(
			tr("UI_RANK_LEVELS") % int(r["score"]), 30, ink if me else UiKit.GOLD
		)
		score.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		add_to(row, score, Vector2(W - 52 - 190, 0), Vector2(170, row_h - 12))
		Anim.pop_in(row, 0.04 * i, 0.28)


## 每周奖励说明，两行：周一按上周名次发奖、第 1 名的奖励；第 2–3 名、4–10 名和其余上榜的金币
func _build_prize_note(y: float) -> void:
	var cfg: Dictionary = Config.eco["rankReward"]
	var t: Array = cfg["tiers"]
	var first: String = tr("RANK_PRIZE_TOP") % [int(t[0]["coins"]), int(t[0]["tools"])]
	var rest: String = (
		tr("RANK_PRIZE_REST")
		% [int(t[1]["coins"]), int(t[2]["coins"]), int(t[3]["coins"]), int(cfg["rest"]["coins"])]
	)
	add(UiKit.label(first, 22, UiKit.GOLD), Vector2(0, y), Vector2(W, 32))
	add(UiKit.label(rest, 22, UiKit.GOLD), Vector2(0, y + 32.0), Vector2(W, 32))


func _on_back() -> void:
	host.go_tab(HomeScreen.TAB_MAIN)
