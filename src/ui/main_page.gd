class_name MainPage
extends HomePage
## 主页（docs/01 §5.3）：中间一张海湾场景大图，两侧功能入口，下面是绿色大按钮「第 N 关」。
## 未开放的入口显示灰色图标和「第 N 关」，点了提示「第 N 关解锁」。

const ENTRY := 104.0

var _model: HomeModel
## 功能开放项 → 它在主页上的入口节点
var _entries: Dictionary = {}
## 解锁后指路的光环，点了目标就收掉
var _guide: Control


func build() -> void:
	_model = host.model
	# 不再贴一张带边界的场景图：标题、漂浮的生物和入口直接放在整屏海底背景上
	var title_label := UiKit.label(tr("UI_TITLE"), 96, UiKit.GOLD)
	add(title_label, Vector2(0, 30), Vector2(W, 130))
	Anim.pop_in(title_label, 0.05, 0.45)
	HomeDeco.build(self, size)
	_build_entries()
	_build_start()
	_check_unlock()


func _build_entries() -> void:
	# 主页两侧只留签到和抽奖；选关在底栏，技能在商店
	var left: Array = [["signin", "res://assets/ui/gift.png", "UI_SIGNIN", _open_signin]]
	var right: Array = [["wheel", "res://assets/ui/tab_wheel.png", "H_FEAT_WHEEL", _open_wheel]]
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
	_entries[feature] = holder
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
	_end_guide()
	if feature == "wheel":
		# 没开放也进去：抽奖页自己会显示「第 N 关解锁」
		action.call()
	elif host.check_unlocked(feature):
		action.call()


func _open_signin() -> void:
	MetaPopups.signin(host, _after_signin)


func _after_signin() -> void:
	host.refresh_top()
	host.rebuild_page()


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


## 功能刚开放：在对应入口或页签上放解锁动画，再用光环指着它等玩家点（不弹窗）
func _check_unlock() -> void:
	var feature: String = _model.take_pending_unlock()
	if feature.is_empty():
		return
	var tab: int = _unlock_tab(feature)
	if _entries.has(feature):
		var holder: Control = _entries[feature]
		var at: Vector2 = holder.position + Vector2(ENTRY, ENTRY) / 2.0
		_guide = HomeGuide.play(self, at, holder, ENTRY)
	else:
		# 页签在页面下方：页面坐标里它的图标中心
		var tab_w: float = (W - 32.0) / HomeScreen.TAB_KEYS.size()
		var at := Vector2(16.0 + (tab + 0.5) * tab_w, size.y + 84.0)
		_guide = HomeGuide.play(self, at, null, 96.0)


## 开放的功能落在哪个页签上（技能和商店都在商店页签）
func _unlock_tab(feature: String) -> int:
	match feature:
		"levelSelect":
			return HomeScreen.TAB_LEVELS
		"album":
			return HomeScreen.TAB_COLLECTION
		"rank":
			return HomeScreen.TAB_RANK
	return HomeScreen.TAB_SHOP


func _end_guide() -> void:
	if _guide != null and is_instance_valid(_guide):
		Anim.fade_out_free(_guide, 0.15)
	_guide = null
