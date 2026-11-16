// 文档已改、Godot 代码没改的部分（docs/09 第 1 节），在 TS 版按 docs/01 实现。这部分没有黄金数据，以文档为准。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as Album from '../assets/scripts/core/meta/album';
import * as DailyChallenge from '../assets/scripts/core/meta/dailyChallenge';
import * as Features from '../assets/scripts/core/meta/features';
import * as HomeBase from '../assets/scripts/core/meta/homeBase';
import * as Lives from '../assets/scripts/core/meta/lives';
import * as PlayerData from '../assets/scripts/core/meta/playerData';
import type { SaveData } from '../assets/scripts/core/meta/save';
import * as Seas from '../assets/scripts/core/meta/seas';
import * as Settle from '../assets/scripts/core/meta/settle';
import * as WeeklyGoal from '../assets/scripts/core/meta/weeklyGoal';
import { Rng } from '../assets/scripts/core/rng/rng';
import { eco as loadEco, species as loadSpecies } from './helpers';

const ECO = loadEco();
const SPECIES = loadSpecies();
const NOW = 3_000_000;
const SEAS = ['shore', 'coral', 'kelp', 'wreck', 'crystal', 'palace'];

function fresh(level: number): SaveData {
  const s = PlayerData.create(ECO);
  s.level = level;
  return s;
}

describe('海域（docs/01 5.0）', () => {
  it('6 个海域：收藏册、家园区域按同一顺序，开放关按表', () => {
    assert.deepEqual(Seas.list(ECO).map((s) => s.id), SEAS);
    assert.deepEqual(Album.books(ECO).map((b) => b.sea), SEAS);
    assert.deepEqual(HomeBase.areas(ECO).map((a) => a.id), SEAS);
    assert.deepEqual(Album.books(ECO).map((b) => b.unlock), [6, 20, 40, 60, 80, 100]);
    assert.deepEqual(HomeBase.areas(ECO).map((a) => a.unlock), [8, 25, 45, 65, 85, 105]);
    assert.equal(Album.books(ECO)[0].unlock, Features.unlockLevel(ECO, 'album'), '第一册随收藏开放');
    assert.equal(HomeBase.unlockLevel(ECO, 0), Features.unlockLevel(ECO, 'homeBase'), '第一区随家园开放');
  });

  it('关卡背景：第 1–19 关沙滩 … 第 100–120 关宫殿', () => {
    const at = (id: number) => SEAS[Seas.forLevel(ECO, id)];
    assert.equal(at(1), 'shore');
    assert.equal(at(19), 'shore');
    assert.equal(at(20), 'coral');
    assert.equal(at(59), 'kelp');
    assert.equal(at(60), 'wreck');
    assert.equal(at(99), 'crystal');
    assert.equal(at(100), 'palace');
    assert.equal(at(120), 'palace');
  });

  it('每册 10 张、普通 5 张；60 张各在一册；传说只在海底宫殿；局内 16 种按 ★ 分布', () => {
    const rarity = Object.fromEntries(SPECIES.map((s) => [s.id, s.rarity]));
    const seen = new Set<string>();
    const inLevel = new Set(SPECIES.filter((s) => s.inLevel).map((s) => s.id));
    const stars = [3, 2, 2, 3, 2, 4];
    Album.books(ECO).forEach((b, i) => {
      assert.equal(b.cards.length, 10);
      assert.equal(b.cards.filter((c) => rarity[c] === 'common').length, 5);
      assert.equal(b.cards.filter((c) => inLevel.has(c)).length, stars[i], `${b.sea} 的局内生物`);
      for (const c of b.cards) {
        assert.ok(!seen.has(c), `${c} 只在一册`);
        seen.add(c);
        if (rarity[c] === 'legend') assert.equal(b.sea, 'palace');
      }
    });
    assert.equal(seen.size, 60);
    assert.equal(inLevel.size, 16);
  });
});

describe('家园 6 个区域（docs/01 5.12）', () => {
  it('表格数字：合计 76 星、73600 金币，宝箱返还 24500', () => {
    assert.equal(HomeBase.areaCount(ECO), 6);
    for (let i = 0; i < 6; i++) assert.equal(HomeBase.stepCount(ECO, i), 5);
    assert.deepEqual(HomeBase.totalCost(ECO), { stars: 76, coins: 73600 });
    const perArea = HomeBase.areas(ECO).map((a) => [a.steps.reduce((s, x) => s + x[0], 0), a.steps.reduce((s, x) => s + x[1], 0)]);
    assert.deepEqual(perArea, [[7, 2600], [12, 8000], [13, 10000], [14, 12000], [15, 17000], [15, 24000]]);
    assert.equal(HomeBase.areas(ECO).reduce((s, a) => s + (a.reward.coins ?? 0), 0), 24500);
    assert.equal(HomeBase.areas(ECO).reduce((s, a) => s + (a.reward.tools ?? 0) * 4, 0), 40, '技能 ×40');
    assert.equal(HomeBase.areas(ECO).reduce((s, a) => s + (a.reward.unlimited ?? 0), 0), 10 * 3600, '10 小时无限生命');
  });

  it('星星一直够：到每个区域开放关时，攒的星星够建完它和之前所有区域', () => {
    let need = 0;
    for (const a of HomeBase.areas(ECO)) {
      need += a.steps.reduce((s, x) => s + x[0], 0);
      assert.ok(HomeBase.starsThrough(ECO, a.unlock - 1) >= need, `${a.id}：第 ${a.unlock} 关时 ${HomeBase.starsThrough(ECO, a.unlock - 1)} 颗，要 ${need}`);
    }
  });

  it('第 8 关开放时手里 8 颗星，正好能开始建', () => {
    assert.equal(HomeBase.starsThrough(ECO, 7), 8);
  });

  it('建造流程：第一步 1 星 300 金币，建完开区域宝箱，下一区要到开放关', () => {
    const save = fresh(7);
    save.coins = 100000;
    save.base.stars = 100;
    assert.equal(HomeBase.check(save, ECO), 'locked');
    save.level = 8;
    assert.deepEqual(HomeBase.nextCost(save, ECO), { stars: 1, coins: 300 });
    let r = HomeBase.build(save, ECO, NOW);
    assert.ok(r.ok && r.area === 0 && r.step === 0 && !r.completed);
    for (let i = 0; i < 3; i++) HomeBase.build(save, ECO, NOW);
    r = HomeBase.build(save, ECO, NOW);
    assert.ok(r.completed && r.prizes.length > 0);
    assert.equal(save.coins, 100000 - 2600 + 1000);
    assert.equal(save.tools.net, 1);
    assert.ok(Lives.isUnlimited(save, NOW + 3599));
    assert.equal(HomeBase.check(save, ECO), 'locked', '区域 2 要到第 25 关');
    save.level = 25;
    assert.ok(HomeBase.canBuild(save, ECO));
    save.coins = 0;
    assert.equal(HomeBase.check(save, ECO), 'coins');
  });

  it('全部建完：6 个区域宝箱', () => {
    const save = fresh(200);
    save.coins = 1_000_000;
    save.base.stars = 1000;
    let chests = 0;
    while (HomeBase.canBuild(save, ECO)) if (HomeBase.build(save, ECO, NOW).completed) chests++;
    assert.equal(chests, 6);
    assert.ok(HomeBase.allDone(save, ECO));
    assert.equal(HomeBase.nextCost(save, ECO), null);
  });
});

describe('每周过关目标（docs/01 5.9）', () => {
  const win = (save: SaveData, level: number, day: number) =>
    Settle.win(save, ECO, { level, challenge: false, day, now: NOW });

  it('10 / 25 / 50 关各领一档，按档发奖', () => {
    const save = fresh(11);
    const day = 4 + 7 * 100; // 周一
    for (let i = 0; i < 9; i++) win(save, save.level, day);
    assert.equal(WeeklyGoal.cleared(save, day), 9);
    assert.equal(WeeklyGoal.claimable(save, ECO, day), 0);
    win(save, save.level, day);
    assert.equal(WeeklyGoal.claimable(save, ECO, day), 1, '红点');
    const coins = save.coins;
    assert.deepEqual(WeeklyGoal.claim(save, ECO, 0, day, NOW, new Rng(1)), [{ kind: 'coin', amount: 300 }]);
    assert.equal(save.coins, coins + 300);
    assert.deepEqual(WeeklyGoal.claim(save, ECO, 0, day, NOW, new Rng(1)), [], '一档只领一次');
    assert.deepEqual(WeeklyGoal.claim(save, ECO, 1, day, NOW, new Rng(1)), [], '没到 25 关');
    for (let i = 0; i < 15; i++) win(save, save.level, day + 1);
    const p25 = WeeklyGoal.claim(save, ECO, 1, day + 1, NOW, new Rng(1));
    assert.deepEqual(p25[0], { kind: 'coin', amount: 600 });
    assert.equal(p25.filter((p) => p.kind === 'skill').length, 1, '25 关：随机技能 1 个');
    for (let i = 0; i < 25; i++) win(save, save.level, day + 2);
    const p50 = WeeklyGoal.claim(save, ECO, 2, day + 2, NOW, new Rng(1));
    assert.deepEqual(p50[0], { kind: 'coin', amount: 1200 });
    assert.equal(p50.filter((p) => p.kind === 'skill').length, 4, '50 关：每种技能 1 个');
  });

  it('重玩旧关和每日挑战不算；周一清零，没领的作废', () => {
    const save = fresh(40);
    const day = 4 + 7 * 100;
    for (let i = 0; i < 12; i++) win(save, 5, day);
    DailyChallenge.win(save, ECO, SPECIES, day, NOW, new Rng(1));
    assert.equal(WeeklyGoal.cleared(save, day), 0);
    for (let i = 0; i < 10; i++) win(save, save.level, day + 6);
    assert.equal(WeeklyGoal.claimable(save, ECO, day + 6), 1);
    assert.equal(WeeklyGoal.claimable(save, ECO, day + 7), 0, '下周一作废');
    assert.equal(WeeklyGoal.cleared(save, day + 7), 0);
  });

  it('第 11 关（排行开放）前不能领', () => {
    const save = fresh(1);
    const day = 4 + 7 * 100;
    for (let i = 0; i < 10; i++) win(save, save.level, day);
    assert.equal(save.level, 11);
    assert.equal(WeeklyGoal.claimable(save, ECO, day), 1, '第 11 关开放后，本周之前过的关也算');
    save.level = 10;
    assert.equal(WeeklyGoal.claimable(save, ECO, day), 0);
  });
});

describe('读档（测试开发版不导入旧存档，docs/09 第 8 节）', () => {
  it('旧版本、损坏、不是对象：一律开新档，不换算任何数据', () => {
    for (const raw of [
      { version: 2, level: 80, coins: 99999, tickets: 7 },
      { version: 1.5, level: 3 },
      { level: 9, coins: 77 },
      null,
      'save',
      [1, 2],
    ]) {
      const save = PlayerData.load(structuredClone(raw), ECO);
      assert.deepEqual(save, PlayerData.create(ECO), JSON.stringify(raw));
    }
  });

  it('版本对：原样保留，缺的字段补默认值', () => {
    const save = PlayerData.create(ECO);
    save.level = 42;
    save.coins = 1234;
    save.cards = { c01: 3 };
    const raw = JSON.parse(JSON.stringify(save)) as Record<string, unknown>;
    delete raw.dex;
    delete (raw.daily as Record<string, unknown>).lifeAd;
    delete (raw.week as Record<string, unknown>).claimed;
    raw.base = 'broken';
    const back = PlayerData.load(raw, ECO);
    assert.equal(back.level, 42);
    assert.equal(back.coins, 1234);
    assert.deepEqual(back.cards, { c01: 3 }, '收藏卡不补默认字段');
    assert.deepEqual(back.dex, { seen: {}, claimed: {} });
    assert.equal(back.daily.lifeAd, 0);
    assert.deepEqual(back.week.claimed, []);
    assert.deepEqual(back.base, { stars: 0, built: [] }, '类型不对的字段换成默认值');
    assert.deepEqual(PlayerData.load(structuredClone(back), ECO), back, '再读一遍不变');
  });

  it('存档能直接转 JSON', () => {
    const save = PlayerData.create(ECO);
    assert.deepEqual(JSON.parse(JSON.stringify(save)), save);
    assert.equal(save.version, PlayerData.VERSION);
  });

  it('看过的教学', () => {
    const save = PlayerData.create(ECO);
    assert.ok(!PlayerData.tipSeen(save, 'skill_blow'));
    PlayerData.markTip(save, 'skill_blow');
    assert.ok(PlayerData.tipSeen(save, 'skill_blow'));
    assert.ok(!PlayerData.tipSeen(save, 'skill_net'));
  });
});

describe('经济数字与 docs/01 第 6 节一致', () => {
  it('收入与支出', () => {
    assert.equal(ECO.levelCoins, 100);
    assert.equal(ECO.challengeCoins, 200);
    assert.deepEqual(ECO.combo.tiers.map((t) => t.coins), [1, 2, 3, 5]);
    assert.equal(ECO.combo.maxCoinsPerLevel, 60);
    assert.deepEqual(ECO.freeCoin, { amount: 300, daily: 5 });
    assert.equal(ECO.lives.buyOneCoins, 400);
    assert.equal(ECO.lives.refillCoins, 1500);
    assert.equal(ECO.lives.adDaily, 5);
    assert.equal(ECO.bowlSlotCoinPrice, 650);
    assert.equal(ECO.dailyChallenge.retryCoins, 300);
    assert.deepEqual(ECO.dupeCoins, { common: 50, uncommon: 125, rare: 300, epic: 750, legend: 2500 });
    assert.equal(ECO.wheel.coinCost, 1000);
    assert.equal(ECO.wheel.tenCost, 9000);
  });

  it('一次性奖励合计：收藏 11200 + 5000，救援记录 7200', () => {
    assert.equal(Album.books(ECO).reduce((s, b) => s + (b.reward.coins ?? 0), 0), 11200);
    assert.equal(ECO.album.final.coins, 5000);
    const dex = ECO.dex.coins.reduce((a, b) => a + b, 0) * SPECIES.filter((s) => s.inLevel).length;
    assert.equal(dex, 7200);
  });

  it('一关的收入不超过 200，一条命至少值两关（第 6.3 节守住的三条）', () => {
    const levelMax = ECO.challengeCoins; // 挑战关 200 是过关部分的上限；连击另算，见下
    assert.ok(ECO.levelCoins + ECO.combo.maxCoinsPerLevel + ECO.combo.bestBonus.max <= 200, '普通关最多 200');
    assert.ok(levelMax <= 200);
    assert.ok(ECO.lives.buyOneCoins >= 2 * 170, '一条命 ≥ 两关收入（一关约 170）');
    const oneOff = 11200 + 5000 + 7200;
    const base = HomeBase.totalCost(ECO).coins - HomeBase.areas(ECO).reduce((s, a) => s + (a.reward.coins ?? 0), 0);
    assert.ok(base > oneOff, `家园净消耗 ${base} 大于一次性奖励 ${oneOff}`);
  });

  it('每周目标：300 / 600 + 随机技能 1 / 1200 + 每种技能 1', () => {
    assert.deepEqual(WeeklyGoal.tiers(ECO), [
      { clears: 10, reward: { coins: 300 } },
      { clears: 25, reward: { coins: 600, skills: 1 } },
      { clears: 50, reward: { coins: 1200, tools: 1 } },
    ]);
  });
});
