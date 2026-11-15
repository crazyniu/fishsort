extends Node
## autoload「Ads」：所有广告调用的唯一入口，负责频控与统计。
## 广告位编号见 docs/01-玩法设计.md 第 8.1 节。

## 本次运行各广告位的展示次数（广告测试页用）
var shown: Dictionary = {}


func _now() -> float:
	return Time.get_unix_time_from_system()


func _count(placement: StringName) -> void:
	shown[placement] = int(shown.get(placement, 0)) + 1
	Platform.impl.track(&"ad_show", {"placement": placement})


## 激励视频。只有完整看完才返回 true
func rewarded(placement: StringName) -> bool:
	var result: int = await Platform.impl.show_rewarded(placement)
	if result != PlatformBase.AdResult.DONE:
		return false
	_count(placement)
	Meta.mark_rewarded(Save.data, _now())
	return true


func available() -> bool:
	return Platform.impl.ads_available()


## 过关后按频控决定要不要弹插屏
func interstitial_after_level(level_id: int) -> void:
	if (
		not available()
		or not Meta.should_show_interstitial(Save.data, Config.ads, level_id, _now())
	):
		return
	await force_interstitial(level_id)


func force_interstitial(level_id: int) -> void:
	await Platform.impl.show_interstitial(&"int_level_end")
	_count(&"int_level_end")
	Meta.mark_interstitial(Save.data, level_id, _now())
	Save.save()


func banner(on: bool) -> void:
	if on and available():
		Platform.impl.show_banner(&"bn_result")
		_count(&"bn_result")
	else:
		Platform.impl.hide_banner()


## 测试用：清掉频控记录
func reset_caps() -> void:
	shown.clear()
	Save.data["ads"] = PlayerData.create(Config.eco)["ads"]
	Save.data["daily"]["freeCoin"] = 0
	Save.save()
