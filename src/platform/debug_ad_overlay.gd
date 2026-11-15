class_name DebugAdOverlay
extends CanvasLayer
## 模拟广告页，见 docs/01-玩法设计.md 第 8.2 节。只在 debug 平台出现，文案不走翻译。

signal closed(result: int)

const REWARD_SECONDS := 5.0

var _left: float = 0.0
var _countdown: Label
var _panel: Control


func _init() -> void:
	layer = 100


func _process(delta: float) -> void:
	if _countdown == null:
		return
	_left -= delta
	_countdown.text = "%d" % ceili(maxf(_left, 0.0))
	if _left <= 0.0:
		_finish(PlatformBase.AdResult.DONE)


func _base(title: String, placement: StringName) -> VBoxContainer:
	var shade := ColorRect.new()
	shade.color = Color(0.05, 0.07, 0.1, 0.94)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(shade)
	_panel = shade
	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.custom_minimum_size = Vector2(560, 0)
	box.position = Vector2(-280, -330)
	box.add_theme_constant_override("separation", 22)
	shade.add_child(box)
	box.add_child(UiKit.label(title, 52, UiKit.LEMON))
	box.add_child(UiKit.label("广告位：%s" % placement, 28))
	return box


func _button(box: VBoxContainer, text: String, color: Color, result: int) -> void:
	var b := UiKit.button(text, color, 32)
	b.custom_minimum_size = Vector2(560, 88)
	b.pressed.connect(_finish.bind(result))
	box.add_child(b)


func rewarded(placement: StringName) -> void:
	var box: VBoxContainer = _base("模拟激励视频", placement)
	_left = REWARD_SECONDS
	_countdown = UiKit.label("5", 120)
	box.add_child(_countdown)
	box.add_child(UiKit.label("倒计时结束自动算作看完", 24))
	_button(box, "看完（发奖励）", UiKit.GREEN, PlatformBase.AdResult.DONE)
	_button(box, "中途关闭（不发奖）", UiKit.CORAL, PlatformBase.AdResult.SKIPPED)
	_button(box, "加载失败", UiKit.BERRY, PlatformBase.AdResult.UNAVAILABLE)


func interstitial(placement: StringName) -> void:
	var box: VBoxContainer = _base("模拟插屏广告", placement)
	box.add_child(UiKit.label("1 秒后可关闭", 26))
	var b := UiKit.button("关闭", UiKit.CORAL, 32)
	b.custom_minimum_size = Vector2(560, 88)
	b.disabled = true
	b.pressed.connect(_finish.bind(PlatformBase.AdResult.DONE))
	box.add_child(b)
	get_tree().create_timer(1.0).timeout.connect(func() -> void: b.disabled = false)


func _finish(result: int) -> void:
	_countdown = null
	closed.emit(result)
	queue_free()
