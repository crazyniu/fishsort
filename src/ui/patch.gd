class_name Patch
extends Control
## 九宫格部件：把 assets/kit 里的 3 倍密度贴图按设计像素画出来。
## 边距和投影留边来自 kit.json，所以圆角和描边在任何尺寸下都不变形、不发虚。

static var _meta: Dictionary = {}

var texture: Texture2D
var _mx: float = 0.0
var _my: float = 0.0
var _pad: float = 0.0
var _density: float = 3.0


static func _load_meta() -> void:
	if _meta.is_empty():
		_meta = JSON.parse_string(FileAccess.get_file_as_string("res://assets/kit/kit.json"))


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	# 九宫格各块之间不能有 mipmap 渗色
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	resized.connect(queue_redraw)


func setup(piece: String) -> Patch:
	_load_meta()
	texture = load("res://assets/kit/%s.png" % piece)
	var info: Dictionary = _meta["pieces"][piece]
	_density = float(_meta["density"])
	_mx = float(info["mx"])
	_my = float(info["my"])
	_pad = float(info["pad"])
	queue_redraw()
	return self


func _draw() -> void:
	if texture == null:
		return
	var d: float = _density
	var tw: float = texture.get_width()
	var th: float = texture.get_height()
	# 目标矩形向外扩出投影留边
	var x0: float = -_pad
	var y0: float = -_pad
	var w: float = size.x + _pad * 2.0
	var h: float = size.y + _pad * 2.0
	if _mx <= 0.0 or _my <= 0.0:
		draw_texture_rect(texture, Rect2(x0, y0, w, h), false)
		return
	# 部件比两边边距之和还小时，等比压缩边距
	var mx: float = minf(_mx, w / 2.0)
	var my: float = minf(_my, h / 2.0)
	var sx: Array[float] = [0.0, _mx * d, tw - _mx * d, tw]
	var sy: Array[float] = [0.0, _my * d, th - _my * d, th]
	var dx: Array[float] = [x0, x0 + mx, x0 + w - mx, x0 + w]
	var dy: Array[float] = [y0, y0 + my, y0 + h - my, y0 + h]
	for row: int in 3:
		for col: int in 3:
			var dst := Rect2(dx[col], dy[row], dx[col + 1] - dx[col], dy[row + 1] - dy[row])
			if dst.size.x <= 0.0 or dst.size.y <= 0.0:
				continue
			var src := Rect2(sx[col], sy[row], sx[col + 1] - sx[col], sy[row + 1] - sy[row])
			draw_texture_rect_region(texture, dst, src)
