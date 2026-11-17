// 文档已改、Godot 代码没改的部分（docs/09 第 1 节），在 TS 版按 docs/01 实现。这部分没有黄金数据，以文档为准。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as Album from '../assets/scripts/core/meta/album';
import * as Cards from '../assets/scripts/core/meta/cards';
import * as DailyChallenge from '../assets/scripts/core/meta/dailyChallenge';
import * as Features from '../assets/scripts/core/meta/features';
import * as PlayerData from '../assets/scripts/core/meta/playerData';
import type { SaveData } from '../assets/scripts/core/meta/save';
import * as Seas from '../assets/scripts/core/meta/seas';
import * as Settle from '../assets/scripts/core/meta/settle';
import * as Skills from '../assets/scripts/core/meta/skills';
import * as Tasks from '../assets/scripts/core/meta/tasks';
import * as Wheel from '../assets/scripts/core/meta/wheel';
import * as LevelCurve from '../assets/scripts/core/gen/levelCurve';
import { NO_TIMER } from '../assets/scripts/core/model/gameState';
import { colorDistance, pickSpecies } from '../assets/scripts/core/model/speciesPick';
import { Rng } from '../assets/scripts/core/rng/rng';
import { curve as loadCurve, eco as loadEco, levelFile, species as loadSpecies } from './helpers';

const ECO = loadEco();
const SPECIES = loadSpecies();
const NOW = 3_000_000;
const SEAS = ['shore', 'coral', 'kelp', 'wreck', 'crystal', 'palace', 'mangrove', 'lagoon', 'vent', 'ruins', 'trench', 'starsea'];

function fresh(level: number): SaveData {
  const s = PlayerData.create(ECO);
  s.level = level;
  return s;
}

describe('海域（docs/01 5.0）', () => {
  it('12 个海域：收藏册按同一顺序，开放关按表', () => {
    assert.deepEqual(Seas.list(ECO).map((s) => s.id), SEAS);
    assert.deepEqual(Album.books(ECO).map((b) => b.sea), SEAS);
    assert.deepEqual(Album.books(ECO).map((b) => b.unlock), [6, 21, 41, 61, 81, 101, 121, 141, 161, 181, 201, 221]);
    assert.equal(Album.books(ECO)[0].unlock, Features.unlockLevel(ECO, 'album'), '第一册随收藏开放');
  });

  it('关卡背景：每 20 关一个海域，第 1–20 关沙滩 … 第 101–120 关宫殿（和选关页一页一个海域对上）', () => {
    const at = (id: number) => SEAS[Seas.forLevel(ECO, id)];
    assert.equal(at(1), 'shore');
    assert.equal(at(20), 'shore');
    assert.equal(at(21), 'coral');
    assert.equal(at(60), 'kelp');
    assert.equal(at(61), 'wreck');
    assert.equal(at(100), 'crystal');
    assert.equal(at(101), 'palace');
    assert.equal(at(120), 'palace');
    assert.equal(at(121), 'mangrove');
    assert.equal(at(200), 'ruins');
    assert.equal(at(221), 'starsea');
    assert.equal(at(240), 'starsea');
    // 收藏册子在进到这片海域的第一关开放（第一册随收藏功能在第 6 关开放）
    Album.books(ECO).forEach((b, i) => assert.equal(b.unlock, i === 0 ? 6 : Seas.list(ECO)[i].levelFrom));
  });

  it('每册普通 10、精良 15、稀有 9、史诗 5 共 39 张（海底宫殿多 1 张精良、2 张传说，42 张）；张数都是 3 的倍数；471 张各在一册；局内 94 种，每册 7–9 种', () => {
    const rarity = Object.fromEntries(SPECIES.map((s) => [s.id, s.rarity]));
    const seen = new Set<string>();
    const inLevel = new Set(SPECIES.filter((s) => s.inLevel).map((s) => s.id));
    const stars = [8, 7, 7, 8, 7, 9, 8, 8, 8, 8, 8, 8];
    Album.books(ECO).forEach((b, i) => {
      const n = (r: string) => b.cards.filter((c) => rarity[c] === r).length;
      const palace = b.sea === 'palace';
      assert.deepEqual([n('common'), n('uncommon'), n('rare'), n('epic')], [10, palace ? 16 : 15, 9, 5], b.sea);
      assert.equal(b.cards.length, palace ? 42 : 39);
      assert.equal(b.cards.length % 3, 0, '一册的张数是 3 的倍数（收藏格子 3 列，最后一行排满）');
      assert.equal(b.cards.filter((c) => inLevel.has(c)).length, stars[i], `${b.sea} 的局内生物`);
      for (const c of b.cards) {
        assert.ok(!seen.has(c), `${c} 只在一册`);
        seen.add(c);
        if (rarity[c] === 'legend') assert.equal(b.sea, 'palace');
      }
    });
    assert.equal(seen.size, 471);
    assert.equal(seen.size % 3, 0);
    assert.equal(inLevel.size, 94);
  });
});

describe('任务中心（docs/01 5.9）', () => {
  const MON = 4 + 7 * 100; // 周一
  const win = (save: SaveData, level: number, day: number) =>
    Settle.win(save, ECO, { level, challenge: false, day, now: NOW });
  /** 把今天抽到的任务全做完 */
  const finishAll = (save: SaveData, day: number) => {
    for (const t of Tasks.list(save, ECO, day)) Tasks.add(save, ECO, day, t.id, t.goal);
  };

  it('每天 6 项：3 项固定 + 3 项随机，只抽已开放的；同一天同进度抽到的一样', () => {
    const save = fresh(30);
    const ids = Tasks.list(save, ECO, MON).map((t) => t.id);
    assert.equal(ids.length, 6);
    assert.deepEqual(ids.slice(0, 3), ['win', 'rescue', 'ad']);
    assert.equal(new Set(ids).size, 6);
    assert.deepEqual(Tasks.pick(ECO, MON, 30), ids);
    const seen = new Set<string>();
    for (let d = 0; d < 60; d++) for (const id of Tasks.pick(ECO, MON + d, 30)) seen.add(id);
    assert.equal(seen.size, 8, '8 种任务都会轮到');
    for (let d = 0; d < 60; d++) assert.ok(!Tasks.pick(ECO, MON + d, 11).includes('daily'), '每日挑战第 20 关才开');
    const sum = Tasks.list(save, ECO, MON).reduce((a, t) => a + t.points, 0);
    assert.equal(sum, 130, '能拿到的一共 130 分');
  });

  it('新玩家第一天定表时不够 6 项：之后开放了新功能就补上，已有的和进度不动', () => {
    const save = fresh(1);
    const first = Tasks.list(save, ECO, MON).map((t) => t.id);
    assert.ok(first.length < 6, '第 1 关时技能、抽奖、每日挑战都没开');
    Tasks.add(save, ECO, MON, 'win', 2);
    save.level = 25;
    const later = Tasks.list(save, ECO, MON).map((t) => t.id);
    assert.equal(later.length, 6);
    assert.deepEqual(later.slice(0, first.length), first);
    assert.equal(Tasks.progress(save, ECO, 'win', MON), 2);
  });

  it('做完自动记积分，每日封顶 100，同时累计成本周积分', () => {
    const save = fresh(30);
    win(save, save.level, MON);
    win(save, 5, MON);
    assert.equal(Tasks.progress(save, ECO, 'win', MON), 2);
    assert.equal(Tasks.dayPoints(save, ECO, MON), 0);
    win(save, 5, MON);
    assert.equal(Tasks.dayPoints(save, ECO, MON), 30, '过 3 关 30 分，重玩也算');
    win(save, 5, MON);
    assert.equal(Tasks.progress(save, ECO, 'win', MON), 3, '进度到目标为止');
    assert.equal(Tasks.add(save, ECO, MON, 'rescue', 12), 0);
    assert.equal(Tasks.add(save, ECO, MON, 'rescue', 18), 20);
    assert.equal(Tasks.add(save, ECO, MON, 'nothing', 1), 0);
    finishAll(save, MON);
    assert.equal(Tasks.dayPoints(save, ECO, MON), 100);
    assert.equal(Tasks.weekPoints(save, ECO, MON), 100);
    finishAll(save, MON + 1);
    assert.equal(Tasks.dayPoints(save, ECO, MON + 1), 100, '第二天从头算');
    assert.equal(Tasks.weekPoints(save, ECO, MON + 1), 200);
    assert.equal(Tasks.weekMax(ECO), 700);
  });

  it('不看广告也能拿满；最高连击取单局最大值', () => {
    const save = fresh(30);
    for (const t of Tasks.list(save, ECO, MON)) if (t.id !== 'ad') Tasks.add(save, ECO, MON, t.id, t.goal);
    assert.equal(Tasks.dayPoints(save, ECO, MON), 100);
    const day = Array.from({ length: 60 }, (_, d) => MON + d).find((d) => Tasks.pick(ECO, d, 30).includes('combo')) as number;
    Tasks.add(save, ECO, day, 'combo', 4);
    Tasks.add(save, ECO, day, 'combo', 5);
    assert.equal(Tasks.progress(save, ECO, 'combo', day), 5, '4 连 + 5 连不是 9 连');
    Tasks.add(save, ECO, day, 'combo', 9);
    assert.ok(Tasks.isDone(save, ECO, 'combo', day));
  });

  it('技能、抽奖、每日挑战在各自的规则里记进度', () => {
    const save = fresh(30);
    const day = Array.from({ length: 60 }, (_, d) => MON + d).find((d) => {
      const ids = Tasks.pick(ECO, d, 30);
      return ids.includes('skill') && ids.includes('daily');
    }) as number;
    assert.ok(Skills.tryUse(save, ECO, 'shuffle', 0, day).ok);
    assert.ok(Tasks.isDone(save, ECO, 'skill', day));
    DailyChallenge.win(save, ECO, SPECIES, day, NOW, new Rng(1));
    assert.ok(Tasks.isDone(save, ECO, 'daily', day));
    assert.equal(Tasks.progress(save, ECO, 'win', day), 1, '每日挑战过关也算过一关');
    const wd = Array.from({ length: 60 }, (_, d) => MON + d).find((d) => Tasks.pick(ECO, d, 30).includes('wheel')) as number;
    assert.ok(Wheel.spin(save, ECO, SPECIES, new Rng(1), wd, NOW, 'spin'));
    assert.ok(Tasks.isDone(save, ECO, 'wheel', wd));
  });

  it('每日宝箱 20 / 50 / 80 / 100：16 金币、20 金币、24 金币、普通或精良卡 1 张', () => {
    const save = fresh(30);
    assert.equal(Tasks.claimable(save, ECO, MON), 0);
    finishAll(save, MON);
    assert.equal(Tasks.claimable(save, ECO, MON), 4, '红点');
    const claim = (i: number) => Tasks.claim(save, ECO, SPECIES, 'day', i, MON, NOW, new Rng(7 + i));
    assert.deepEqual(claim(0), [{ kind: 'coin', amount: 16 }]);
    assert.deepEqual(claim(0), [], '一档只领一次');
    // 第二档原来送一个随机技能：免费技能太多，玩家不用花金币买，2026-11-18 换成金币（docs/01 6.3）
    assert.deepEqual(claim(1), [{ kind: 'coin', amount: 20 }]);
    assert.deepEqual(claim(2), [{ kind: 'coin', amount: 24 }]);
    const p100 = claim(3);
    assert.equal(p100.length, 1);
    assert.equal(p100[0].kind, 'card');
    assert.equal(Tasks.claimable(save, ECO, MON), 0);
    for (let seed = 0; seed < 200; seed++) {
      const s2 = fresh(120);
      finishAll(s2, MON);
      const card = Tasks.claim(s2, ECO, SPECIES, 'day', 3, MON, NOW, new Rng(seed))[0];
      assert.ok(card.rarity === 'common' || card.rarity === 'uncommon', '每日的卡不出稀有以上');
    }
  });

  it('本周宝箱 150 / 350 / 550：金币 + 技能、精良以上卡、稀有以上卡（优先没有的）+ 无限生命', () => {
    const save = fresh(120);
    finishAll(save, MON);
    assert.deepEqual(Tasks.claim(save, ECO, SPECIES, 'week', 0, MON, NOW, new Rng(1)), [], '100 分不够 150');
    finishAll(save, MON + 1);
    const p150 = Tasks.claim(save, ECO, SPECIES, 'week', 0, MON + 1, NOW, new Rng(1));
    assert.deepEqual(p150[0], { kind: 'coin', amount: 60 });
    assert.equal(p150.filter((p) => p.kind === 'skill').length, 1);
    for (let d = 2; d < 6; d++) finishAll(save, MON + d);
    assert.equal(Tasks.weekPoints(save, ECO, MON + 5), 600);
    const p350 = Tasks.claim(save, ECO, SPECIES, 'week', 1, MON + 5, NOW, new Rng(2));
    assert.equal(p350.length, 1);
    assert.ok(Cards.rank(ECO, p350[0].rarity as string) >= 1, '精良以上');
    const p550 = Tasks.claim(save, ECO, SPECIES, 'week', 2, MON + 5, NOW, new Rng(3));
    assert.deepEqual(p550[0], { kind: 'coin', amount: 80 });
    assert.equal(p550.filter((p) => p.kind === 'skill').length, 1, '随机技能 1 个（原来每种 1 个，2026-11-18 减）');
    assert.deepEqual(p550.find((p) => p.kind === 'inf_life'), { kind: 'inf_life', amount: 30 });
    const card = p550[p550.length - 1];
    assert.ok(card.kind === 'card' && Cards.rank(ECO, card.rarity as string) >= 2 && card.is_new, '稀有以上，优先没有的');
  });

  it('周一清零，没领的作废；第 11 关（任务开放）前不能领', () => {
    const save = fresh(30);
    for (let d = 0; d < 2; d++) finishAll(save, MON + d);
    assert.ok(Tasks.canClaim(save, ECO, 'week', 0, MON + 1));
    assert.equal(Tasks.weekPoints(save, ECO, MON + 7), 0);
    assert.equal(Tasks.claimable(save, ECO, MON + 7), 0, '下周一作废');
    const early = fresh(10);
    finishAll(early, MON);
    assert.equal(Tasks.dayPoints(early, ECO, MON), 100, '开放前照样记进度');
    assert.equal(Tasks.claimable(early, ECO, MON), 0);
    early.level = 11;
    assert.equal(Tasks.claimable(early, ECO, MON), 4);
  });

  it('任务中心发的金币：每日 60 × 7 + 每周 140 = 560（金币整体缩小 5 倍后）', () => {
    const coins = (ts: { reward?: { coins?: number } }[]) => ts.reduce((a, t) => a + (t.reward?.coins ?? 0), 0);
    assert.equal(coins(Tasks.tiers(ECO, 'day')), 60);
    assert.equal(coins(Tasks.tiers(ECO, 'week')), 140);
    assert.equal(coins(Tasks.tiers(ECO, 'day')) * 7 + coins(Tasks.tiers(ECO, 'week')), 560);
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
    delete (raw.week as Record<string, unknown>).taskClaimed;
    raw.chest = 'broken';
    const back = PlayerData.load(raw, ECO);
    assert.equal(back.level, 42);
    assert.equal(back.coins, 1234);
    assert.deepEqual(back.cards, { c01: 3 }, '收藏卡不补默认字段');
    assert.deepEqual(back.dex, { seen: {}, claimed: {} });
    assert.equal(back.daily.lifeAd, 0);
    assert.deepEqual(back.week.taskClaimed, []);
    assert.deepEqual(back.chest, PlayerData.create(ECO).chest, '类型不对的字段换成默认值');
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
    assert.equal(ECO.levelCoins, 20);
    assert.equal(ECO.challengeCoins, 40);
    assert.deepEqual(ECO.combo.tiers.map((t) => t.coins), [1, 1, 1, 2]);
    assert.equal(ECO.combo.maxCoinsPerLevel, 12);
    assert.deepEqual(ECO.freeCoin, { amount: 60, daily: 5 });
    assert.equal(ECO.lives.buyOneCoins, 80);
    assert.equal(ECO.lives.refillCoins, 300);
    assert.equal(ECO.lives.adDaily, 5);
    assert.deepEqual(ECO.toolPrice, { shuffle: 240, blow: 280, net: 360, current: 480 });
    assert.equal(ECO.bowlSlotCoinPrice, 300);
    assert.equal(ECO.skills.freeDaily, 1, '每天免费技能不分种类一共 1 次');
    assert.equal(ECO.dailyChallenge.retryCoins, 60);
    assert.deepEqual(ECO.dupeCoins, { common: 10, uncommon: 25, rare: 60, epic: 150, legend: 500 });
    assert.equal(ECO.wheel.coinCost, 200);
    assert.equal(ECO.wheel.tenCost, 1800);
  });

  it('一次性奖励合计：收藏 7940 + 2000，救援记录 4230（名义）', () => {
    assert.equal(Album.books(ECO).reduce((s, b) => s + (b.reward.coins ?? 0), 0), 7940);
    assert.equal(ECO.album.final.coins, 2000);
    const dex = ECO.dex.coins.reduce((a, b) => a + b, 0) * SPECIES.filter((s) => s.inLevel).length;
    assert.equal(dex, 4230);
  });

  it('一关的收入不超过 40，一条命至少值两关，一个技能至少值六关（第 6.3 节守住的几条）', () => {
    const levelMax = ECO.challengeCoins; // 挑战关 40 是过关部分的上限；连击另算，见下
    assert.ok(ECO.levelCoins + ECO.combo.maxCoinsPerLevel + ECO.combo.bestBonus.max <= 40, '普通关最多 40');
    assert.ok(levelMax <= 40);
    assert.ok(ECO.lives.buyOneCoins >= 2 * 34, '一条命 ≥ 两关收入（一关约 34）');
    for (const p of Object.values(ECO.toolPrice)) assert.ok(p >= 6 * 34, '最便宜的技能也要六关的收入：挣的不够买，才会缺金币');
    assert.ok(ECO.bowlSlotCoinPrice >= 6 * 34);
  });
});

describe('局内生物分得清（docs/03 4.1）', () => {
  const inLevel = SPECIES.filter((sp) => sp.inLevel === true);
  const CLASSES = ['round', 'long', 'tall', 'star', 'claws', 'umbrella', 'diamond', 'legs', 'shell', 'snout', 'shrimp', 'flat', 'slug', 'disc', 'tree', 'otter', 'snail', 'ghost', 'bird', 'seal', 'whale', 'angel', 'dome'];
  const at = (n: number) => Seas.forLevel(ECO, n);

  it('94 种都登记了轮廓类和量出来的主色', () => {
    assert.equal(inLevel.length, 94);
    for (const sp of inLevel) {
      assert.ok(CLASSES.includes(String(sp.shape)), `${sp.id} 的轮廓 ${sp.shape}`);
      assert.ok(sp.rgb && sp.rgb.some((v) => v > 0), `${sp.id} 没量主色`);
    }
  });

  it('前 10 关：同场的几种色差都不小于下限，轮廓类也不重复，全是本海域的', () => {
    const curve = loadCurve();
    const own = new Set(Seas.speciesPools(ECO, 0)[0]);
    for (let id = 1; id <= 10; id++) {
      const lv = levelFile(`level_${String(id).padStart(4, '0')}`);
      const gap = LevelCurve.colorGap(curve, id);
      const picked = pickSpecies(SPECIES, lv.levelSeed, lv.palette, gap, Seas.speciesPools(ECO, at(id))).map((sid) => inLevel.find((sp) => sp.id === sid)!);
      assert.equal(new Set(picked.map((sp) => sp.shape)).size, picked.length, `第 ${id} 关轮廓重复`);
      for (const sp of picked) assert.ok(own.has(sp.id), `第 ${id} 关出了别的海域的 ${sp.id}`);
      for (let i = 0; i < picked.length; i++) for (let j = 0; j < i; j++) assert.ok(colorDistance(picked[i], picked[j]) >= gap, `第 ${id} 关 ${picked[i].id} 和 ${picked[j].id} 颜色太近`);
    }
  });

  it('每关以本海域的生物为主，借的只来自前面的海域；色差凑不齐下限的最多 3 关，同场任两种都不会几乎一样（差 12 以上，docs/02 2.2）', () => {
    const curve = loadCurve();
    let short = 0;
    for (let id = 1; id <= 240; id++) {
      const lv = levelFile(`level_${String(id).padStart(4, '0')}`);
      const gap = LevelCurve.colorGap(curve, id);
      const [own, earlier] = Seas.speciesPools(ECO, at(id));
      const picked = pickSpecies(SPECIES, lv.levelSeed, lv.palette, gap, [own, earlier]);
      const mine = picked.filter((sid) => own.includes(sid)).length;
      assert.ok(mine * 2 >= picked.length, `第 ${id} 关本海域的只有 ${mine}/${picked.length}`);
      for (const sid of picked) assert.ok(own.includes(sid) || earlier.includes(sid), `第 ${id} 关出了后面海域的 ${sid}`);
      const sps = picked.map((sid) => inLevel.find((sp) => sp.id === sid)!);
      let min = 999;
      for (let i = 0; i < sps.length; i++) for (let j = 0; j < i; j++) min = Math.min(min, colorDistance(sps[i], sps[j]));
      assert.ok(min >= 12, `第 ${id} 关有两种颜色几乎一样（${min.toFixed(0)}）`);
      if (min < gap) short++;
    }
    // 换成按海域挑之前（16 种混着挑）是 8 关凑不齐
    assert.ok(short <= 3, `${short} 关凑不齐色差`);
  });
});

describe('限时关（docs/01 第 4 节）', () => {
  it('第 61 关起只有挑战关限时，普通关不限时；时间按真人手速定', () => {
    const curve = loadCurve();
    for (let id = 1; id <= curve.total; id++) {
      const lv = levelFile(`level_${String(id).padStart(4, '0')}`);
      const t = LevelCurve.clockFor(curve, id, lv);
      const chal = LevelCurve.isChallenge(curve, id);
      if (id >= 61 && chal) {
        let fish = 0;
        for (const b of lv.bubbles) fish += b.fish.length;
        const bot = fish * curve.bot.tapSec + lv.orders.length * curve.bot.bowlSec;
        // 时间按真人手速定（约 1 秒一条鱼），比机器人的 1.5 秒一条短；至少够 0.8 秒一条
        assert.ok(t >= fish * 0.8 && t < bot, `第 ${id} 关 ${t} 秒，机器人要 ${bot} 秒`);
      } else assert.equal(t, NO_TIMER, `第 ${id} 关不该限时`);
    }
  });

  it('限时关里连击加时间：没到起算不加，档位越高加得越多', () => {
    const curve = loadCurve();
    assert.equal(LevelCurve.comboSeconds(curve, -1), 0);
    let prev = 0;
    for (let tier = 0; tier < 4; tier++) {
      const add = LevelCurve.comboSeconds(curve, tier);
      assert.ok(add >= 1 && add >= prev, `第 ${tier} 档加 ${add} 秒`);
      prev = add;
    }
    assert.equal(LevelCurve.comboSeconds(curve, 9), prev, '超出的档位按最高档');
  });

  it('暂存槽：前 120 关 5 格，第 121 关起 4 格；第 26 关起同时在场至少 17 个气泡', () => {
    const curve = loadCurve();
    for (let id = 1; id <= curve.total; id++) {
      const lv = levelFile(`level_${String(id).padStart(4, '0')}`);
      assert.equal(lv.buffer, id >= 121 ? 4 : 5, `第 ${id} 关暂存槽`);
      if (id >= 26) assert.ok(lv.fieldCap >= 17, `第 ${id} 关同时在场 ${lv.fieldCap} 个`);
    }
  });
});
