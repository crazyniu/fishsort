class_name Settle
extends RefCounted
## 过关结算（新版）。把基础金币、连击金币、首胜、重玩限额、进度推进、技能解锁一次算完。
## 宝箱不在这里开：result["chest_ok"] 为 true 时界面层再调 LevelChest.open。


## args: { level, challenge, day, now, combo_coins, best_combo }
## 返回 { rewarded, replay, first_win, coins_base, coins_combo, coins_best, coins,
##        level_up, new_skills, new_features, wheel_spin, unlimited, chest_ok }
static func win(save: Dictionary, eco: Dictionary, args: Dictionary) -> Dictionary:
	var day: int = int(args["day"])
	Daily.roll(save, day)
	var level_id: int = int(args["level"])
	var challenge: bool = bool(args["challenge"])
	var daily: Dictionary = save["daily"]
	var replay: bool = level_id < int(save["level"])
	var rewarded: bool = true
	if replay:
		rewarded = int(daily["replay"]) < int(eco["replay"]["rewardedPerDay"])
		daily["replay"] = int(daily["replay"]) + 1
	var res: Dictionary = {
		"rewarded": rewarded,
		"replay": replay,
		"first_win": false,
		"coins_base": 0,
		"coins_combo": 0,
		"coins_best": 0,
		"coins": 0,
		"level_up": false,
		"new_skills": [],
		"new_features": [],
		"wheel_spin": false,
		"unlimited": 0,
		"chest_ok": rewarded,
	}
	if rewarded:
		res["coins_base"] = int(eco["challengeCoins"] if challenge else eco["levelCoins"])
		res["coins_combo"] = int(args.get("combo_coins", 0))
		res["coins_best"] = Combo.best_bonus_for(int(args.get("best_combo", 0)), eco["combo"])
		res["coins"] = (int(res["coins_base"]) + int(res["coins_combo"]) + int(res["coins_best"]))
		save["coins"] = int(save["coins"]) + int(res["coins"])
	if not daily["firstWin"]:
		daily["firstWin"] = true
		res["first_win"] = true
		res["wheel_spin"] = true
		Wheel.add_spins(save, int(eco["wheel"]["firstWinSpins"]))
		res["unlimited"] = int(eco["lives"]["firstWinUnlimitedSeconds"])
		Lives.grant_unlimited(save, int(res["unlimited"]), int(args["now"]))
	save["week"]["cleared"] = int(save["week"]["cleared"]) + 1
	save["fails"] = {"level": 0, "count": 0}
	if level_id == int(save["level"]):
		var old: int = int(save["level"])
		save["level"] = level_id + 1
		res["level_up"] = true
		res["new_features"] = Features.newly_unlocked(eco, old, level_id + 1)
		res["new_skills"] = Skills.sync_unlocks(save, eco)
	return res


## 看完翻倍广告后调用：把本次结算金币再发一份，返回加了多少
static func double_coins(save: Dictionary, eco: Dictionary, result: Dictionary) -> int:
	var extra: int = int(result["coins"]) * (int(eco["adCoinMultiplier"]) - 1)
	save["coins"] = int(save["coins"]) + extra
	return extra
