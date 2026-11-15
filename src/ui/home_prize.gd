class_name HomePrize
extends RefCounted
## 奖品的图标、名称、数量文字。抽奖转盘、概率表、签到格、开奖弹窗共用。

const RARITY_COLORS: Dictionary = {
	"common": Color("6FD3FF"),
	"uncommon": Color("7BE05A"),
	"rare": Color("4D9BFF"),
	"epic": Color("C06BFF"),
	"legend": Color("FFC93C")
}


## 奖品图标路径。心形和转盘图标来自 assets/kit
static func icon_path(prize: Dictionary) -> String:
	match str(prize["kind"]):
		"coin":
			return "res://assets/ui/coin.png"
		"skill":
			var id: String = str(prize.get("skill", "blow"))
			return "res://assets/ui/tool_%s.png" % ("blow" if id == "flow" else id)
		"inf_life":
			return "res://assets/kit/heart.png"
		"card":
			return "res://assets/ui/tank.png"
		"chest", "big_chest":
			return "res://assets/ui/chest.png"
		"spin":
			return "res://assets/kit/ic_wheel.png"
	return "res://assets/ui/gift.png"


## 图标上的着色（图鉴卡按稀有度染色，其余不染）
static func tint(prize: Dictionary) -> Color:
	if str(prize["kind"]) == "card":
		return (RARITY_COLORS[str(prize["rarity"])] as Color).lerp(Color.WHITE, 0.35)
	return Color.WHITE


## 一行名称：「金币」「技能」「图鉴卡·稀有」…
static func title(prize: Dictionary) -> String:
	match str(prize["kind"]):
		"coin":
			return TranslationServer.translate("H_PRIZE_COIN")
		"skill":
			return TranslationServer.translate("H_PRIZE_SKILL")
		"inf_life":
			return TranslationServer.translate("H_PRIZE_INF")
		"card":
			return (
				TranslationServer.translate("H_PRIZE_CARD")
				% TranslationServer.translate("UI_RARITY_" + str(prize["rarity"]).to_upper())
			)
		"chest":
			return TranslationServer.translate("H_PRIZE_CHEST")
		"big_chest":
			return TranslationServer.translate("H_PRIZE_BIG_CHEST")
		"spin":
			return TranslationServer.translate("H_PRIZE_SPIN")
	return ""


## 转盘扇区里的短字：数量或稀有度
static func short(prize: Dictionary) -> String:
	match str(prize["kind"]):
		"coin":
			return str(int(prize["amount"]))
		"skill":
			return "×%d" % int(prize["amount"])
		"inf_life":
			return TranslationServer.translate("H_MIN") % int(prize["amount"])
		"card":
			return TranslationServer.translate("UI_RARITY_" + str(prize["rarity"]).to_upper())
		"chest", "big_chest", "spin":
			return "×%d" % int(prize["amount"])
	return ""
