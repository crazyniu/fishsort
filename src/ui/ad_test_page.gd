class_name AdTestPage
extends Control
## 广告测试页，见 docs/01-玩法设计.md 第 8.2 节。只在 debug 平台可进入，文案不走翻译。

const W := 750.0

var _box: Control


func _ready() -> void:
	_build()


func _build() -> void:
	for c: Node in get_children():
		c.queue_free()
	var shade := ColorRect.new()
	shade.color = Color(0.04, 0.12, 0.16, 0.97)
	shade.size = size
	add_child(shade)
	_box = Control.new()
	_box.position = Vector2((size.x - W) / 2.0, 0)
	add_child(_box)
	_put(UiKit.label("广告测试", 48, UiKit.LEMON), Vector2(0, 20), Vector2(W, 64))
	var debug: PlatformDebug = Platform.impl as PlatformDebug
	var on: bool = debug != null and debug.ads_on
	_button(
		"广告：可用" if on else "广告：不可用",
		UiKit.GREEN if on else UiKit.CORAL,
		Vector2(30, 96),
		Vector2(330, 70),
		_toggle
	)
	_button("重置频控", UiKit.MINT, Vector2(390, 96), Vector2(330, 70), _reset)
	var placements: Dictionary = Config.ads["placements"]
	var i: int = 0
	var row_h: float = minf(92.0, (size.y - 290.0) / placements.size())
	for id: String in placements:
		var kind: String = placements[id]["type"]
		var y: float = 184 + i * row_h
		var text := UiKit.label(
			"%s\n%s · 已展示 %d 次" % [id, kind, int(Ads.shown.get(StringName(id), 0))], 22
		)
		text.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
		_put(text, Vector2(30, y), Vector2(470, row_h - 8))
		_button(
			"触发",
			UiKit.BERRY,
			Vector2(540, y + 4),
			Vector2(180, row_h - 16),
			_fire.bind(StringName(id), kind)
		)
		i += 1
	_button("关闭", UiKit.CORAL, Vector2(225, size.y - 96), Vector2(300, 76), _close)


func _put(node: Control, pos: Vector2, area: Vector2) -> void:
	node.position = pos
	node.size = area
	_box.add_child(node)


func _button(text: String, color: Color, pos: Vector2, area: Vector2, action: Callable) -> void:
	var b := UiKit.button(text, color, 26)
	b.pressed.connect(action)
	Anim.press_fx(b)
	_put(b, pos, area)


func _toggle() -> void:
	var debug: PlatformDebug = Platform.impl as PlatformDebug
	if debug != null:
		debug.ads_on = not debug.ads_on
	_build()


func _reset() -> void:
	Ads.reset_caps()
	_build()


func _fire(id: StringName, kind: String) -> void:
	match kind:
		"rewarded":
			var done: bool = await Ads.rewarded(id)
			print("[ad test] %s → %s" % [id, "发奖" if done else "不发奖"])
		"interstitial":
			await Ads.force_interstitial(int(Save.data["level"]))
		"banner":
			Ads.banner(true)
	if is_inside_tree():
		_build()


func _close() -> void:
	Ads.banner(false)
	queue_free()
