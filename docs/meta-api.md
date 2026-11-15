# 局外系统 API（meta v2）

纯逻辑，位于 `src/core/meta/`。全部是对存档字典 `save` 的静态函数：时间用 `now`（unix 秒，界面层传 `Save.now()`），日期用 `day`（`Save.today()`），随机数用 `Rng`。数值在 `config/economy.json`。存档版本 `PlayerData.VERSION = 2`。
`species` 是 `Config.species`；`eco` 是 `Config.eco`。

## 存档新增字段

| 字段 | 内容 |
|---|---|
| `lives` | `{count, stamp, lastNow, unlimitedUntil}` |
| `chest` | `{dry, lastLevel, adTaken}` |
| `wheel` | `{extra, dry, total}`：存下来的次数、连续没出史诗以上的次数、总抽数 |
| `skillsGranted` | `{技能id: true}` 已发过解锁礼 |
| `tools` | 新增 `current`（洋流） |
| `signin` | 新增 `doubledDay` |
| `daily` | `{day, firstWin, freeCoin, wheelFree, wheelAd, replay, toolFree{}, share{wheel,life,card,help}}` |
| `bestCombo` | 历史最高连击 |

读写任何每日计数前先 `Daily.roll(save, day)`（下面的函数都已自己调用）。

## Lives（生命）

| 函数 | 返回 / 说明 |
|---|---|
| `Lives.count(save, eco, now)` | 当前命数（先按时间恢复）。时间倒退这段不恢复 |
| `Lives.seconds_to_next(save, eco, now)` | 距下一条秒数，满命为 0 |
| `Lives.is_unlimited(save, now)` / `unlimited_left(save, now)` | 无限生命窗口 |
| `Lives.can_start(save, eco, level_id, now)` | 第 1–5 关、无限期间或有命 → true |
| `Lives.lose(save, eco, level_id, moved, now)` | 失败（放弃复活）/ 回主页 / 重试时调，过关不调。`moved`=本关是否走过步。返回是否真扣了 |
| `Lives.buy_one(save, eco, now)` / `buy_refill(save, eco, now)` | 200 / 800 金币；已满或金币不够返回 false |
| `Lives.add(save, eco, n, now)` | 加命（不超上限），返回实际增加数 |
| `Lives.grant_unlimited(save, seconds, now)` | 无限生命，已有窗口则顺延 |

## Settle（结算）与 LevelChest（宝箱）

- `Settle.win(save, eco, {level, challenge, day, now, combo_coins, best_combo})` → `{rewarded, replay, first_win, coins_base, coins_combo, coins_best, coins, level_up, new_skills[], new_features[], wheel_spin, unlimited, chest_ok}`。已入账金币、推进进度、首胜（抽奖 +1、无限生命 10 分钟）、重玩每天前 5 次有奖、补发技能解锁礼。`combo_coins` 取 `Combo.coins`，`best_combo` 取 `Combo.best`。
- `Settle.double_coins(save, eco, result)` → 额外发的金币数（看完翻倍广告后）。
- `LevelChest.open(save, eco, species, level_id, challenge, rng)` → `{kind: coins|skill|card, coins, skill, card{id,rarity,is_new,coins}, pity}`；已入账。`chest_ok` 为 true 才调。
- `LevelChest.open_ad(...同上)` → 同结构；本关没开过箱或已开过广告箱返回 `{}`。

## Wheel（抽奖）

| 函数 | 说明 |
|---|---|
| `Wheel.odds(eco)` | 公示概率 `[{id, kind, rarity, amount, percent}]`，页面直接用它画 |
| `Wheel.spins_left(save, eco, day)` / `free_left` / `ad_left` | 剩余次数 |
| `Wheel.spin(save, eco, species, rng, day, now, pay)` | `pay` = `"spin"`（先免费后存的次数）或 `"coins"`（1000）。返回 `{prize, kind, card, coins, skill, unlimited, pity}`；没次数 / 金币不够返回 `{}` |
| `Wheel.ten_pull(save, eco, species, rng, day, now)` | 9000 金币，返回 `{results:[单抽结果×10]}`，至少 1 张稀有以上 |
| `Wheel.claim_ad(save, eco, day)` | 看完广告 +1 次，每天 3 次，用完 false |
| `Wheel.add_spins(save, n)` | 直接加次数 |

分享 +1 次走 `Share.claim(..., "wheel", ...)`。连续 30 次没出史诗以上，下一次必出（结果里 `pity=true`）。

## SignIn（七日签到）

- `SignIn.can_claim(save, day)`、`SignIn.next_index(save, eco)`（0–6）。
- `SignIn.claim(save, eco, species, rng, day, now, doubled=false)` → `{index, coins, wheel, skills[], cards[], unlimited, doubled}`；今天已签返回 `{}`。`doubled=true`（先看广告）奖励翻倍，宝箱多开一个。
- `SignIn.double_today(save, eco, species, rng, day, now, last_result)`：先领后看广告的流程，把当天奖励再发一份，每天一次，返回合并后的结果。

## Skills / Features

- `Skills.sync_unlocks(save, eco)` → 新发礼的技能 id（到关发 2 个，只发一次；`Settle.win` 和迁移已调用）。
- `Skills.try_use(save, eco, id, used_this_level, day)` → `{ok, free, reason}`，reason: `locked` / `limit`（每关 2 次）/ `empty` / `""`。ok 时已扣库存或记了今天的免费次，随后调 `Rules.apply(s, {"a": id...})`。
- `Skills.buy(save, eco, id)`、`Skills.count`、`Skills.add`、`Skills.price`、`Skills.free_available(save, id)`、`Skills.unlocked_ids(eco, level)`。
- 技能 id：`shuffle` 洗牌（4）、`blow` 吹泡（7）、`net` 渔网（9）、`current` 洋流（12）。
- `Features.is_unlocked(eco, feature, level)`：level 取 `save["level"]`，等于或超过开放关即开放。feature：`signin levelSelect album wheel rank skill_shuffle skill_blow skill_net skill_current`。`Features.unlock_level`、`Features.newly_unlocked(eco, old, new)`。
- **洋流（规则层）**：`Rules.use_current(s)` / `Rules.apply(s, {"a": "current"})`。返回普通事件序列（`fish_to_bowl`、`bowl_done`、`bowl_in`、`bubble_pop`、`bubble_drop`、`win`…），逐条点击，满缸换新缸后继续；永不把鱼送进暂存槽。连击由界面层按事件计数。

## Share（分享）

`Share.remaining(save, eco, kind, day)`、`Share.claim(save, eco, kind, day, now, rng)`。kind：`wheel`（抽奖 +1，1/天）、`life`（命 +1，3/天）、`card`（200 金币，3/天）、`help`（随机技能 1 个，3/天）。次数用完返回 `{}`，否则 `{kind, coins, life, wheel, skill}`。

## 其它

- `Cards.give(save, eco, card)` 入账一张卡（重复换金币 50/125/300/750/2500）。
- `Daily.roll(save, day)` 跨天、跨周清零。
- `Combo.best_bonus_for(best, cfg)`（静态）；连击金币档 5/10/15/25，封顶 400，最高连击奖 ×10 封顶 200。
- 免费金币：`Meta.take_free_coin`（500，每天 10 次）；缸位 650 金币见 `eco["bowlSlotCoinPrice"]`。
- `Save.now()`（`src/services/save_service.gd`）：当前 unix 秒。

## 迁移 v1 → v2

金币 ×`migration.coinsMultiplier`(5)，旧版的鱼票按 `migration.ticketToCoins`(50) 折成金币，旧字段 `tickets` / `stars` / `pity` / `scene` / `sceneStep` 读档时删除，补 `lives` / `wheel` / `chest` 等字段，已到关的技能补发解锁礼，每日计数换新结构。

## 局内写入的存档字段

- `bestCombo`：历史最高连击，每关结束（过关、失败、退出）时更新，个人资料弹窗读它。
