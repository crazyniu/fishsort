# 局外系统 API（meta v2）

纯逻辑，位于 `client/assets/scripts/core/meta/`（Cocos 版函数名改成 camelCase，如 `take_free_coin` → `takeFreeCoin`；本文沿用 Godot 版写法，对应关系一目了然）。全部是对存档对象 `save` 的函数：时间用 `now`（unix 秒，界面层传 `services/clock.ts` 的 `now()`），日期用 `day`（`today()`），随机数用 `Rng`。数值在 `client/assets/resources/config/economy.json`，**以 `docs/01` 和配置为准，本文出现的数字只是示例**。存档版本 `PlayerData.VERSION = 1`（Cocos 版重新从 1 开始）。
`species` 是 `Config.species`；`eco` 是 `Config.eco`。

## 存档新增字段

| 字段 | 内容 |
|---|---|
| `lives` | `{count, stamp, lastNow, unlimitedUntil}` |
| `chest` | `{dry, lastLevel, adTaken}` |
| `wheel` | `{extra, dry, total}`：存下来的次数、连续没出史诗以上的次数、总抽数 |
| `avatar` | 可选：头像换成的收藏生物 id（`PlayerData.setAvatar` 只接受已拥有的卡，空串恢复平台头像；`avatarOf` 读取），docs/01 5.9 |
| `skillsGranted` | `{技能id: true}` 已发过解锁礼 |
| `tools` | 新增 `current`（洋流） |
| `signin` | 新增 `doubledDay` |
| `daily` | `{day, firstWin, freeCoin, wheelFree, wheelAd, replay, toolFree{}, share{wheel,life,card,help}}` |
| `bestCombo` | 历史最高连击 |
| `album` | `{claimed[], final, frame}`：领过的册子序号、终极大奖是否已领、专属头像框是否解锁 |
| `dex` | `{seen{生物id: 累计只数}, claimed{生物id: 已领到第几档}}` |
| `challenge` | `{wonDay, streak, tryDay, tries}`：每日挑战过关日、连续天数、今天进过几次 |

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

## Album（收藏分册）

90 张卡分 6 册，每册按关开放，集齐领册子大奖，全部集齐领终极大奖。数值在 `eco["album"]`（`books[{id, unlock, cards[], reward}]`、`final`）。

| 函数 | 说明 |
|---|---|
| `Album.books(eco)` | 册子列表 |
| `Album.is_open(eco, book, level)` | 这一册开放了吗（`book` 是 0 起的序号） |
| `Album.pool(eco, species, level)` | 现在能掉落的卡（只含已开放册子；一册都没开时按第一册算） |
| `Album.have(save, eco, book)` / `is_complete` / `is_claimed(save, book)` | 这一册收了几张 / 集齐了吗 / 领过了吗 |
| `Album.can_claim(save, eco, book)` / `can_claim_final(save, eco)` | 已开放、集齐、没领过 → true；终极大奖要 6 册都集齐且没领过 |
| `Album.claimable(save, eco)` | 有几个奖可领（主页入口红点） |
| `Album.claim(save, eco, book, now)` | 领一册大奖，返回奖品列表；不能领返回 `[]` |
| `Album.claim_final(save, eco, now)` | 领终极大奖：奖励 + 解锁头像框，奖品列表末尾多一项 `{kind: "frame", amount: 1}` |
| `Album.has_frame(save)` | 专属头像框是否解锁（界面用来给头像外加金框） |
| `Album.grant(save, reward, now)` | 发一份奖励 `{coins, tools, unlimited}` 并返回奖品列表 `[{kind: coin\|skill\|inf_life, ...}]`；每日挑战也用它 |

## Dex（救援记录）

局内救过的生物累计只数，每种救够几档各领一次金币。数值在 `eco["dex"]`（`tiers` 30/100/300，`coins` 200/500/1500）。

| 函数 | 说明 |
|---|---|
| `Dex.fresh()` | 存档默认值 |
| `Dex.record(save, counts)` | 过关时记账，`counts` 是 `{生物id: 这一关救了几只}` |
| `Dex.count(save, id)` / `claimed_tier(save, id)` / `reached_tier(save, eco, id)` | 累计只数 / 已领到第几档 / 数量够到第几档 |
| `Dex.can_claim(save, eco, id)` | 够到的档数比已领的多 → true |
| `Dex.next_need(save, eco, id)` | 下一档要救多少只，领完返回 0 |
| `Dex.claim(save, eco, id)` | 领下一档，金币入账并返回金币数；不能领返回 0 |
| `Dex.claimable(save, eco)` | 有几种生物有奖可领（主页入口红点） |

## DailyChallenge（每日挑战）

每天一关，用已校验的挑战关，不现场生成。数值在 `eco["dailyChallenge"]`（`levelStep` 每几关一个挑战关、`retryCoins` 300、`reward`、`streakDays` 7、`streakReward`）。

| 函数 | 说明 |
|---|---|
| `DailyChallenge.level_for(day, player_level, cycle, level_count)` | 当天打哪一关（玩家打到过的挑战关里较难的后一半按日期轮换） |
| `DailyChallenge.won_today(save, day)` | 今天过关了吗 |
| `DailyChallenge.streak(save, day)` | 连续过关天数；昨天和今天都没过就是 0 |
| `DailyChallenge.tries(save, day)` / `is_free(save, day)` | 今天进过几次 / 还没进过（免费） |
| `DailyChallenge.enter(save, eco, day, pay)` | 进场。`pay` = `"free"`（今天第一次）/ `"ad"`（界面已看完 `rv_daily_retry`）/ `"coins"`（扣 300）。今天已过关、免费次已用、金币不够返回 false |
| `DailyChallenge.win(save, eco, species, day, now, rng)` | 过关开每日宝箱（金币 + 每种技能 + 一张卡，优先给没有的），连续满 7 天再开七日大宝箱并清零连续天数。返回 `{prizes, big}`；今天已领过 `prizes` 为空。卡的奖品是 `{kind: "card", card_id, rarity, is_new, dupe_coins}` |

挑战不扣生命、不算进度、不记连败，这些是局内逻辑，不在本模块。

## Skills / Features

- `Skills.sync_unlocks(save, eco)` → 新发礼的技能 id（到关发 2 个，只发一次；`Settle.win` 已调用）。
- `Skills.try_use(save, eco, id, used_this_level, day)` → `{ok, free, reason}`，reason: `locked` / `limit`（每关 2 次）/ `empty` / `""`。ok 时已扣库存或记了今天的免费次，随后调 `Rules.apply(s, {"a": id...})`。
- `Skills.buy(save, eco, id)`、`Skills.count`、`Skills.add`、`Skills.price`、`Skills.free_available(save, id)`、`Skills.unlocked_ids(eco, level)`。
- 技能 id：`shuffle` 洗牌（4）、`blow` 吹泡（7）、`net` 渔网（9）、`current` 洋流（12）。
- `Features.is_unlocked(eco, feature, level)`：level 取 `save["level"]`，等于或超过开放关即开放。feature：`signin levelSelect album wheel tasks skill_shuffle skill_blow skill_net skill_current`。`Features.unlock_level`、`Features.newly_unlocked(eco, old, new)`。
- **洋流（规则层）**：`Rules.use_current(s)` / `Rules.apply(s, {"a": "current"})`。返回普通事件序列（`fish_to_bowl`、`bowl_done`、`bowl_in`、`bubble_pop`、`bubble_drop`、`win`…），逐条点击，满缸换新缸后继续；永不把鱼送进暂存槽。连击由界面层按事件计数。

## Tasks（任务中心）

规则见 `docs/01` 第 5.9 节，配置在 `economy.json` 的 `tasks`。存档：`save.tasks = {day, ids, prog, claimed}`（今天的任务、进度、已领的每日宝箱档），`save.week.points` / `save.week.taskClaimed`（本周积分、已领的本周宝箱档）。

| 函数 | 说明 |
|---|---|
| `Tasks.list(save, eco, day)` | 今天的任务（跨天自动换一批）。`Tasks.pick(eco, day, level)` 是不看存档的抽法 |
| `Tasks.add(save, eco, day, id, n)` | 记进度，返回今天积分涨了多少。今天没有这项就不记。`combo` 传单局最高连击（取最大值），其余累加 |
| `Tasks.progress` / `is_done` / `day_points` / `week_points` / `week_max` | 进度、是否做完、今日积分（封顶 100）、本周积分、本周满格 |
| `Tasks.tiers(eco, scope)` / `can_claim` / `is_claimed` / `claimable(save, eco, day)` | `scope` = `"day"` / `"week"`；`claimable` 是主页入口红点 |
| `Tasks.claim(save, eco, species, scope, tier, day, now, rng)` | 领一档宝箱，返回奖品列表；不能领返回空数组 |

进度在哪里记：`win`（`Settle.win`、`DailyChallenge.win`）、`daily`（`DailyChallenge.win`）、`skill`（`Skills.try_use`）、`wheel`（`Wheel.spin` / `ten_pull`）在规则里；`rescue`、`combo`（一局结束时）、`ad`（看完激励视频）、`build`、`share` 由界面层调 `Tasks.add`。

## Share（分享）

`Share.remaining(save, eco, kind, day)`、`Share.claim(save, eco, kind, day, now, rng)`。kind：`wheel`（抽奖 +1，1/天）、`life`（命 +1，3/天）、`card`（200 金币，3/天）、`help`（随机技能 1 个，3/天）。次数用完返回 `{}`，否则 `{kind, coins, life, wheel, skill}`。

## 其它

- `Cards.give(save, eco, card)` 入账一张卡（重复换金币 50/125/300/750/2500）。
- `Daily.roll(save, day)` 跨天、跨周清零。
- `Combo.best_bonus_for(best, cfg)`；连击金币档与封顶见 `docs/01` 3.2 和 `economy.json` 的 `combo`。
- 免费金币：`Meta.take_free_coin`（金额与次数见 `economy.json` 的 `freeCoin`）；缸位金币价见 `eco.bowlSlotCoinPrice`。
- `now()`（`client/assets/scripts/services/clock.ts`）：当前 unix 秒。

## 存档版本

开发阶段不迁移旧存档（用户 2026-11-15 定）：读档时版本不对或损坏就开新档，版本对就只把缺的字段补成默认值。正式上线后结构再变时才写迁移函数。

## 局内写入的存档字段

- `bestCombo`：历史最高连击，每关结束（过关、失败、退出）时更新，个人资料弹窗读它。
