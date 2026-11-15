extends Node
## autoload「Platform」：启动时按运行环境挑一个平台实现。

var impl: PlatformBase


func _ready() -> void:
	# 真实平台实现在 M5 接入，在那之前三端都用 debug
	impl = PlatformDebug.new()
	impl.init()
