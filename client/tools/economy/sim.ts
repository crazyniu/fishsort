// 金币的账：用游戏里真实的发奖代码，按「一个活跃玩家每天过几关」跑若干天，看一天挣多少金币、
// 不花钱拿到多少技能、想用的技能和缸位有多少要花金币、金币不够时要看几次广告（docs/01 第 6.3 节）。
// 用法：./run.sh eco-sim [--from=130] [--days=30] [--levels=10] [--casual] [--eco=<另一份 economy.json>]
//   --from    从第几关打起（1 = 从头）
//   --casual  只打关卡和签到，不做每日挑战、任务中心、抽奖
//   --frugal  难关先不花金币白打一次，输了再花
//   --runs    跑几遍取平均（默认 20）
//   --no-ads  没有广告（微信小游戏开通流量主之前）：金币不够时不能看广告拿技能、开缸、拿命；
//             --free=技能,开缸 是没广告时每天能免费领几次（默认 0,0）。连输按 easeAfterFails 换更易的变体；
//             一天最多打 --levels 的 3 倍局数，卡住的那天就少过几关
// 关卡难不难不在这里量：按 docs/02 第 0.4 节的目标假设——不花金币 / 花 1 样 / 2 样……各自的过关概率（level_curve.json 的 jam.targets）。
// 玩家的打法：卡住了就花一样，一局最多花 maxItems 样；四样里约一样是开缸，其余是技能。
// 技能先用今天的免费次、再用库存；都没有就花金币买，金币不够就看广告拿一个。缸位、命同理。
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CurveConfig, EconomyConfig, Species } from '../../assets/scripts/core/config';
import * as LevelCurve from '../../assets/scripts/core/gen/levelCurve';
import * as Album from '../../assets/scripts/core/meta/album';
import * as DailyChallenge from '../../assets/scripts/core/meta/dailyChallenge';
import * as Dex from '../../assets/scripts/core/meta/dex';
import * as LevelChest from '../../assets/scripts/core/meta/levelChest';
import * as Lives from '../../assets/scripts/core/meta/lives';
import * as PlayerData from '../../assets/scripts/core/meta/playerData';
import type { SaveData } from '../../assets/scripts/core/meta/save';
import * as Settle from '../../assets/scripts/core/meta/settle';
import * as SignIn from '../../assets/scripts/core/meta/signIn';
import * as Skills from '../../assets/scripts/core/meta/skills';
import * as Tasks from '../../assets/scripts/core/meta/tasks';
import * as Wheel from '../../assets/scripts/core/meta/wheel';
import { Rng } from '../../assets/scripts/core/rng/rng';

const CLIENT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const CONFIG = join(CLIENT, 'assets/resources/config');
/**
 * 过关概率按 level_curve.json 的 jam.targets（docs/02 第 0.4 节，普通玩家机器人量的）：[不花金币, 花 ≤1 样, ≤2 样, …]，
 * maxItems = 一局最多花几样（表有几档就到几样）。排队泡关卡之前的关（新手期）按 EARLY。
 */
const curve = JSON.parse(readFileSync(join(CONFIG, 'level_curve.json'), 'utf8')) as CurveConfig;
const EARLY = { p: [0.9, 0.98], maxItems: 1 };
/** 花的几样里开缸占多少 */
const BOWL_SHARE = 0.25;
/** 打一局算几秒（命的恢复按它走） */
const ATTEMPT_SECONDS = 240;

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

/** 连输以后换上的更易变体的目标（变体 1 在这一档和普通关中间，变体 2 按普通关） */
function targetForEase(level: number, ease: number): { p: number[]; maxItems: number } {
  if (ease <= 0) return targetFor(level);
  const p = LevelCurve.jamTargets(curve, level, ease) ?? LevelCurve.jamTargets(curve, level, 0);
  if (p === null) return EARLY;
  return { p, maxItems: p.length - 1 };
}

function targetFor(level: number): { p: number[]; maxItems: number } {
  const p = LevelCurve.jamTargets(curve, level, 0);
  if (p === null) return EARLY;
  return { p, maxItems: p.length - 1 };
}

class Book {
  coinsIn: Record<string, number> = {};
  coinsOut: Record<string, number> = {};
  toolsIn: Record<string, number> = {};
  ads: Record<string, number> = {};
  itemsUsed = { tool: 0, bowl: 0 };
  toolsPaid = { free: 0, stock: 0, coins: 0, ad: 0 };
  bowlsPaid = { coins: 0, ad: 0 };
  fails = 0;
  passes = 0;
  bump(m: Record<string, number>, k: string, n: number): void {
    if (n !== 0) m[k] = (m[k] ?? 0) + n;
  }
}

function main(): void {
  const eco = JSON.parse(readFileSync(arg('eco', join(CONFIG, 'economy.json')), 'utf8')) as EconomyConfig;
  const species = (JSON.parse(readFileSync(join(CONFIG, 'species.json'), 'utf8')) as { species: Species[] }).species;
  const inLevel = species.filter((s) => s.inLevel === true);
  const from = Number(arg('from', '130'));
  const days = Number(arg('days', '30'));
  const perDay = Number(arg('levels', '10'));
  const casual = process.argv.includes('--casual');
  const frugal = process.argv.includes('--frugal');
  const total = curve.total;
  const runs = Number(arg('runs', '20'));
  const noAds = process.argv.includes('--no-ads');
  const [freeToolDay, freeBowlDay] = arg('free', '0,0').split(',').map(Number);
  let attemptsAll = 0;
  let passesAll = 0;
  let worstLevel = 0;
  const stuckDays: number[] = [];
  const book = new Book();
  let played = 0;
  let coinsLeft = 0;
  let toolsLeft = 0;
  let lastLevel = from;
  for (let run = 0; run < runs; run++) {
  const rng = new Rng(20261118 + run * 7919);
  const save: SaveData = PlayerData.create(eco);
  save.level = from;
  Skills.syncUnlocks(save, eco);
  // 从中途开始的：解锁礼早用完了，库存清零
  if (from > 25) for (const id of Skills.ids(eco)) save.tools[id] = 0;
  const tools = () => Skills.ids(eco).reduce((n, id) => n + Skills.count(save, id), 0);
  /** 跑一段发奖逻辑，把金币和技能的变化记到 source 名下 */
  const earn = (source: string, fn: () => void): void => {
    const c = save.coins;
    const t = tools();
    fn();
    book.bump(book.coinsIn, source, save.coins - c);
    book.bump(book.toolsIn, source, tools() - t);
  };
  const spend = (sink: string, price: number): boolean => {
    if (save.coins < price) return false;
    save.coins -= price;
    book.bump(book.coinsOut, sink, price);
    return true;
  };
  let now = 1_000_000;
  let day = 20000;
  let level = from;
  const tried = new Set<number>();
  const failsAt = new Map<number, number>();
  let freeTool = 0;
  let freeBowl = 0;

  const useTool = (usedThisLevel: Record<string, number>): boolean => {
    const open = Skills.unlockedIds(eco, save.level).filter((id) => (usedThisLevel[id] ?? 0) < Skills.maxPerLevel(eco, level));
    if (open.length === 0) return false;
    // 先用手里有的（今天的免费次、库存），没有就买：买哪种看当时卡在哪，这里随机取一种
    const have = open.filter((id) => Skills.freeAvailable(save, id, eco) || Skills.count(save, id) > 0);
    const id = rng.pick(have.length > 0 ? have : open);
    if (have.length === 0) {
      if (spend('买技能', Skills.price(eco, id))) {
        Skills.add(save, id);
        book.toolsPaid.coins++;
      } else if (!noAds) {
        Skills.add(save, id);
        book.bump(book.ads, '看广告拿技能', 1);
        book.toolsPaid.ad++;
      } else if (freeTool > 0) {
        freeTool--;
        Skills.add(save, id);
        book.bump(book.ads, '没广告时免费领技能', 1);
        book.toolsPaid.ad++;
      } else return false;
      Skills.tryUse(save, eco, id, usedThisLevel[id] ?? 0, day, level);
    } else {
      const r = Skills.tryUse(save, eco, id, usedThisLevel[id] ?? 0, day, level);
      if (r.free) book.toolsPaid.free++;
      else book.toolsPaid.stock++;
    }
    usedThisLevel[id] = (usedThisLevel[id] ?? 0) + 1;
    book.itemsUsed.tool++;
    return true;
  };
  const useBowl = (): boolean => {
    if (spend('开缸', eco.bowlSlotCoinPrice)) book.bowlsPaid.coins++;
    else if (!noAds) {
      book.bump(book.ads, '看广告开缸', 1);
      book.bowlsPaid.ad++;
    } else if (freeBowl > 0) {
      freeBowl--;
      book.bump(book.ads, '没广告时免费开缸', 1);
      book.bowlsPaid.ad++;
    } else return false;
    book.itemsUsed.bowl++;
    return true;
  };

  for (let d = 0; d < days && level <= total; d++, day++) {
    played++;
    now += 86400;
    freeTool = freeToolDay;
    freeBowl = freeBowlDay;
    let attempts = 0;
    let passedToday = 0;
    earn('签到', () => SignIn.claim(save, eco, species, rng, day, now));
    if (!casual) {
      earn('每日挑战', () => {
        if (DailyChallenge.enter(save, eco, day, 'free') && rng.randf() < 0.8) DailyChallenge.win(save, eco, species, day, now, rng, 6);
      });
    }
    for (let n = 0; n < perDay && level <= total && attempts < perDay * 3; ) {
      // 没命了：先花金币买，买不起看广告，广告也看完了就等
      if (!Lives.canStart(save, eco, level, now)) {
        if (spend('买命', eco.lives.buyOneCoins)) Lives.add(save, eco, 1, now);
        else if (!noAds && Lives.claimAd(save, eco, day, now)) book.bump(book.ads, '看广告拿命', 1);
        else now += Lives.secondsToNext(save, eco, now) + 1;
        continue;
      }
      now += ATTEMPT_SECONDS;
      attempts++;
      attemptsAll++;
      // 连输换更易的变体（economy.json 的 easeAfterFails，docs/01 第 5.7 节）
      const fails = failsAt.get(level) ?? 0;
      const ease = eco.easeAfterFails.filter((k) => fails >= k).length;
      const t = noAds ? targetForEase(level, ease) : targetFor(level);
      const u = rng.randf();
      // 省着打的人：难关第一次不花，输了再来才花
      const cap = frugal && level % 5 === 0 && !tried.has(level) ? 0 : t.maxItems;
      tried.add(level);
      let need = 0;
      while (need < cap && u >= t.p[need]) need++;
      const passed = u < t.p[need];
      const used: Record<string, number> = {};
      let bowls = 0;
      let got = 0;
      for (let i = 0; i < need; i++) {
        let ok: boolean;
        if (bowls < 2 && rng.randf() < BOWL_SHARE) {
          bowls++;
          ok = useBowl() || useTool(used);
        } else ok = useTool(used) || (bowls < 2 && useBowl() && ++bowls > 0);
        if (!ok) break;
        got++;
      }
      // 想花的没拿到（没金币、没广告、免费次用完）：少花几样，过关概率按实际花的算
      if (got < need && !(u < t.p[got])) {
        book.fails++;
        failsAt.set(level, fails + 1);
        worstLevel = Math.max(worstLevel, fails + 1);
        Lives.lose(save, eco, level, true, now);
        continue;
      }
      if (!passed) {
        book.fails++;
        failsAt.set(level, fails + 1);
        worstLevel = Math.max(worstLevel, fails + 1);
        Lives.lose(save, eco, level, true, now);
        continue;
      }
      book.passes++;
      const challenge = level % 5 === 0;
      let chest = false;
      earn('过关', () => {
        const r = Settle.win(save, eco, { level, challenge, day, now, combo_coins: Math.min(eco.combo.maxCoinsPerLevel, 6 + rng.rangeI(0, 8)), best_combo: 5 + rng.rangeI(0, 8) });
        chest = r.chest_ok;
      });
      if (chest) earn('过关宝箱', () => LevelChest.open(save, eco, species, level, challenge, rng));
      earn('救援记录', () => {
        // 这一关救了 8 种左右、每种十来条（本海域的局内生物）
        const sea = Math.floor((level - 1) / 20);
        const seaN = eco.seas?.length ?? 1;
        const pool = inLevel.filter((_, i) => Math.floor((i * seaN) / inLevel.length) === sea % seaN);
        const counts: Record<string, number> = {};
        for (let i = 0; i < 8 && pool.length > 0; i++) counts[rng.pick(pool).id] = 12;
        Dex.record(save, counts);
        for (const id of Object.keys(counts)) while (Dex.canClaim(save, eco, id)) Dex.claim(save, eco, id);
      });
      earn('收藏册', () => {
        Album.books(eco).forEach((_, i) => {
          if (Album.canClaim(save, eco, i)) Album.claim(save, eco, i, now, rng);
        });
      });
      level++;
      n++;
      passedToday++;
      passesAll++;
    }
    stuckDays.push(passedToday);
    if (!casual) {
      earn('抽奖', () => {
        let guard = 0;
        while (Wheel.spinsLeft(save, eco, day) > 0 && guard++ < 20) Wheel.spin(save, eco, species, rng, day, now, 'spin');
      });
      earn('任务中心', () => {
        for (const task of Tasks.list(save, eco, day)) Tasks.add(save, eco, day, task.id, task.goal);
        for (const scope of ['day', 'week'] as const) {
          Tasks.tiers(eco, scope).forEach((_, i) => {
            if (Tasks.canClaim(save, eco, scope, i, day)) Tasks.claim(save, eco, species, scope, i, day, now, rng);
          });
        }
      });
    }
  }

  coinsLeft += save.coins;
  toolsLeft += tools();
  lastLevel = level - 1;
  }

  const perDayOf = (n: number) => (n / played).toFixed(1);
  const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
  const lines = (m: Record<string, number>) =>
    Object.entries(m)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `    ${k.padEnd(8, '　')} ${perDayOf(v).padStart(7)}`)
      .join('\n');
  const paidTools = book.toolsPaid.coins + book.toolsPaid.ad;
  const wantCoins = sum(book.coinsOut) + book.toolsPaid.ad * avgPrice(eco) + book.bowlsPaid.ad * eco.bowlSlotCoinPrice;
  console.log(`从第 ${from} 关打到第 ${lastLevel} 关，每天过 ${perDay} 关${casual ? '（只打关卡和签到）' : ''}${frugal ? '（难关先白打一次）' : ''}，${runs} 遍取平均；每天失败 ${perDayOf(book.fails)} 次`);
  console.log(`\n一天挣的金币 ${perDayOf(sum(book.coinsIn))}：\n${lines(book.coinsIn)}`);
  console.log(`\n一天不花钱拿到的技能 ${perDayOf(sum(book.toolsIn))} 个（另有每天免费次用掉 ${perDayOf(book.toolsPaid.free)} 次）：\n${lines(book.toolsIn)}`);
  console.log(`\n一天要用的：技能 ${perDayOf(book.itemsUsed.tool)} 个，开缸 ${perDayOf(book.itemsUsed.bowl)} 次`);
  console.log(`  技能怎么来的：免费次 ${perDayOf(book.toolsPaid.free)}，库存 ${perDayOf(book.toolsPaid.stock)}，金币买 ${perDayOf(book.toolsPaid.coins)}，看广告 ${perDayOf(book.toolsPaid.ad)}`);
  console.log(`  缸位怎么来的：金币 ${perDayOf(book.bowlsPaid.coins)}，看广告 ${perDayOf(book.bowlsPaid.ad)}`);
  console.log(`\n一天花掉的金币 ${perDayOf(sum(book.coinsOut))}：\n${lines(book.coinsOut)}`);
  console.log(`\n一天看的广告 ${perDayOf(sum(book.ads))} 次：\n${lines(book.ads)}`);
  console.log(`\n想花的金币（花掉的 + 看广告顶掉的按价格折算）一天 ${perDayOf(wantCoins)}；挣的占想花的 ${Math.round((sum(book.coinsIn) * 100) / Math.max(1, wantCoins))}%`);
  if (noAds) {
    const avg = stuckDays.reduce((a, b) => a + b, 0) / Math.max(1, stuckDays.length);
    const low = stuckDays.filter((x) => x < perDay / 2).length;
    console.log(`\n没广告（每天免费领技能 ${freeToolDay} 次、开缸 ${freeBowlDay} 次）：一天平均过 ${avg.toFixed(1)} 关（想过 ${perDay} 关，一天最多打 ${perDay * 3} 局）；过不到一半的天占 ${Math.round((low * 100) / Math.max(1, stuckDays.length))}%；平均 ${(attemptsAll / Math.max(1, passesAll)).toFixed(2)} 局过一关；同一关最多输了 ${worstLevel} 次`);
  }
  console.log(`要花钱的技能占要用的 ${Math.round((paidTools * 100) / Math.max(1, book.itemsUsed.tool))}%；最后手里剩 ${Math.round(coinsLeft / runs)} 金币、${(toolsLeft / runs).toFixed(1)} 个技能`);
}

function avgPrice(eco: EconomyConfig): number {
  const p = Object.values(eco.toolPrice);
  return p.reduce((a, b) => a + b, 0) / p.length;
}

main();
