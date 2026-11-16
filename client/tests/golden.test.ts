// 与 Godot 版逐项对比：rng、生成器、关卡的校验与机器人胜率、局内随机操作序列、局外 60 天模拟。
// 黄金数据是迁移时由 Godot 版导出的（docs/09 第 8 节），Godot 工程已删，不能再重新导出。
// 用的是导出时 Godot 版的配置（golden/economy 等），不是 client 的新配置：这里只证明「逻辑一样」。
//
// 2026-11-16 关卡设计复查（#61）有意改了一部分规则，对应的黄金数据不再比（docs/04 第 3 节的约定），改由 rules / gen 单测按文档守着：
// - 难度曲线（解锁关、挑战关降幅、障碍节奏）：整项去掉，见 gen.test.ts
// - 生成器：障碍改成照着参考解叠加，带障碍的参数生成结果不同；只比不带障碍的参数
// - 机器人：计时（限时缸会超时）、看不见迷雾；带限时或迷雾的关卡不比胜率
// - 迷雾改成计数显形（多了 fog_tick / fog_clear 事件）；洗牌不拆结伴鱼：这两类对局不比
// - 洋流只给用的那一刻架上的缸（2026-11-16 试玩发现原规则一次就能清完一关）：对局只比到第一次用洋流之前
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { AdsConfig, EconomyConfig, Species } from '../assets/scripts/core/config';
import type { GenParams } from '../assets/scripts/core/gen/levelCurve';
import { generate } from '../assets/scripts/core/gen/levelGen';
import { GameState } from '../assets/scripts/core/model/gameState';
import * as Album from '../assets/scripts/core/meta/album';
import { Combo } from '../assets/scripts/core/meta/combo';
import * as DailyChallenge from '../assets/scripts/core/meta/dailyChallenge';
import * as Dex from '../assets/scripts/core/meta/dex';
import * as Features from '../assets/scripts/core/meta/features';
import * as HomeBase from '../assets/scripts/core/meta/homeBase';
import * as LevelChest from '../assets/scripts/core/meta/levelChest';
import * as Lives from '../assets/scripts/core/meta/lives';
import * as Meta from '../assets/scripts/core/meta/meta';
import * as PlayerData from '../assets/scripts/core/meta/playerData';
import type { SaveData } from '../assets/scripts/core/meta/save';
import * as Settle from '../assets/scripts/core/meta/settle';
import * as Share from '../assets/scripts/core/meta/share';
import * as SignIn from '../assets/scripts/core/meta/signIn';
import * as Skills from '../assets/scripts/core/meta/skills';
import * as Wheel from '../assets/scripts/core/meta/wheel';
import { Rng } from '../assets/scripts/core/rng/rng';
import { Action, apply, start } from '../assets/scripts/core/rules/rules';
import * as Bots from '../assets/scripts/core/solver/bots';
import * as LevelCheck from '../assets/scripts/core/solver/levelCheck';
import { diff, golden, goldenLevel, hasGolden } from './helpers';

/** 文档改过行为的字段：week（每周过关目标）；version（Cocos 版存档从 1 开始，不迁移旧档） */
const SAVE_SKIP = ['week', 'version'];

function same(want: unknown, got: unknown, what: string, skip: readonly string[] = []): void {
  const d = diff(want, got, '$', skip);
  assert.equal(d, null, `${what}: ${d}`);
}

const OBSTACLES = ['chain', 'timer', 'fog', 'ice', 'big', 'pairs'] as const;

/** 黄金数据里的关卡 fog 是布尔（旧格式），现在是计数；不带迷雾的关卡 false 对应 0 */
function oldFog(level: Record<string, unknown> | null): Record<string, unknown> | null {
  if (level === null) return null;
  const bubbles = (level.bubbles as Record<string, unknown>[]).map((b) => ({ ...b, fog: b.fog === true ? 1 : b.fog === false ? 0 : b.fog }));
  return { ...level, bubbles };
}

const skip = !hasGolden() && '没有黄金数据（./run.sh golden 导出后放进 client/tests/golden/）';

describe('黄金数据：Godot 版与 TS 版逐项一致', { skip }, () => {
  it('rng 逐位一致', () => {
    for (const g of golden<{ seed: number; u32: number[]; range: number[]; randf: number[]; shuffle: number[] }[]>('rng')) {
      const r = new Rng(g.seed);
      assert.deepEqual(Array.from({ length: 200 }, () => r.nextU32()), g.u32, `seed ${g.seed} u32`);
      assert.deepEqual(Array.from({ length: 50 }, () => r.rangeI(-3, 17)), g.range, `seed ${g.seed} range`);
      assert.deepEqual(Array.from({ length: 50 }, () => r.randf()), g.randf, `seed ${g.seed} randf`);
      const arr = Array.from({ length: 20 }, (_, i) => i);
      r.shuffle(arr);
      assert.deepEqual(arr, g.shuffle, `seed ${g.seed} shuffle`);
    }
  });

  it('生成器：同参数同种子生成同一关', () => {
    let compared = 0;
    for (const g of golden<{ p: GenParams; seed: number; level: Record<string, unknown> | null }[]>('gen')) {
      if (OBSTACLES.some((m) => Number(g.p[m] ?? 0) > 0)) continue;
      compared++;
      const lv = generate(g.p, g.seed);
      const raw =
        lv === null
          ? null
          : {
              id: lv.id,
              seed: lv.levelSeed,
              challenge: lv.challenge,
              buffer: lv.buffer,
              bowlSlots: lv.bowlSlots,
              fieldCap: lv.fieldCap,
              palette: lv.palette,
              orders: lv.orders,
              bubbles: lv.bubbles,
              ref: lv.ref,
              variants: lv.variants,
            };
      same(oldFog(g.level), raw, `generate(${JSON.stringify(g.p)}, ${g.seed})`);
    }
    assert.ok(compared >= 3, `不带障碍的生成用例 ${compared} 个`);
  });

  it('全部关卡：校验、参考解回放、机器人胜率', () => {
    const runs = 40;
    type Row = { name: string; errors: string[]; won: boolean; peak: number; steps: Record<string, number>; g2: number; g3: number; r2: number };
    const rows = golden<Row[]>('levels');
    assert.ok(rows.length >= 360, `关卡数 ${rows.length}`);
    let compared = 0;
    for (const g of rows) {
      const lv = goldenLevel(g.name);
      const rep = LevelCheck.replay(lv);
      same({ won: g.won, peak: g.peak, steps: g.steps }, { won: rep.won, peak: rep.peak, steps: Object.fromEntries(rep.steps) }, `${g.name} replay`);
      // 校验规则加了冰封的新约束，带冰封的旧关卡不比错误列表；机器人会超时、看不见迷雾，带这两样的不比胜率
      if (!lv.bubbles.some((b) => b.ice.length > 0)) assert.deepEqual(LevelCheck.errors(lv), g.errors, `${g.name} errors`);
      if (lv.orders.some((o) => o.timer > 0) || lv.bubbles.some((b) => b.fog > 0)) continue;
      compared++;
      assert.equal(Bots.rate(lv, 'greedy', 2, runs), g.g2, `${g.name} 2 缸贪心胜率`);
      if (g.g3 >= 0) assert.equal(Bots.rate(lv, 'greedy', 3, runs), g.g3, `${g.name} 3 缸贪心胜率`);
      if (g.r2 >= 0) assert.equal(Bots.rate(lv, 'random', 2, runs), g.r2, `${g.name} 随机胜率`);
    }
    assert.ok(compared >= 100, `比了胜率的关卡 ${compared} 个`);
  });

  it('局内：随机操作序列的事件流与终局', () => {
    type Play = { name: string; start: unknown[]; steps: { act: Action; ev: unknown[] }[]; final: unknown };
    let compared = 0;
    let steps = 0;
    for (const g of golden<Play[]>('play')) {
      const lv = goldenLevel(g.name);
      if (lv.bubbles.some((b) => b.fog > 0)) continue;
      if (lv.bubbles.some((b) => b.pairs.length > 0) && g.steps.some((x) => x.act.a === 'shuffle')) continue;
      compared++;
      const s = GameState.fromLevel(lv);
      same(g.start, start(s), `${g.name} 开局`);
      // 洋流的规则改过：比到第一次用洋流之前为止，之后的局面已经不同，终局也不比
      const cut = g.steps.findIndex((x) => x.act.a === 'current');
      const upto = cut < 0 ? g.steps.length : cut;
      for (let i = 0; i < upto; i++) same(g.steps[i].ev, apply(s, g.steps[i].act), `${g.name} 第 ${i + 1} 步 ${JSON.stringify(g.steps[i].act)}`);
      steps += upto;
      if (cut < 0) same(g.final, s.snapshot(), `${g.name} 终局`);
    }
    assert.ok(compared >= 10 && steps >= 200, `比了事件流的对局 ${compared} 局、${steps} 步`);
  });

  it('局外：60 天模拟逐次调用一致', () => {
    const eco = golden<EconomyConfig>('economy');
    const ads = golden<AdsConfig>('ads');
    const species = golden<{ species: Species[] }>('species').species;
    type Op = { fn: string; args: unknown[]; ret: unknown };
    const g = golden<{
      seed: number;
      ops: Op[];
      days: { ops: number; save: unknown }[];
      create: unknown;
      features: string[];
      odds: unknown;
    }>('meta');
    same(g.create, PlayerData.create(eco), 'PlayerData.create', SAVE_SKIP);
    assert.deepEqual(Features.newlyUnlocked(eco, 0, 200), g.features, 'Features.newly_unlocked');
    same(g.odds, Wheel.odds(eco), 'Wheel.odds');

    const save: SaveData = PlayerData.create(eco);
    const rng = new Rng(g.seed);
    let combo = new Combo();
    let lastSign: SignIn.SignInResult | null = null;
    let lastWin: Settle.WinResult | null = null;
    const n = (v: unknown) => v as number;
    const call = (op: Op): unknown => {
      const a = op.args;
      switch (op.fn) {
        case 'SignIn.claim':
          return (lastSign = SignIn.claim(save, eco, species, rng, n(a[0]), n(a[1]), a[2] as boolean));
        case 'SignIn.double_today':
          return SignIn.doubleToday(save, eco, species, rng, n(a[0]), n(a[1]), lastSign);
        case 'Meta.take_free_coin':
          return Meta.takeFreeCoin(save, eco, n(a[0]));
        case 'Lives.can_start':
          return Lives.canStart(save, eco, n(a[0]), n(a[1]));
        case 'Lives.buy_one':
          return Lives.buyOne(save, eco, n(a[0]));
        case 'Lives.buy_refill':
          return Lives.buyRefill(save, eco, n(a[0]));
        case 'Lives.lose':
          return Lives.lose(save, eco, n(a[0]), a[1] as boolean, n(a[2]));
        case 'Lives.seconds_to_next':
          return Lives.secondsToNext(save, eco, n(a[0]));
        case 'Combo.new':
          combo = new Combo();
          return null;
        case 'Combo.miss':
          combo.miss();
          return null;
        case 'Combo.hit':
          return combo.hit(n(a[0]), eco.combo, rng, a[1] as boolean);
        case 'Dex.record':
          Dex.record(save, a[0] as Record<string, number>);
          return null;
        case 'Dex.claim':
          return Dex.claim(save, eco, a[0] as string);
        case 'Settle.win':
          return (lastWin = Settle.win(save, eco, a[0] as Settle.WinArgs));
        case 'Settle.double_coins':
          return Settle.doubleCoins(save, eco, lastWin as Settle.WinResult);
        case 'LevelChest.open':
          return LevelChest.open(save, eco, species, n(a[0]), a[1] as boolean, rng);
        case 'LevelChest.open_ad':
          return LevelChest.openAd(save, eco, species, n(a[0]), a[1] as boolean, rng);
        case 'Meta.should_show_interstitial':
          return Meta.shouldShowInterstitial(save, ads, n(a[0]), n(a[1]));
        case 'Meta.mark_interstitial':
          Meta.markInterstitial(save, n(a[0]), n(a[1]));
          return null;
        case 'Meta.mark_rewarded':
          Meta.markRewarded(save, n(a[0]));
          return null;
        case 'Meta.fail_level':
          return Meta.failLevel(save, eco, n(a[0]));
        case 'Meta.open_slots_for':
          return Meta.openSlotsFor(save, eco, n(a[0]), n(a[1]));
        case 'Skills.try_use':
          return Skills.tryUse(save, eco, a[0] as string, n(a[1]), n(a[2]));
        case 'Skills.buy':
          return Skills.buy(save, eco, a[0] as string);
        case 'Wheel.claim_ad':
          return Wheel.claimAd(save, eco, n(a[0]));
        case 'Wheel.spin':
          return Wheel.spin(save, eco, species, rng, n(a[0]), n(a[1]), a[2] as 'spin' | 'coins');
        case 'Wheel.ten_pull':
          return Wheel.tenPull(save, eco, species, rng, n(a[0]), n(a[1]));
        case 'Wheel.spins_left':
          return Wheel.spinsLeft(save, eco, n(a[0]));
        case 'Share.claim':
          return Share.claim(save, eco, a[0] as string, n(a[1]), n(a[2]), rng);
        case 'DailyChallenge.enter':
          return DailyChallenge.enter(save, eco, n(a[0]), a[1] as 'free' | 'ad' | 'coins');
        case 'DailyChallenge.win':
          return DailyChallenge.win(save, eco, species, n(a[0]), n(a[1]), rng, n(a[2]));
        case 'HomeBase.build':
          return HomeBase.build(save, eco, n(a[0]));
        case 'Album.claim':
          return Album.claim(save, eco, n(a[0]), n(a[1]));
        case 'Album.claim_final':
          return Album.claimFinal(save, eco, n(a[0]));
      }
      throw new Error(`黄金数据里有没对上的调用 ${op.fn}`);
    };
    let day = 0;
    g.ops.forEach((op, i) => {
      same(op.ret, call(op), `第 ${i + 1} 次调用 ${op.fn}(${JSON.stringify(op.args)})`);
      while (day < g.days.length && g.days[day].ops === i + 1) {
        same(g.days[day].save, save, `第 ${day + 1} 天结束时的存档`, SAVE_SKIP);
        day++;
      }
    });
    assert.equal(day, g.days.length, '每天的存档都比过');
  });
});
