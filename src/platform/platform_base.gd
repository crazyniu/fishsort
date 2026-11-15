class_name PlatformBase
extends RefCounted
## 平台能力接口，见 docs/04-技术架构.md 第 5 节。各平台继承并覆盖。

enum AdResult { DONE, SKIPPED, UNAVAILABLE }


func id() -> StringName:
	return &"base"


func init() -> void:
	pass


## 协程：await 它，返回 AdResult
func show_rewarded(_placement: StringName) -> AdResult:
	return AdResult.UNAVAILABLE


func show_interstitial(_placement: StringName) -> void:
	pass


func show_banner(_placement: StringName) -> void:
	pass


func hide_banner() -> void:
	pass


func get_profile() -> Dictionary:
	return {}


func load_data(_key: String) -> String:
	return ""


func save_data(_key: String, _value: String) -> void:
	pass


func share(_payload: Dictionary) -> bool:
	return false


func submit_score(_board: StringName, _value: int) -> void:
	pass


func show_leaderboard(_board: StringName) -> void:
	pass


func vibrate(_kind: int) -> void:
	pass


func track(_event: StringName, _params: Dictionary = {}) -> void:
	pass


func has_capability(_cap: StringName) -> bool:
	return false
