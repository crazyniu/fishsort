# gdlint: disable=max-public-methods
class_name HomeModel
extends RefCounted
## 主页、抽奖、商店、签到、选关、各弹窗共用的数据与动作入口：对 src/core/meta 的薄封装。
## 界面只通过这里读写数据。时间用 Save.now()、日期用 Save.today()，随机数用 Rng，
## 每次改动后立刻存档。方法多是有意的（单一入口），所以关掉 max-public-methods。
## 返回给界面的奖品一律转成 { kind: coin|skill|inf_life|card|spin|chest|big_chest, ... }。

const CONFIG_PATH := "res://config/ui_home.json"

static var _inst: HomeModel

var cfg: Dictionary = {}

var _pending_override: String = ""
var _total_levels: int = 0


static func get_inst() -> HomeModel:
	if _inst == null:
		_inst = HomeModel.new()
		_inst._load()
	return _inst


func _load() -> void:
	cfg = JSON.parse_string(FileAccess.get_file_as_string(CONFIG_PATH))
	while FileAccess.file_exists("res://config/levels/level_%04d.json" % (_total_levels + 1)):
		_total_levels += 1


func _save() -> Dictionary:
	return Save.data


func _eco() -> Dictionary:
	return Config.eco


func _now() -> int:
	return Save.now()


func _day() -> int:
	return Save.today()


func _rng() -> Rng:
	return Rng.new(Time.get_ticks_usec())


func _commit() -> void:
	Save.save()


# ---------- 设置 ----------


func vibration_on() -> bool:
	return bool(_save()["settings"]["vibrate"])


func set_vibration(on: bool) -> void:
	_save()["settings"]["vibrate"] = on
	_commit()


# ---------- 资源 ----------


func coins() -> int:
	return int(_save()["coins"])


## 扣金币，不够返回 false
func spend(price: int) -> bool:
	if coins() < price:
		return false
	_save()["coins"] = coins() - price
	_commit()
	return true


func can_afford(price: int) -> bool:
	return coins() >= price


## key: life / refill / slot / spin / ten
func price(key: String) -> int:
	match key:
		"life":
			return int(_eco()["lives"]["buyOneCoins"])
		"refill":
			return int(_eco()["lives"]["refillCoins"])
		"slot":
			return int(_eco()["bowlSlotCoinPrice"])
		"spin":
			return int(_eco()["wheel"]["coinCost"])
		"ten":
			return int(_eco()["wheel"]["tenCost"])
	return 0


func level() -> int:
	return int(_save()["level"])


func profile() -> Dictionary:
	var info: Dictionary = Platform.impl.get_profile()
	return {
		"nickname": str(info.get("nickname", "")),
		"avatar": str(info.get("avatar", "res://assets/ui/avatar.png")),
		"level": level(),
		"best_combo": int(_save().get("bestCombo", 0)),
		"cards_have": (_save()["cards"] as Dictionary).size(),
		"cards_total": Config.species.size(),
	}


# ---------- 生命 ----------


func lives() -> int:
	return Lives.count(_save(), _eco(), _now())


func max_lives() -> int:
	return int(_eco()["lives"]["max"])


## 剩余的无限生命秒数，0 = 没有
func infinite_secs() -> int:
	return Lives.unlimited_left(_save(), _now())


## 距离下一条生命的秒数；满了返回 0
func next_life_secs() -> int:
	return Lives.seconds_to_next(_save(), _eco(), _now())


func share_lives_left() -> int:
	return Share.remaining(_save(), _eco(), "life", _day())


func share_lives_cap() -> int:
	return int(_eco()["share"]["life"]["daily"])


func buy_life() -> bool:
	var ok: bool = Lives.buy_one(_save(), _eco(), _now())
	if ok:
		_commit()
	return ok


func refill_lives() -> bool:
	var ok: bool = Lives.buy_refill(_save(), _eco(), _now())
	if ok:
		_commit()
	return ok


## 分享得 1 条生命：分享成功才发奖
func share_life() -> bool:
	if lives() >= max_lives() or share_lives_left() <= 0:
		return false
	if not Platform.impl.share({"kind": "life"}):
		return false
	var res: Dictionary = Share.claim(_save(), _eco(), "life", _day(), _now(), _rng())
	_commit()
	return not res.is_empty()


## 离开确认之后真正扣一条（第 1–5 关、无限生命期间核心层自己不扣）
func lose_life() -> void:
	Lives.lose(_save(), _eco(), level(), true, _now())
	_commit()


## 能不能开始当前关
func can_start() -> bool:
	return Lives.can_start(_save(), _eco(), level(), _now())


# ---------- 功能开放 ----------


func unlock_level(feature: String) -> int:
	return Features.unlock_level(_eco(), feature)


func is_unlocked(feature: String) -> bool:
	return Features.is_unlocked(_eco(), feature, level())


## 刚开放、还没提示过的功能；取一次就记下已提示的关数
func take_pending_unlock() -> String:
	if not _pending_override.is_empty():
		var forced: String = _pending_override
		_pending_override = ""
		return forced
	var save: Dictionary = _save()
	if not save.has("unlockSeen"):
		save["unlockSeen"] = level()
		return ""
	var fresh: Array[String] = Features.newly_unlocked(_eco(), int(save["unlockSeen"]), level())
	save["unlockSeen"] = level()
	_commit()
	return "" if fresh.is_empty() else fresh[0]


# ---------- 技能与商店 ----------


func skill_ids() -> Array:
	return Skills.ids(_eco())


func skill_price(id: String) -> int:
	return Skills.price(_eco(), id)


func skill_count(id: String) -> int:
	return Skills.count(_save(), id)


func skill_unlocked(id: String) -> bool:
	return Skills.is_unlocked(_eco(), id, level())


func buy_skill(id: String) -> bool:
	if not skill_unlocked(id):
		return false
	var ok: bool = Skills.buy(_save(), _eco(), id)
	if ok:
		_commit()
	return ok


func free_coin_amount() -> int:
	return int(_eco()["freeCoin"]["amount"])


func free_coin_cap() -> int:
	return int(_eco()["freeCoin"]["daily"])


func free_coin_used() -> int:
	Daily.roll(_save(), _day())
	return int(_save()["daily"]["freeCoin"])


## 看完 rv_free_coin 后调用：发金币，记一次
func claim_free_coins() -> bool:
	var ok: bool = Meta.take_free_coin(_save(), _eco(), _day())
	if ok:
		_commit()
	return ok


## 开缸位：金币方式。看广告的方式由界面先 await Ads.rewarded(&"rv_bowl_slot") 再直接开
func buy_slot() -> bool:
	return spend(price("slot"))


# ---------- 抽奖 ----------


func spins_left() -> int:
	return Wheel.spins_left(_save(), _eco(), _day())


func spin_share_left() -> int:
	return Share.remaining(_save(), _eco(), "wheel", _day())


func spin_share_cap() -> int:
	return int(_eco()["share"]["wheel"]["daily"])


func spin_ad_left() -> int:
	return Wheel.ad_left(_save(), _eco(), _day())


func spin_ad_cap() -> int:
	return int(_eco()["wheel"]["adPerDay"])


func share_spin() -> bool:
	if spin_share_left() <= 0 or not Platform.impl.share({"kind": "wheel"}):
		return false
	var res: Dictionary = Share.claim(_save(), _eco(), "wheel", _day(), _now(), _rng())
	_commit()
	return not res.is_empty()


## 看完 rv_wheel 后调用
func ad_spin() -> bool:
	var ok: bool = Wheel.claim_ad(_save(), _eco(), _day())
	if ok:
		_commit()
	return ok


## 转盘上的扇区（外观布局来自 config/ui_home.json，奖品内容来自经济表）
func wheel() -> Array:
	var out: Array = []
	for seg: Dictionary in cfg["wheel"]:
		var view: Dictionary = prize_view(_prize_cfg(str(seg["id"])))
		view["tone"] = int(seg["tone"])
		view["id"] = str(seg["id"])
		out.append(view)
	return out


## 公示概率：[{ kind, amount, rarity, pct }]
func odds() -> Array:
	var out: Array = []
	for o: Dictionary in Wheel.odds(_eco()):
		var view: Dictionary = prize_view(o)
		var pct: float = float(o["percent"])
		view["pct"] = ("%d%%" % int(pct)) if is_equal_approx(pct, roundf(pct)) else "%.1f%%" % pct
		out.append(view)
	return out


func _prize_cfg(id: String) -> Dictionary:
	for p: Dictionary in _eco()["wheel"]["prizes"]:
		if p["id"] == id:
			return p
	return {}


## 核心的奖品表项 → 界面用的奖品字典
func prize_view(p: Dictionary) -> Dictionary:
	match str(p["kind"]):
		"coins":
			return {"kind": "coin", "amount": int(p["amount"])}
		"skill":
			return {"kind": "skill", "amount": int(p.get("amount", 1))}
		"unlimited":
			return {"kind": "inf_life", "amount": int(p["amount"]) / 60}
		"card":
			return {"kind": "card", "rarity": str(p["rarity"]), "amount": 1}
	return {"kind": "coin", "amount": 0}


## 单抽结果 → 界面奖品字典，附上该落在哪个扇区（index）
func result_view(res: Dictionary) -> Dictionary:
	var view: Dictionary = prize_view(_prize_cfg(str(res["prize"])))
	if not (res["card"] as Dictionary).is_empty():
		var card: Dictionary = res["card"]
		view["card_id"] = str(card["id"])
		view["rarity"] = str(card["rarity"])
		view["is_new"] = bool(card["is_new"])
		view["dupe_coins"] = int(card.get("coins", 0))
	if str(res["skill"]) != "":
		view["skill"] = str(res["skill"])
	view["index"] = _segment_for(str(res["prize"]))
	return view


func _segment_for(prize_id: String) -> int:
	var segs: Array = cfg["wheel"]
	var hits: Array[int] = []
	for i: int in segs.size():
		if segs[i]["id"] == prize_id:
			hits.append(i)
	if hits.is_empty():
		# 传说卡和史诗卡共用最后一个珍稀扇区
		hits.append(segs.size() - 1)
	return hits[randi() % hits.size()]


## 消耗一次抽奖。没有存下的次数时用金币（pay_coins）。没次数 / 金币不够返回空字典
func spin_wheel(pay_coins: bool) -> Dictionary:
	var res: Dictionary = Wheel.spin(
		_save(), _eco(), Config.species, _rng(), _day(), _now(), "coins" if pay_coins else "spin"
	)
	if res.is_empty():
		return {}
	_commit()
	return result_view(res)


## 十连（9000 金币）。返回十个奖品字典；金币不够返回空数组
func ten_pull() -> Array:
	var res: Dictionary = Wheel.ten_pull(_save(), _eco(), Config.species, _rng(), _day(), _now())
	if res.is_empty():
		return []
	_commit()
	var out: Array = []
	for r: Dictionary in res["results"]:
		out.append(result_view(r))
	return out


# ---------- 签到 ----------


## 七天的奖励，界面用的奖品字典
func signin_days() -> Array:
	var out: Array = []
	for d: Dictionary in _eco()["signInDays"]:
		if d.has("coins"):
			out.append({"kind": "coin", "amount": int(d["coins"])})
		elif d.has("wheel"):
			out.append({"kind": "spin", "amount": int(d["wheel"])})
		elif d.has("skill"):
			out.append({"kind": "skill", "amount": int(d["skill"])})
		elif d.has("chest"):
			out.append({"kind": "chest", "amount": 1})
		else:
			out.append({"kind": "big_chest", "amount": int(d["bigChest"]["coins"])})
	return out


## 已累计签到的天数
func signin_count() -> int:
	return int(_save()["signin"]["count"])


func can_sign_in() -> bool:
	return SignIn.can_claim(_save(), _day())


## 今天该领的是第几天（0 起）
func signin_today() -> int:
	return SignIn.next_index(_save(), _eco())


## 领签到奖励；double 为先看完 rv_signin_double。返回奖品列表，今天已领过返回空数组
func sign_in(double: bool) -> Array:
	var res: Dictionary = SignIn.claim(
		_save(), _eco(), Config.species, _rng(), _day(), _now(), double
	)
	if res.is_empty():
		return []
	_commit()
	return _signin_prizes(res)


func _signin_prizes(res: Dictionary) -> Array:
	var out: Array = []
	if int(res["coins"]) > 0:
		out.append({"kind": "coin", "amount": int(res["coins"])})
	if int(res["wheel"]) > 0:
		out.append({"kind": "spin", "amount": int(res["wheel"])})
	for id: String in res["skills"]:
		if id != "":
			out.append({"kind": "skill", "amount": 1, "skill": id})
	for card: Dictionary in res["cards"]:
		out.append(
			{"kind": "card", "amount": 1, "rarity": str(card["rarity"]), "card_id": str(card["id"])}
		)
	if int(res["unlimited"]) > 0:
		out.append({"kind": "inf_life", "amount": int(res["unlimited"]) / 60})
	return out


# ---------- 选关 ----------


func is_challenge(n: int) -> bool:
	return n % 5 == 0


## "passed" / "current" / "locked"
func level_state(n: int) -> String:
	if n < level():
		return "passed"
	return "current" if n == level() else "locked"


func total_levels() -> int:
	return _total_levels


## 今天已用 / 每天有奖励的重玩次数
func replay_used() -> int:
	Daily.roll(_save(), _day())
	return mini(int(_save()["daily"]["replay"]), replay_cap())


func replay_cap() -> int:
	return int(_eco()["replay"]["rewardedPerDay"])


# ---------- 仅调试：截图和试玩用 ----------


func set_level(n: int) -> void:
	_save()["level"] = n
	_save()["unlockSeen"] = n


func set_coins(n: int) -> void:
	_save()["coins"] = n


func set_lives(n: int) -> void:
	var lv: Dictionary = _save()["lives"]
	lv["count"] = clampi(n, 0, max_lives())
	lv["stamp"] = _now() - 300
	lv["lastNow"] = _now()


func set_infinite_secs(n: int) -> void:
	_save()["lives"]["unlimitedUntil"] = _now() + n


func set_pending_unlock(feature: String) -> void:
	_pending_override = feature
