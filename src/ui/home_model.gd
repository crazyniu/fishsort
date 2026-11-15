# gdlint: disable=max-public-methods
class_name HomeModel
extends RefCounted
## 主页、抽奖、商店、签到、选关、各弹窗共用的「假数据 + 全部动作」。
## 界面只通过这里的方法读写数据；接入 src/core/meta 的真实逻辑时，只替换这一个文件。
## 现在的数据只存在内存里，不读写存档。
## 这是对外的唯一接口，方法多是有意的，所以关掉 max-public-methods。

const CONFIG_PATH := "res://config/ui_home.json"
const SKILL_IDS: Array[String] = ["shuffle", "blow", "net", "flow"]

static var _inst: HomeModel

var cfg: Dictionary = {}

var _coins: int = 0
var _lives: int = 0
var _life_secs: int = 0
var _inf_secs: int = 0
var _level: int = 1
var _signin_count: int = 0
var _signed_today: bool = false
var _free_coin_used: int = 0
var _spins: int = 0
var _spin_share_used: int = 0
var _spin_ad_used: int = 0
var _life_share_used: int = 0
var _skills: Dictionary = {}
var _pending_unlock: String = ""
var _vibration: bool = true


static func get_inst() -> HomeModel:
	if _inst == null:
		_inst = HomeModel.new()
		_inst._load()
	return _inst


func _load() -> void:
	cfg = JSON.parse_string(FileAccess.get_file_as_string(CONFIG_PATH))
	var fake: Dictionary = cfg["fake"]
	_coins = int(fake["coins"])
	_lives = int(fake["lives"])
	_life_secs = int(fake["next_life_secs"])
	_level = int(fake["level"])
	_signin_count = int(fake["signin_count"])
	_free_coin_used = int(fake["free_coin_used"])
	_spins = int(cfg["spin"]["free_daily"])
	for id: String in SKILL_IDS:
		_skills[id] = 2


# ---------- 设置 ----------


func vibration_on() -> bool:
	return _vibration


func set_vibration(on: bool) -> void:
	_vibration = on


# ---------- 资源 ----------


func coins() -> int:
	return _coins


func add_coins(n: int) -> void:
	_coins += n


## 扣金币，不够返回 false
func spend(price: int) -> bool:
	if _coins < price:
		return false
	_coins -= price
	return true


func can_afford(price: int) -> bool:
	return _coins >= price


func price(key: String) -> int:
	return int(cfg["prices"][key])


func level() -> int:
	return _level


func profile() -> Dictionary:
	var fake: Dictionary = cfg["fake"]
	return {
		"nickname": str(fake["nickname"]),
		"avatar": "res://assets/ui/avatar.png",
		"level": _level,
		"best_combo": int(fake["best_combo"]),
		"cards_have": int(fake["cards_have"]),
		"cards_total": int(fake["cards_total"]),
	}


# ---------- 生命 ----------


func lives() -> int:
	return _lives


func max_lives() -> int:
	return int(cfg["lives"]["max"])


## 剩余的无限生命秒数，0 = 没有
func infinite_secs() -> int:
	return _inf_secs


## 距离下一条生命的秒数；满了返回 0
func next_life_secs() -> int:
	return 0 if _lives >= max_lives() else _life_secs


func share_lives_left() -> int:
	return int(cfg["lives"]["share_daily"]) - _life_share_used


## 界面每帧调一次：推进生命恢复和无限生命的倒计时
func tick(delta: float, carry: float) -> float:
	carry += delta
	while carry >= 1.0:
		carry -= 1.0
		if _inf_secs > 0:
			_inf_secs -= 1
		if _lives < max_lives():
			_life_secs -= 1
			if _life_secs <= 0:
				_lives += 1
				_life_secs = int(cfg["lives"]["regen_secs"])
	return carry


func buy_life() -> bool:
	if _lives >= max_lives() or not spend(price("life")):
		return false
	_lives += 1
	return true


func refill_lives() -> bool:
	if _lives >= max_lives() or not spend(price("refill")):
		return false
	_lives = max_lives()
	return true


func share_life() -> bool:
	if share_lives_left() <= 0 or _lives >= max_lives():
		return false
	_life_share_used += 1
	_lives += 1
	return true


## 假数据里用来演示生命为 0 的弹窗
func set_lives(n: int) -> void:
	_lives = clampi(n, 0, max_lives())


## 仅假数据：截图和试玩时直接设置金币、无限生命
func set_coins(n: int) -> void:
	_coins = n


func set_infinite_secs(n: int) -> void:
	_inf_secs = n


## 离开确认之后真正扣一条
func lose_life() -> void:
	if _inf_secs <= 0:
		_lives = maxi(0, _lives - 1)


# ---------- 功能开放 ----------


func unlock_level(feature: String) -> int:
	return int(cfg["unlocks"].get(feature, 1))


func is_unlocked(feature: String) -> bool:
	return _level >= unlock_level(feature)


## 刚开放、还没播过解锁动画的功能；取一次就清掉
func take_pending_unlock() -> String:
	var id: String = _pending_unlock
	_pending_unlock = ""
	return id


func set_pending_unlock(feature: String) -> void:
	_pending_unlock = feature


# ---------- 技能与商店 ----------


func skill_price(id: String) -> int:
	for s: Dictionary in cfg["skills"]:
		if s["id"] == id:
			return int(s["price"])
	return 0


func skill_icon(id: String) -> String:
	for s: Dictionary in cfg["skills"]:
		if s["id"] == id:
			return str(s["icon"])
	return ""


func skill_count(id: String) -> int:
	return int(_skills.get(id, 0))


func skill_unlocked(id: String) -> bool:
	return is_unlocked("skill_" + id)


func buy_skill(id: String) -> bool:
	if not spend(skill_price(id)):
		return false
	_skills[id] = skill_count(id) + 1
	return true


func free_coin_amount() -> int:
	return int(cfg["free_coin"]["amount"])


func free_coin_cap() -> int:
	return int(cfg["free_coin"]["daily"])


func free_coin_used() -> int:
	return _free_coin_used


## 看完广告后调用：发 500 金币，记一次
func claim_free_coins() -> bool:
	if _free_coin_used >= free_coin_cap():
		return false
	_free_coin_used += 1
	_coins += free_coin_amount()
	return true


## 开缸位：金币方式。看广告的方式由界面先 await Ads.rewarded 再直接开
func buy_slot() -> bool:
	return spend(price("slot"))


# ---------- 抽奖 ----------


func spins_left() -> int:
	return _spins


func spin_share_left() -> int:
	return int(cfg["spin"]["share_daily"]) - _spin_share_used


func spin_ad_left() -> int:
	return int(cfg["spin"]["ad_daily"]) - _spin_ad_used


func share_spin() -> bool:
	if spin_share_left() <= 0:
		return false
	_spin_share_used += 1
	_spins += 1
	return true


## 看完广告后调用
func ad_spin() -> bool:
	if spin_ad_left() <= 0:
		return false
	_spin_ad_used += 1
	_spins += 1
	return true


func buy_spin() -> bool:
	if not spend(price("spin")):
		return false
	_spins += 1
	return true


func buy_ten() -> bool:
	if not spend(price("ten")):
		return false
	_spins += 10
	return true


func wheel() -> Array:
	return cfg["wheel"]


func odds() -> Array:
	return cfg["odds"]


## 消耗一次抽奖，返回 { index: 转盘上的扇区, prize: 奖品 }；没有次数返回空字典。
## 假数据：金币类奖品当场到账，其余只返回结果。
func spin_wheel() -> Dictionary:
	if _spins <= 0:
		return {}
	_spins -= 1
	var rng := RandomNumberGenerator.new()
	rng.randomize()
	var segs: Array = wheel()
	var idx: int = rng.randi_range(0, segs.size() - 1)
	var prize: Dictionary = (segs[idx] as Dictionary).duplicate()
	match str(prize["kind"]):
		"coin":
			_coins += int(prize["amount"])
		"skill":
			var id: String = SKILL_IDS[rng.randi_range(0, 2)]
			prize["skill"] = id
			_skills[id] = skill_count(id) + 1
		"inf_life":
			_inf_secs += int(prize["amount"]) * 60
	return {"index": idx, "prize": prize}


# ---------- 签到 ----------


func signin_days() -> Array:
	return cfg["signin"]


## 已累计签到的天数（决定今天是第几天）
func signin_count() -> int:
	return _signin_count


func can_sign_in() -> bool:
	return not _signed_today


## 今天该领的是第几天（0 起）
func signin_today() -> int:
	return _signin_count % signin_days().size()


## 领签到奖励；double 为看广告翻倍。返回奖励字典，已领过返回空
func sign_in(day: int, double: bool) -> Dictionary:
	if _signed_today or day != signin_today():
		return {}
	var reward: Dictionary = (signin_days()[day] as Dictionary).duplicate()
	var mult: int = 2 if double else 1
	reward["mult"] = mult
	match str(reward["kind"]):
		"coin":
			_coins += int(reward["amount"]) * mult
		"spin":
			_spins += int(reward["amount"]) * mult
		"big_chest":
			_coins += 1000 * mult
			_inf_secs += 30 * 60
	_signed_today = true
	_signin_count += 1
	return reward


# ---------- 选关 ----------


func is_challenge(n: int) -> bool:
	return n % 5 == 0


## "passed" / "current" / "locked"
func level_state(n: int) -> String:
	if n < _level:
		return "passed"
	return "current" if n == _level else "locked"


func total_levels() -> int:
	return int(cfg["fake"]["total_levels"])


## 仅假数据：截图和试玩时切换当前关，看功能开放前后的样子
func set_level(n: int) -> void:
	_level = n


## 重玩前检查：生命够不够
func can_start() -> bool:
	return _lives > 0 or _inf_secs > 0
