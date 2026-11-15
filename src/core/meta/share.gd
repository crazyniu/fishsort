class_name Share
extends RefCounted
## 分享奖励的每日计数，见 docs/01 第 5.8 节。kind: wheel / life / card / help。
## 存档 save["daily"]["share"][kind]。开发阶段分享即成功，接平台后由 Platform 返回成功再调 claim。


static func remaining(save: Dictionary, eco: Dictionary, kind: String, day: int) -> int:
	Daily.roll(save, day)
	var used: int = int(save["daily"]["share"].get(kind, 0))
	return maxi(int(eco["share"][kind]["daily"]) - used, 0)


## 领分享奖励。次数用完返回空字典，否则返回 { kind, coins, life, wheel, skill }
static func claim(
	save: Dictionary, eco: Dictionary, kind: String, day: int, now: int, rng: Rng
) -> Dictionary:
	if remaining(save, eco, kind, day) <= 0:
		return {}
	save["daily"]["share"][kind] = int(save["daily"]["share"].get(kind, 0)) + 1
	var rw: Dictionary = eco["share"][kind]["reward"]
	var res: Dictionary = {"kind": kind, "coins": 0, "life": 0, "wheel": 0, "skill": ""}
	if rw.has("coins"):
		save["coins"] = int(save["coins"]) + int(rw["coins"])
		res["coins"] = int(rw["coins"])
	if rw.has("life"):
		res["life"] = Lives.add(save, eco, int(rw["life"]), now)
	if rw.has("wheel"):
		save["wheel"]["extra"] = int(save["wheel"]["extra"]) + int(rw["wheel"])
		res["wheel"] = int(rw["wheel"])
	if rw.has("skill"):
		res["skill"] = Skills.grant_random(save, eco, rng)
	return res
