class_name Slice3
extends Control
## 横向三段拉伸的贴图：左右两端按高度等比缩放，中间拉伸。
## 用于胶囊形按钮、横栏、进度条这类「只在水平方向变长」的部件。

var texture: Texture2D
## 端头在贴图里的宽度（像素）；小于 0 表示取贴图高度的一半
var cap: float = -1.0


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	resized.connect(queue_redraw)


func _draw() -> void:
	if texture == null:
		return
	var tw: float = texture.get_width()
	var th: float = texture.get_height()
	var c: float = minf(cap if cap >= 0.0 else th / 2.0, tw / 2.0)
	var scale_y: float = size.y / th
	# 部件比两个端头还窄时，把端头一起压窄
	var cw: float = minf(c * scale_y, size.x / 2.0)
	draw_texture_rect_region(texture, Rect2(0, 0, cw, size.y), Rect2(0, 0, c, th))
	draw_texture_rect_region(
		texture, Rect2(cw, 0, size.x - cw * 2.0, size.y), Rect2(c, 0, tw - c * 2.0, th)
	)
	draw_texture_rect_region(texture, Rect2(size.x - cw, 0, cw, size.y), Rect2(tw - c, 0, c, th))
