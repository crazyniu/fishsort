class_name GamePopups
extends RefCounted
## 局内所有弹窗的唯一入口（适配层）。现在用旧的 PopupCard；
## 统一弹窗（src/ui 的新版）做好后，只改这个文件就能整体切换，GameScreen 不用动。
## 每个函数返回弹窗节点，用 close() 关掉。按钮回调由调用方给。


static func close(popup: Control) -> void:
	if popup != null and is_instance_valid(popup):
		(popup as PopupCard).close()


static func _open(host: Control, title: String, lines: Array[String], buttons: Array) -> Control:
	return PopupCard.open(host, title, lines, buttons)


## 设置：音乐、音效开关，重开，回主页，关闭。cb: { music, sound, restart, home, close }
static func settings(host: Control, cb: Dictionary) -> Control:
	var music: bool = Save.data["settings"]["music"]
	var sound: bool = Save.data["settings"]["sound"]
	return _open(
		host,
		host.tr("UI_SETTINGS"),
		[],
		[
			[host.tr("UI_MUSIC_ON" if music else "UI_MUSIC_OFF"), UiKit.BLUE, cb["music"]],
			[host.tr("UI_SOUND_ON" if sound else "UI_SOUND_OFF"), UiKit.BLUE, cb["sound"]],
			[host.tr("UI_RESTART"), UiKit.ORANGE, cb["restart"]],
			[host.tr("UI_HOME"), UiKit.PURPLE, cb["home"]],
			[host.tr("UI_CLOSE"), UiKit.GREEN, cb["close"]],
		]
	)


## 离开确认：走过步之后退出或重开会扣 1 条生命
static func leave_confirm(host: Control, on_leave: Callable, on_stay: Callable) -> Control:
	return _open(
		host,
		host.tr("UI_LEAVE_TITLE"),
		[host.tr("UI_LEAVE_COST")],
		[
			[host.tr("UI_KEEP_PLAYING"), UiKit.GREEN, on_stay],
			[host.tr("UI_LEAVE"), UiKit.ORANGE, on_leave],
		]
	)


## 失败 / 复活：reason 是失败原因的文案键；can_revive 时有看广告复活；costs_life 时提示放弃扣命
static func lose(
	host: Control, reason: String, can_revive: bool, costs_life: bool, cb: Dictionary
) -> Control:
	var lines: Array[String] = [host.tr(reason)]
	if costs_life:
		lines.append(host.tr("UI_GIVEUP_COST"))
	var buttons: Array = []
	if can_revive:
		buttons.append([host.tr("UI_REVIVE"), UiKit.PURPLE, cb["revive"]])
	buttons.append([host.tr("UI_RETRY"), UiKit.ORANGE, cb["retry"]])
	buttons.append([host.tr("UI_HOME"), UiKit.BLUE, cb["home"]])
	return _open(host, host.tr("UI_LOSE"), lines, buttons)


## 没命了：等恢复、花金币买一条，或回主页
static func no_lives(
	host: Control, minutes: int, price: int, on_buy: Callable, on_home: Callable
) -> Control:
	return _open(
		host,
		host.tr("UI_NO_LIVES"),
		[host.tr("UI_NO_LIVES_WAIT") % minutes],
		[
			[host.tr("UI_BUY_LIFE") % price, UiKit.GREEN, on_buy],
			[host.tr("UI_HOME"), UiKit.BLUE, on_home],
		]
	)


## 开缸位（广告不可用时改用金币）
static func bowl_slot(host: Control, price: int, on_pay: Callable, on_close: Callable) -> Control:
	return _open(
		host,
		host.tr("UI_AD_UNAVAILABLE"),
		[host.tr("UI_SLOT_COIN") % price],
		[
			[host.tr("UI_CONFIRM"), UiKit.GREEN, on_pay],
			[host.tr("UI_CLOSE"), UiKit.ORANGE, on_close],
		]
	)
