class_name HomeDeco
extends RefCounted
## 主页中央的海底场景：远、中、近三层的生物在气泡里漂着，层与层之间缓慢错位（视差），
## 再加一串往上冒的小泡泡。纯装饰，不接收点击。布局全部来自 config/game_ui.json 的 homeDeco。

const BUBBLE := "res://assets/ui/bubble.png"
const SCENE := "res://assets/ui/home_scene.jpg"
const FALLBACK := "res://assets/ui/bg_home.jpg"


## 主页背景：有整屏海湾场景图就用它，没有就用原来的底图
static func background_path() -> String:
	return SCENE if ResourceLoader.exists(SCENE) else FALLBACK


## 把场景铺进 parent（area 是 parent 的大小）。要先于入口、按钮添加，这样它们盖在上面
static func build(parent: Control, area: Vector2) -> void:
	var cfg: Dictionary = GameCfg.d()["homeDeco"]
	var layers: Array = cfg["layers"]
	for li: int in layers.size():
		var layer: Dictionary = layers[li]
		var holder := Control.new()
		holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
		parent.add_child(holder)
		var items: Array = layer["items"]
		for i: int in items.size():
			_creature(holder, items[i], area, layer, i)
		# 视差：层越近漂得越远，周期也不同步
		Anim.drift(holder, float(layer["sway"]), float(layer["period"]), li * 0.37)
	_rising(parent, area, cfg["rising"])


## item: [生物 id, x 占宽比例, y 占高比例, 气泡直径]
static func _creature(
	holder: Control, item: Array, area: Vector2, layer: Dictionary, index: int
) -> void:
	var side: float = float(item[3])
	var node := Control.new()
	node.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var center := Vector2(float(item[1]) * area.x, float(item[2]) * area.y)
	node.position = center - Vector2(side, side) / 2.0
	node.modulate = Color(1, 1, 1, float(layer["alpha"]))
	holder.add_child(node)
	var bubble := UiKit.icon(BUBBLE, side)
	bubble.modulate.a = 0.85
	node.add_child(bubble)
	var fish := UiKit.icon("res://assets/fish/%s.png" % item[0], side * 0.62)
	fish.position = Vector2(side, side) * 0.19
	node.add_child(fish)
	Anim.wiggle(fish, 7.0, 1.6 + index * 0.3, index * 0.2)
	Anim.pop_in(node, 0.15 + 0.08 * index, 0.4)
	Anim.bob(node, float(layer["bob"]), 3.0 + index * 0.5, index * 0.3)


## 小泡泡从底部一路冒到顶部，边冒边左右轻晃；开场就分散在不同高度
static func _rising(parent: Control, area: Vector2, cfg: Dictionary) -> void:
	var count: int = int(cfg["count"])
	for i: int in count:
		var side: float = randf_range(float(cfg["minSize"]), float(cfg["maxSize"]))
		var holder := Control.new()
		holder.mouse_filter = Control.MOUSE_FILTER_IGNORE
		holder.position = Vector2(randf_range(0.04, 0.96) * area.x, area.y)
		parent.add_child(holder)
		var dot := UiKit.icon(BUBBLE, side)
		dot.position = -Vector2(side, side) / 2.0
		dot.modulate.a = randf_range(0.25, 0.5)
		holder.add_child(dot)
		Anim.drift(dot, randf_range(6.0, 16.0), randf_range(2.5, 4.5), randf())
		var secs: float = randf_range(float(cfg["minSeconds"]), float(cfg["maxSeconds"]))
		_rise(holder, area.y, secs, randf())


## 从当前位置冒到顶，回到底部再来一轮；first 是第一轮已经走过的比例
static func _rise(holder: Control, bottom: float, secs: float, first: float) -> void:
	holder.position.y = bottom * (1.0 - first) - 60.0 * first
	var tw: Tween = holder.create_tween()
	tw.tween_property(holder, "position:y", -60.0, secs * (1.0 - first))
	tw.tween_callback(_rise.bind(holder, bottom, secs, 0.0))
