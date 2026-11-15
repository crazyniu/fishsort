class_name DailyPage
extends HomePage
## 每日挑战页（docs/01 §5.11）：当天的关卡入口、连续 7 天的进度、每日宝箱里有什么。
## 每天第一次免费；失败后再试要看广告或花金币（start_ad / start_coins 局内失败弹窗也用）。

const DOT := 62.0


func build() -> void:
	title(tr("UI_TAB_DAILY"))
	# 每日挑战是主页的子页面，左上角返回
	btn(self, tr("H_BACK"), UiKit.BLUE, Vector2(24, 24), Vector2(150, 70), _on_back, 30)
	var day: int = Save.today()
	var save: Dictionary = Save.data
	var cfg: Dictionary = Config.eco["dailyChallenge"]
	var done: bool = DailyChallenge.won_today(save, day)
	var mid: float = size.y * 0.27
	var glow := UiKit.badge("fx_glow", 460)
	glow.modulate = Color(1, 1, 1, 0.5)
	add(glow, Vector2((W - 460.0) / 2.0, mid - 230.0))
	var chest_path: String = "res://assets/ui/chest_%s.png" % ("open" if done else "closed")
	var chest := UiKit.icon(chest_path, 250)
	add(chest, Vector2((W - 250.0) / 2.0, mid - 125.0), Vector2(250, 250))
	Anim.pop_in(chest, 0.05, 0.4)
	if not done:
		Anim.bob(chest, 8.0, 2.6)
	_build_streak(mid + 150.0, DailyChallenge.streak(save, day), int(cfg["streakDays"]))
	_build_prizes(mid + 300.0, cfg["reward"])
	_build_buttons(size.y - 150.0, done, DailyChallenge.is_free(save, day), int(cfg["retryCoins"]))


## 连续过关：一排圆点，过了的亮，最后一格是大宝箱
func _build_streak(top: float, streak: int, days: int) -> void:
	add(
		UiKit.label(tr("DAILY_STREAK") % [streak, days], 30, UiKit.GOLD),
		Vector2(0, top),
		Vector2(W, 42)
	)
	var gap: float = 18.0
	var row_w: float = days * DOT + (days - 1) * gap
	for i: int in days:
		var pos := Vector2((W - row_w) / 2.0 + i * (DOT + gap), top + 54.0)
		var cell := UiKit.piece("tile")
		add(cell, pos, Vector2(DOT, DOT))
		var last: bool = i == days - 1
		var path: String = (
			"res://assets/ui/chest_closed.png" if last else "res://assets/ui/star.png"
		)
		var icon := UiKit.icon(path, DOT - 16.0)
		add(icon, pos + Vector2(8, 6), Vector2(DOT - 16.0, DOT - 16.0))
		if i >= streak:
			cell.modulate = Color(0.62, 0.68, 0.76)
			icon.modulate = Color(0.35, 0.42, 0.55, 0.9)
		else:
			Anim.pop_in(icon, 0.1 + i * 0.05, 0.3)


## 每日宝箱里有什么：金币、每种技能、一张图鉴卡
func _build_prizes(top: float, reward: Dictionary) -> void:
	var items: Array = [["res://assets/ui/coin.png", str(int(reward["coins"]))]]
	for id: String in Save.data["tools"]:
		items.append([HomePrize.skill_icon(id), "×%d" % int(reward["tools"])])
	items.append(["res://assets/ui/tank.png", "×1"])
	var panel_w: float = W - 80.0
	add(UiKit.piece("deep"), Vector2(40, top), Vector2(panel_w, 176))
	add(
		UiKit.label(tr("DAILY_CHEST"), 28, UiKit.GOLD), Vector2(40, top + 8.0), Vector2(panel_w, 40)
	)
	var col_w: float = (panel_w - 40.0) / items.size()
	for i: int in items.size():
		var x: float = 60.0 + i * col_w
		add(UiKit.icon(str(items[i][0]), 68), Vector2(x + (col_w - 68.0) / 2.0, top + 54.0))
		add(UiKit.label(str(items[i][1]), 24), Vector2(x, top + 124.0), Vector2(col_w, 34))


func _build_buttons(y: float, done: bool, free: bool, price: int) -> void:
	if done:
		var b := btn(
			self, tr("DAILY_DONE"), UiKit.BLUE, Vector2(135, y), Vector2(480, 110), Callable(), 40
		)
		b.disabled = true
		add(UiKit.label(tr("DAILY_TOMORROW"), 26), Vector2(0, y - 46.0), Vector2(W, 36))
	elif free:
		var go := btn(
			self,
			tr("DAILY_START"),
			UiKit.GREEN,
			Vector2(135, y),
			Vector2(480, 110),
			_start_free,
			44
		)
		Anim.pulse(go, 1.05, 1.2)
		add(UiKit.label(tr("DAILY_FREE"), 26), Vector2(0, y - 46.0), Vector2(W, 36))
	else:
		var ad := btn(
			self, tr("DAILY_RETRY"), UiKit.PURPLE, Vector2(50, y), Vector2(310, 110), _start_ad, 36
		)
		ad_badge(ad)
		ad.disabled = not Ads.available()
		var pay := btn(
			self,
			tr("DAILY_RETRY"),
			UiKit.GREEN,
			Vector2(390, y),
			Vector2(310, 110),
			_start_coins,
			36
		)
		coin_price(pay, price)


func _on_back() -> void:
	host.go_tab(HomeScreen.TAB_MAIN)


func _start_free() -> void:
	if DailyChallenge.enter(Save.data, Config.eco, Save.today(), "free"):
		_go()


func _start_ad() -> void:
	if await start_ad() and is_inside_tree():
		_go()


func _start_coins() -> void:
	if start_coins(host):
		_go()


func _go() -> void:
	Save.save()
	App.inst.go_daily()


## 看广告再进一次。看完并记了次数才返回 true
static func start_ad() -> bool:
	if not Ads.available() or not await Ads.rewarded(&"rv_daily_retry"):
		return false
	return DailyChallenge.enter(Save.data, Config.eco, Save.today(), "ad")


## 花金币再进一次；金币不够弹「金币不足」
static func start_coins(popup_host: Control) -> bool:
	if DailyChallenge.enter(Save.data, Config.eco, Save.today(), "coins"):
		return true
	var price: int = int(Config.eco["dailyChallenge"]["retryCoins"])
	if int(Save.data["coins"]) < price:
		HomePopups.coin_shortage(popup_host, price, Callable())
	return false
