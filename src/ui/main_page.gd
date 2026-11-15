class_name MainPage
extends HomePage
## 主页（docs/01 §5.3）：中间一张海湾场景大图，两侧功能入口，下面是绿色大按钮「第 N 关」。
## 未开放的入口显示灰色图标和「第 N 关」，点了提示「第 N 关解锁」。

const ENTRY := 104.0

var _model: HomeModel


func build() -> void:
	_model = host.model
	# 不再贴一张带边界的场景图：标题、漂浮的生物和入口直接放在整屏海底背景上
	var title_label := UiKit.label(tr("UI_TITLE"), 96, UiKit.GOLD)
	add(title_label, Vector2(0, 30), Vector2(W, 130))
	Anim.pop_in(title_label, 0.05, 0.45)
	_build_deco()
	_build_entries()
	_build_start()
	_check_unlock()


## 几只生物在气泡里漂着，占住画面中央
func _build_deco() -> void:
	var mid: float = (size.y - 220.0) / 2.0 + 60.0
	var deco: Array = [
		["c04", 215.0, mid - 250.0, 210.0],
		["c16", 420.0, mid - 120.0, 180.0],
		["c06", 180.0, mid + 10.0, 190.0],
		["c03", 400.0, mid + 120.0, 150.0],
	]
	for i: int in deco.size():
		var d: Array = deco[i]
		var side: float = d[3]
		var holder := Control.new()
		add(holder, Vector2(d[1], d[2]))
		var bubble := UiKit.icon("res://assets/ui/bubble.png", side)
		bubble.modulate.a = 0.85
		holder.add_child(bubble)
		var fish := UiKit.icon("res://assets/fish/%s.png" % d[0], side * 0.62)
		fish.position = Vector2(side, side) * 0.19
		holder.add_child(fish)
		Anim.wiggle(fish, 7.0, 1.6 + i * 0.3)
		Anim.pop_in(holder, 0.15 + 0.1 * i, 0.4)
		Anim.bob(holder, 10.0, 3.0 + i * 0.5, i * 0.3)


func _build_entries() -> void:
	var left: Array = [
		["signin", "res://assets/ui/gift.png", "UI_SIGNIN", _open_signin],
		["levelSelect", "res://assets/kit/ic_route.png", "H_ENTRY_LEVELS", _open_levels],
	]
	var right: Array = [
		["skill_shuffle", "res://assets/ui/tool_shuffle.png", "H_FEAT_SKILL", _open_skills],
		["wheel", "res://assets/ui/tab_wheel.png", "H_FEAT_WHEEL", _open_wheel],
	]
	for i: int in left.size():
		_entry(left[i], Vector2(30, 190 + i * 170))
	for i: int in right.size():
		_entry(right[i], Vector2(W - 30 - ENTRY, 190 + i * 170))


## spec: [功能开放项, 图标, 文案键, 点击动作]
func _entry(spec: Array, pos: Vector2) -> void:
	var feature: String = spec[0]
	var open: bool = _model.is_unlocked(feature)
	var holder := Control.new()
	add(holder, pos, Vector2(ENTRY, ENTRY + 40))
	var tile := UiKit.piece("tile")
	holder.add_child(tile)
	tile.size = Vector2(ENTRY, ENTRY)
	var icon := UiKit.icon(spec[1], 72)
	icon.position = Vector2((ENTRY - 72.0) / 2.0, (ENTRY - 72.0) / 2.0 - 3.0)
	holder.add_child(icon)
	var caption: String = tr(spec[2])
	if open:
		if feature == "signin" and _model.can_sign_in():
			# 还没签到：红点 + 礼物晃动
			var dot := UiKit.badge("dot_red", 30)
			dot.position = Vector2(ENTRY - 22.0, -8.0)
			holder.add_child(dot)
			Anim.wiggle(icon, 9.0, 0.7)
	else:
		tile.modulate = Color(0.62, 0.68, 0.76)
		icon.modulate = Color(0.55, 0.6, 0.66)
		var lock := UiKit.icon("res://assets/ui/lock.png", 40)
		lock.position = Vector2(ENTRY - 40.0, ENTRY - 44.0)
		holder.add_child(lock)
		caption = tr("UI_LEVEL") % _model.unlock_level(feature)
	var label := UiKit.label(caption, 24)
	label.position = Vector2(-20, ENTRY + 6.0)
	label.size = Vector2(ENTRY + 40.0, 32)
	holder.add_child(label)
	var hot := UiKit.hotspot(Vector2.ZERO, Vector2(ENTRY, ENTRY + 40))
	hot.pressed.connect(_on_entry.bind(feature, spec[3]))
	Anim.press_fx(hot)
	holder.add_child(hot)
	Anim.pop_in(holder, 0.1, 0.3)


func _on_entry(feature: String, action: Callable) -> void:
	if host.check_unlocked(feature):
		action.call()


func _open_signin() -> void:
	MetaPopups.signin(host, _after_signin)


func _after_signin() -> void:
	host.refresh_top()
	host.rebuild_page()


func _open_levels() -> void:
	LevelRoute.open(host)


func _open_skills() -> void:
	host.go_tab(HomeScreen.TAB_SHOP)


func _open_wheel() -> void:
	host.go_tab(HomeScreen.TAB_WHEEL)


func _build_start() -> void:
	var n: int = _model.level()
	var challenge: bool = _model.is_challenge(n)
	var start := btn(
		self,
		tr("UI_LEVEL") % n,
		UiKit.ORANGE if challenge else UiKit.GREEN,
		Vector2(135, size.y - 176.0),
		Vector2(480, 124),
		host.start_level,
		52
	)
	Anim.pulse(start, 1.05, 1.2)
	if challenge:
		var tag := UiKit.label(tr("UI_CHALLENGE"), 26, UiKit.GOLD)
		add(tag, Vector2(135, size.y - 214.0), Vector2(480, 36))


## 功能刚开放：弹一次「新功能」，点「去看看」直接进入
func _check_unlock() -> void:
	var feature: String = _model.take_pending_unlock()
	if feature.is_empty():
		return
	var tw: Tween = create_tween()
	tw.tween_interval(0.5)
	tw.tween_callback(
		func() -> void: HomePopups.feature_unlocked(host, feature, _go_feature.bind(feature))
	)


func _go_feature(feature: String) -> void:
	match feature:
		"signin":
			_open_signin()
		"levelSelect":
			_open_levels()
		"wheel":
			_open_wheel()
		"album":
			host.go_tab(HomeScreen.TAB_COLLECTION)
		"rank":
			host.go_tab(HomeScreen.TAB_RANK)
		_:
			_open_skills()
