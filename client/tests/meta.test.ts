// 局外系统，用 client 的新配置（数值按 docs/01）。对应 Godot 版 tests/test_meta*.gd、test_lives.gd、
// test_chest_wheel.gd、test_flow_review.gd、test_album.gd；数字跟着 docs/01 的定稿改了。
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { EconomyConfig, Species } from '../assets/scripts/core/config';
import * as Album from '../assets/scripts/core/meta/album';
import * as Cards from '../assets/scripts/core/meta/cards';
import { Combo } from '../assets/scripts/core/meta/combo';
import * as Daily from '../assets/scripts/core/meta/daily';
import * as DailyChallenge from '../assets/scripts/core/meta/dailyChallenge';
import * as Dex from '../assets/scripts/core/meta/dex';
import * as Features from '../assets/scripts/core/meta/features';
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
import * as WeeklyRank from '../assets/scripts/core/meta/weeklyRank';
import { Rng } from '../assets/scripts/core/rng/rng';
import { ads, curve, eco as loadEco, species as loadSpecies } from './helpers';

const T0 = 1_000_000;
const NOW = 3_000_000;
const ECO = loadEco();
const SPECIES = loadSpecies();

function setup(level = 20): [SaveData, EconomyConfig, Species[]] {
  const save = PlayerData.create(ECO);
  save.level = level;
  return [save, ECO, SPECIES];
}

describe('生命（docs/01 5.1）', () => {
  it('每 20 分钟恢复 1 条，离线只恢复到上限', () => {
    const [save, eco] = setup();
    assert.equal(Lives.count(save, eco, T0), 5);
    assert.ok(Lives.lose(save, eco, 10, true, T0));
    assert.ok(Lives.lose(save, eco, 10, true, T0 + 10));
    assert.equal(Lives.count(save, eco, T0 + 10), 3);
    assert.equal(Lives.secondsToNext(save, eco, T0 + 600), 600);
    assert.equal(Lives.count(save, eco, T0 + 1199), 3);
    assert.equal(Lives.count(save, eco, T0 + 1200), 4);
    assert.equal(Lives.count(save, eco, T0 + 1200 + 1199), 4, '计时从上一次恢复点接着算');
    assert.equal(Lives.count(save, eco, T0 + 100 * 3600), 5);
    assert.equal(Lives.secondsToNext(save, eco, T0 + 100 * 3600), 0);
  });

  it('跳过多个周期一次补齐，余数留着', () => {
    const [save, eco] = setup();
    for (let i = 0; i < 5; i++) Lives.lose(save, eco, 10, true, T0);
    assert.equal(Lives.count(save, eco, T0), 0);
    assert.ok(!Lives.canStart(save, eco, 10, T0));
    assert.ok(Lives.canStart(save, eco, 5, T0), '第 1–5 关不看命');
    assert.equal(Lives.count(save, eco, T0 + 3 * 1200 + 5), 3);
    assert.equal(Lives.secondsToNext(save, eco, T0 + 3 * 1200 + 5), 1195);
  });

  it('时间倒退这段不恢复，已攒的进度保留', () => {
    const [save, eco] = setup();
    Lives.lose(save, eco, 10, true, T0);
    Lives.lose(save, eco, 10, true, T0);
    assert.equal(Lives.count(save, eco, T0 + 600), 3);
    assert.equal(Lives.count(save, eco, T0 - 7200), 3);
    assert.equal(Lives.secondsToNext(save, eco, T0 - 7200), 600);
    assert.equal(Lives.count(save, eco, T0 - 7200 + 599), 3);
    assert.equal(Lives.count(save, eco, T0 - 7200 + 600), 4);
  });

  it('不扣命的情况与无限生命', () => {
    const [save, eco] = setup();
    assert.ok(!Lives.lose(save, eco, 5, true, T0), '第 5 关以内不扣');
    assert.ok(!Lives.lose(save, eco, 20, false, T0), '一步没动不扣');
    Lives.grantUnlimited(save, 600, T0);
    assert.ok(!Lives.lose(save, eco, 20, true, T0 + 599));
    assert.ok(Lives.isUnlimited(save, T0 + 599));
    assert.ok(!Lives.isUnlimited(save, T0 + 600));
    assert.ok(Lives.lose(save, eco, 20, true, T0 + 600));
    Lives.grantUnlimited(save, 900, T0 + 700);
    Lives.grantUnlimited(save, 900, T0 + 800);
    assert.equal(Lives.unlimitedLeft(save, T0 + 800), 1700, '窗口顺延叠加');
  });

  it('金币买命：400 一条，1500 补满', () => {
    const [save, eco] = setup();
    save.coins = 5000;
    assert.ok(!Lives.buyOne(save, eco, T0), '满命不能买');
    for (let i = 0; i < 3; i++) Lives.lose(save, eco, 10, true, T0);
    assert.ok(Lives.buyOne(save, eco, T0));
    assert.equal(save.coins, 4600);
    assert.equal(Lives.count(save, eco, T0), 3);
    assert.ok(Lives.buyRefill(save, eco, T0));
    assert.equal(save.coins, 3100);
    assert.equal(Lives.count(save, eco, T0), 5);
    save.coins = 100;
    Lives.lose(save, eco, 10, true, T0);
    assert.ok(!Lives.buyOne(save, eco, T0));
    assert.equal(save.coins, 100);
  });

  it('看广告得 1 条，每天 5 次，满命不给', () => {
    const [save, eco] = setup();
    assert.ok(!Lives.claimAd(save, eco, 50, T0), '满命不给');
    for (let i = 0; i < 5; i++) Lives.lose(save, eco, 10, true, T0);
    assert.equal(Lives.adLeft(save, eco, 50), 5);
    for (let i = 0; i < 5; i++) assert.ok(Lives.claimAd(save, eco, 50, T0), `第 ${i + 1} 次`);
    assert.equal(Lives.count(save, eco, T0), 5);
    Lives.lose(save, eco, 10, true, T0);
    assert.ok(!Lives.claimAd(save, eco, 50, T0), '每天 5 次');
    assert.equal(Lives.adLeft(save, eco, 51), 5, '第二天重置');
    assert.ok(Lives.claimAd(save, eco, 51, T0));
  });
});

describe('连败、广告频控、免费金币', () => {
  it('失败降难度', () => {
    const [save, eco] = setup();
    assert.equal(Meta.failLevel(save, eco, 7), 0);
    assert.equal(Meta.failLevel(save, eco, 7), 1);
    Meta.failLevel(save, eco, 7);
    assert.equal(Meta.failLevel(save, eco, 7), 2);
    assert.equal(Meta.easeFor(save, eco, 8), 0);
  });

  it('失败 4 次送第 3 缸位', () => {
    const [save, eco] = setup();
    assert.equal(Meta.openSlotsFor(save, eco, 7, 2), 2);
    for (let i = 0; i < 3; i++) Meta.failLevel(save, eco, 7);
    assert.equal(Meta.openSlotsFor(save, eco, 7, 2), 2);
    Meta.failLevel(save, eco, 7);
    assert.equal(Meta.openSlotsFor(save, eco, 7, 2), 3);
    assert.equal(Meta.openSlotsFor(save, eco, 8, 2), 2);
    assert.equal(Meta.openSlotsFor(save, eco, 7, 4), 4);
  });

  it('插屏频控', () => {
    const [save] = setup();
    const a = ads();
    assert.ok(!Meta.shouldShowInterstitial(save, a, 5, 1000.0));
    assert.ok(Meta.shouldShowInterstitial(save, a, 8, 1000.0));
    Meta.markInterstitial(save, 8, 1000.0);
    assert.ok(!Meta.shouldShowInterstitial(save, a, 9, 2000.0), '至少隔 2 关');
    assert.ok(!Meta.shouldShowInterstitial(save, a, 10, 1050.0), '至少隔 90 秒');
    Meta.markRewarded(save, 1990.0);
    assert.ok(!Meta.shouldShowInterstitial(save, a, 10, 2000.0), '刚看完激励视频则跳过');
  });

  it('商店看广告领金币：300，每天 5 次', () => {
    const [save, eco] = setup();
    for (let i = 0; i < 5; i++) assert.ok(Meta.takeFreeCoin(save, eco, 9));
    assert.ok(!Meta.takeFreeCoin(save, eco, 9));
    assert.equal(save.coins, 1500);
    assert.equal(Meta.freeCoinLeft(save, eco, 10), 5);
  });

  it('第 120 关之后只在后半段循环，挑战关位置对齐', () => {
    assert.equal(Meta.levelFile(1, 120), 1);
    assert.equal(Meta.levelFile(120, 120), 120);
    assert.equal(Meta.levelFile(121, 120), 61);
    assert.equal(Meta.levelFile(180, 120), 120);
    assert.equal(Meta.levelFile(181, 120), 61);
    for (let id = 121; id < 600; id++) {
      const f = Meta.levelFile(id, 120);
      assert.ok(f >= 61 && f <= 120);
      assert.equal(f % 5 === 0, id % 5 === 0);
    }
  });
});

describe('连击（docs/01 3.2）', () => {
  it('4 连起算（4 / 7 / 10 / 15 四档），每次 1/2/3/5 金币，封顶 60，最高连击奖 ×2 封顶 40', () => {
    const cfg = ECO.combo;
    const combo = new Combo();
    const rng = new Rng(1);
    let last = combo.hit(0, cfg, rng);
    for (let i = 1; i < 20; i++) {
      last = combo.hit(i * 0.5, cfg, rng);
      if (i === 2) assert.equal(last.tier, -1, '3 连还不算连击');
      if (i === 3) assert.ok(last.tier_up && last.coins === 1, '4 连进第一档');
      if (i === 6) assert.ok(last.tier_up && last.coins === 2, '7 连进第二档');
    }
    assert.equal(last.tier, 3);
    assert.ok(combo.cardWon, '20 连必送收藏卡');
    assert.equal(combo.coins, 3 * 1 + 3 * 2 + 5 * 3 + 6 * 5);
    assert.equal(combo.bestBonus(cfg), 40);
    assert.equal(combo.hit(100.0, cfg, rng).count, 1, '超时后重新计数');
    const many = new Combo();
    for (let i = 0; i < 60; i++) many.hit(i * 0.5, cfg, rng);
    assert.equal(many.coins, 60, '每关连击金币上限 60');
  });

  it('收藏没开放不送卡', () => {
    const combo = new Combo();
    const rng = new Rng(3);
    for (let i = 0; i < 25; i++) assert.ok(!combo.hit(i * 0.5, ECO.combo, rng, false).card);
    assert.ok(!combo.cardWon);
  });
});

describe('技能与功能开放（docs/01 5.2、5.3）', () => {
  it('解锁送 2 个、每天第一次免费、每关最多 2 次', () => {
    const [save, eco] = setup(1);
    assert.equal(Skills.tryUse(save, eco, 'shuffle', 0, 5).reason, 'locked');
    save.level = 4;
    assert.deepEqual(Skills.syncUnlocks(save, eco), ['shuffle']);
    assert.equal(Skills.count(save, 'shuffle'), 2);
    assert.deepEqual(Skills.syncUnlocks(save, eco), []);
    save.level = 12;
    assert.equal(Skills.syncUnlocks(save, eco).length, 3);
    assert.equal(Skills.count(save, 'current'), 2);
    let r = Skills.tryUse(save, eco, 'shuffle', 0, 5);
    assert.ok(r.ok && r.free);
    assert.equal(Skills.count(save, 'shuffle'), 2);
    r = Skills.tryUse(save, eco, 'shuffle', 1, 5);
    assert.ok(r.ok && !r.free);
    assert.equal(Skills.count(save, 'shuffle'), 1);
    assert.equal(Skills.tryUse(save, eco, 'shuffle', 2, 5).reason, 'limit');
    assert.ok(Skills.tryUse(save, eco, 'shuffle', 0, 6).free, '第二天免费次刷新');
    save.tools.blow = 0;
    Skills.tryUse(save, eco, 'blow', 0, 6);
    assert.equal(Skills.tryUse(save, eco, 'blow', 1, 6).reason, 'empty');
    save.coins = 1200;
    assert.ok(Skills.buy(save, eco, 'current'));
    assert.equal(save.coins, 0);
    for (const [id, p] of [['shuffle', 500], ['blow', 600], ['net', 900], ['current', 1200]] as const) {
      assert.equal(Skills.price(eco, id), p);
    }
  });

  it('开放关表与 docs/01 5.3 一致，没有并列', () => {
    const want: Record<string, number> = {
      signin: 3,
      skill_shuffle: 4,
      levelSelect: 5,
      album: 6,
      skill_blow: 7,
      homeBase: 8,
      skill_net: 9,
      wheel: 10,
      rank: 11,
      skill_current: 12,
      daily: 20,
    };
    assert.deepEqual(ECO.features, want);
    for (const f of Object.keys(want)) {
      assert.ok(!Features.isUnlocked(ECO, f, want[f] - 1));
      assert.ok(Features.isUnlocked(ECO, f, want[f]));
    }
    const levels = Object.values(ECO.features);
    assert.equal(new Set(levels).size, levels.length, '同一关不开两样东西');
    assert.deepEqual(Features.newlyUnlocked(ECO, 2, 8), ['signin', 'skill_shuffle', 'levelSelect', 'album', 'skill_blow', 'homeBase']);
  });
});

describe('结算（docs/01 3.3）', () => {
  it('金币、进度、首胜', () => {
    const [save, eco] = setup(3);
    let r = Settle.win(save, eco, { level: 3, challenge: false, day: 7, now: NOW, combo_coins: 45, best_combo: 15 });
    assert.equal(r.coins_base, 100);
    assert.equal(r.coins_best, 30, '最高连击奖 15 × 2');
    assert.equal(r.coins, 100 + 45 + 30);
    assert.equal(save.coins, r.coins);
    assert.equal(save.level, 4);
    assert.ok(r.first_win && r.wheel_spin);
    assert.equal(save.wheel.extra, 1);
    assert.ok(Lives.isUnlimited(save, NOW + 599) && !Lives.isUnlimited(save, NOW + 600), '首胜无限生命 10 分钟');
    assert.deepEqual(r.new_features, ['skill_shuffle']);
    assert.deepEqual(r.new_skills, ['shuffle']);
    assert.equal(r.stars, 1);
    r = Settle.win(save, eco, { level: 4, challenge: true, day: 7, now: NOW, best_combo: 40 });
    assert.equal(r.coins_base, 200);
    assert.equal(r.coins_best, 40, '最高连击奖封顶 40');
    assert.equal(r.stars, 2, '挑战关 2 颗星');
    assert.ok(!r.first_win);
    assert.equal(save.week.cleared, 2);
    assert.equal(save.base.stars, 3);
  });

  it('重玩每天前 5 次有奖，不给星星，不算本周过关数', () => {
    const [save, eco] = setup(30);
    for (let i = 0; i < 5; i++) {
      const r = Settle.win(save, eco, { level: 10, challenge: false, day: 4, now: NOW });
      assert.ok(r.replay && r.rewarded && r.chest_ok);
      assert.equal(r.coins_base, 100);
      assert.equal(r.stars, 0);
    }
    const r6 = Settle.win(save, eco, { level: 10, challenge: false, day: 4, now: NOW });
    assert.ok(!r6.rewarded && !r6.chest_ok && r6.coins === 0);
    assert.equal(save.level, 30);
    assert.equal(save.week.cleared, 0, '重玩旧关不算本周过关数');
    assert.equal(save.base.stars, 0);
    assert.ok(Settle.win(save, eco, { level: 10, challenge: false, day: 5, now: NOW }).rewarded, '第二天重新计');
  });

  it('看广告翻倍', () => {
    const [save, eco] = setup(3);
    const r = Settle.win(save, eco, { level: 3, challenge: false, day: 7, now: NOW });
    assert.equal(Settle.doubleCoins(save, eco, r), 100);
    assert.equal(save.coins, 200);
  });
});

describe('过关宝箱（docs/01 3.4）', () => {
  it('普通关：金币 35% / 技能 12% / 卡 53%，卡的稀有度按表', () => {
    const rng = new Rng(11);
    const n = 6000;
    const kinds = { coins: 0, skill: 0, card: 0 };
    const rar: Record<string, number> = {};
    let cards = 0;
    let cmin = 999;
    let cmax = 0;
    for (let i = 0; i < n; i++) {
      const [save, eco, species] = setup(20);
      const r = LevelChest.open(save, eco, species, 20, false, rng);
      kinds[r.kind]++;
      if (r.kind === 'coins') {
        cmin = Math.min(cmin, r.coins);
        cmax = Math.max(cmax, r.coins);
      }
      if (r.card !== null) {
        cards++;
        rar[r.card.rarity] = (rar[r.card.rarity] ?? 0) + 1;
      }
    }
    assert.ok(Math.abs(kinds.coins / n - 0.35) < 0.03, JSON.stringify(kinds));
    assert.ok(Math.abs(kinds.skill / n - 0.12) < 0.025, JSON.stringify(kinds));
    assert.ok(Math.abs(kinds.card / n - 0.53) < 0.03, JSON.stringify(kinds));
    assert.ok(cmin >= 30 && cmax <= 80);
    assert.ok(Math.abs(rar.common / cards - 0.7) < 0.04, JSON.stringify(rar));
    assert.ok(Math.abs(rar.uncommon / cards - 0.22) < 0.04, JSON.stringify(rar));
  });

  it('挑战关必出卡，稀有以上翻倍', () => {
    const rng = new Rng(5);
    const n = 6000;
    let rarePlus = 0;
    for (let i = 0; i < n; i++) {
      const [save, eco, species] = setup(110);
      const r = LevelChest.open(save, eco, species, 110, true, rng);
      assert.equal(r.kind, 'card');
      if (Cards.rank(eco, (r.card as { rarity: string }).rarity) >= 2) rarePlus++;
    }
    // 稀有以上 8% → 翻倍后权重 16 / 108 ≈ 14.8%
    assert.ok(Math.abs(rarePlus / n - 0.148) < 0.025, String(rarePlus));
  });

  it('连续 4 关没出卡，第 5 关必出一张没有的', () => {
    const [save, eco, species] = setup(20);
    const open = Album.pool(eco, species, save.level);
    for (let i = 0; i < 5; i++) save.cards[open[i].id] = 1;
    const rng = new Rng(9);
    let dry = 0;
    for (let i = 0; i < 400; i++) {
      const before = Object.keys(save.cards).length;
      const r = LevelChest.open(save, eco, species, 20, false, rng);
      dry = r.kind === 'card' ? 0 : dry + 1;
      assert.ok(dry <= 4);
      if (r.pity) {
        assert.ok(r.card?.is_new);
        assert.equal(Object.keys(save.cards).length, before + 1);
      }
      if (Object.keys(save.cards).length >= open.length) break;
    }
    save.chest.dry = 4;
    assert.equal(LevelChest.open(save, eco, species, 20, false, new Rng(1)).kind, 'card');
  });

  it('广告箱每关一次；技能没解锁时不出技能', () => {
    const [save, eco, species] = setup(2);
    const rng = new Rng(2);
    assert.equal(LevelChest.openAd(save, eco, species, 2, false, rng), null);
    LevelChest.open(save, eco, species, 2, false, rng);
    assert.notEqual(LevelChest.openAd(save, eco, species, 2, false, rng), null);
    assert.equal(LevelChest.openAd(save, eco, species, 2, false, rng), null);
    for (let i = 0; i < 300; i++) assert.notEqual(LevelChest.open(save, eco, species, 3, false, rng).kind, 'skill');
  });

  it('收藏开放前宝箱不出卡', () => {
    const [save, eco, species] = setup(3);
    const rng = new Rng(3);
    for (let i = 0; i < 300; i++) assert.notEqual(LevelChest.open(save, eco, species, 3, i % 5 === 4, rng).kind, 'card');
    assert.equal(Object.keys(save.cards).length, 0);
    save.level = 6;
    save.chest.dry = 0;
    assert.equal(LevelChest.open(save, eco, species, 6, true, rng).kind, 'card');
  });
});

describe('抽奖（docs/01 5.5）', () => {
  it('概率由配置算出，与文档表一致', () => {
    const by = Object.fromEntries(Wheel.odds(ECO).map((o) => [o.id, o.percent]));
    const total = Object.values(by).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 100) < 1e-4);
    const want: Record<string, number> = { coin200: 28, coin500: 14, coin2000: 3, skill: 15, life15: 3, card_common: 20, card_uncommon: 11, card_rare: 4.5, card_epic: 1.3, card_legend: 0.2 };
    for (const [id, p] of Object.entries(want)) assert.ok(Math.abs(by[id] - p) < 1e-3, `${id} ${by[id]}`);
  });

  it('次数来源：每天免费 1、首胜 +1、分享 +1、广告每天 3', () => {
    const [save, eco, species] = setup(30);
    const rng = new Rng(3);
    assert.equal(Wheel.spinsLeft(save, eco, 10), 1);
    assert.notEqual(Wheel.spin(save, eco, species, rng, 10, NOW, 'spin'), null);
    assert.equal(Wheel.spin(save, eco, species, rng, 10, NOW, 'spin'), null);
    assert.equal(Wheel.spin(save, eco, species, rng, 10, NOW, 'coins'), null, '金币不够');
    assert.equal(Wheel.spinsLeft(save, eco, 11), 1);
    assert.ok(Settle.win(save, eco, { level: 29, challenge: false, day: 11, now: NOW }).first_win);
    assert.equal(Wheel.spinsLeft(save, eco, 11), 2);
    assert.notEqual(Share.claim(save, eco, 'wheel', 11, NOW, rng), null);
    assert.equal(Share.claim(save, eco, 'wheel', 11, NOW, rng), null);
    assert.equal(Wheel.spinsLeft(save, eco, 11), 3);
    for (let i = 0; i < 3; i++) assert.ok(Wheel.claimAd(save, eco, 11));
    assert.ok(!Wheel.claimAd(save, eco, 11));
    assert.equal(Wheel.spinsLeft(save, eco, 11), 6);
  });

  it('连续 30 次没出史诗以上，下一次必出', () => {
    const [save, eco, species] = setup(100);
    const rng = new Rng(123);
    save.coins = 100_000_000;
    let dry = 0;
    for (let i = 0; i < 3000; i++) {
      const r = Wheel.spin(save, eco, species, rng, 5, NOW, 'coins');
      const epic = r?.card != null && Cards.rank(eco, r.card.rarity) >= 3;
      dry = epic ? 0 : dry + 1;
      assert.ok(dry <= 30);
    }
    save.wheel.dry = 30;
    const forced = Wheel.spin(save, eco, species, rng, 5, NOW, 'coins');
    assert.ok(forced?.pity && Cards.rank(eco, (forced.card as { rarity: string }).rarity) >= 3);
    assert.equal(save.wheel.dry, 0);
  });

  it('十连 9000，至少一张稀有以上', () => {
    const rng = new Rng(8);
    const [poor, eco, species] = setup(30);
    poor.coins = 8999;
    assert.equal(Wheel.tenPull(poor, eco, species, rng, 5, NOW), null);
    for (let i = 0; i < 300; i++) {
      const [save] = setup(30);
      save.coins = 9000;
      const r = Wheel.tenPull(save, eco, species, rng, 5, NOW);
      assert.ok(r !== null && r.results.length === 10 && save.coins >= 0);
      assert.ok(r.results.some((x) => x.card !== null && Cards.rank(eco, x.card.rarity) >= 2));
    }
  });
});

describe('分享、签到、每日计数（docs/01 5.6、5.8）', () => {
  it('分享次数与奖励', () => {
    const [save, eco] = setup(30);
    const rng = new Rng(1);
    for (let i = 0; i < 5; i++) Lives.lose(save, eco, 20, true, NOW);
    for (let i = 0; i < 3; i++) assert.equal(Share.claim(save, eco, 'life', 9, NOW, rng)?.life, 1);
    assert.equal(Share.claim(save, eco, 'life', 9, NOW, rng), null);
    assert.equal(Lives.count(save, eco, NOW), 3);
    assert.equal(Share.remaining(save, eco, 'life', 10), 3);
    assert.equal(Share.claim(save, eco, 'card', 9, NOW, rng)?.coins, 200);
    assert.notEqual(Share.claim(save, eco, 'help', 9, NOW, rng)?.skill, '');
  });

  it('七日签到', () => {
    const [save, eco, species] = setup(30);
    const rng = new Rng(4);
    assert.equal(SignIn.claim(save, eco, species, rng, 100, NOW)?.coins, 200);
    assert.equal(SignIn.claim(save, eco, species, rng, 100, NOW), null);
    assert.equal(SignIn.claim(save, eco, species, rng, 101, NOW)?.coins, 300);
    const d3 = SignIn.claim(save, eco, species, rng, 102, NOW) as SignIn.SignInResult;
    assert.equal(d3.skills.length + d3.cards.length, 1);
    assert.equal(SignIn.claim(save, eco, species, rng, 103, NOW)?.coins, 500);
    assert.equal(SignIn.claim(save, eco, species, rng, 104, NOW)?.wheel, 1);
    assert.equal(SignIn.claim(save, eco, species, rng, 105, NOW)?.skills.length, 1);
    const before = save.coins;
    const d7 = SignIn.claim(save, eco, species, rng, 110, NOW) as SignIn.SignInResult;
    assert.equal(d7.index, 6, '断签不清零');
    assert.equal(save.coins - before, 1000);
    assert.ok(Cards.rank(eco, d7.cards[0].rarity) >= 2);
    assert.equal(Lives.unlimitedLeft(save, NOW), 1800);
    assert.equal(SignIn.claim(save, eco, species, rng, 111, NOW)?.coins, 200, '7 天一轮');
  });

  it('签到看广告翻倍', () => {
    const [save, eco, species] = setup(30);
    const rng = new Rng(4);
    assert.equal(SignIn.claim(save, eco, species, rng, 100, NOW, true)?.coins, 400);
    const r2 = SignIn.claim(save, eco, species, rng, 101, NOW);
    assert.equal(SignIn.doubleToday(save, eco, species, rng, 101, NOW, r2)?.coins, 600);
    assert.equal(save.coins, 1000);
    assert.equal(SignIn.doubleToday(save, eco, species, rng, 101, NOW, r2), null);
  });

  it('收藏开放前签到里的卡换成金币', () => {
    const [save, eco, species] = setup(3);
    save.signin.count = 6;
    const r = SignIn.claim(save, eco, species, new Rng(8), 50, NOW) as SignIn.SignInResult;
    assert.equal(r.cards.length, 0);
    assert.ok(r.coins - 1000 >= eco.dupeCoins.rare);
    assert.equal(Object.keys(save.cards).length, 0);
  });

  it('跨天清零每日计数，跨周清零本周过关数', () => {
    const [save, eco] = setup(30);
    Skills.tryUse(save, eco, 'shuffle', 0, 3);
    save.daily.replay = 4;
    save.daily.share.wheel = 1;
    Daily.roll(save, 3);
    assert.equal(save.daily.replay, 4);
    Daily.roll(save, 4);
    assert.equal(save.daily.replay, 0);
    assert.deepEqual(save.daily.toolFree, {});
    assert.equal(save.daily.share.wheel, 0);
    save.week.cleared = 9;
    save.week.claimed = [0];
    Daily.roll(save, 4 + 7);
    assert.equal(save.week.cleared, 0);
    assert.deepEqual(save.week.claimed, []);
  });
});

describe('每日挑战（docs/01 5.11）', () => {
  it('当天打哪一关', () => {
    for (let day = 20000; day < 20040; day++) {
      for (const lv of [20, 37, 120, 300]) {
        const id = DailyChallenge.levelFor(day, lv, 5, 120);
        assert.ok(id % 5 === 0 && id >= 5 && id <= Math.min(lv, 120));
      }
    }
    assert.equal(DailyChallenge.levelFor(20001, 60, 5, 120), DailyChallenge.levelFor(20001, 61, 5, 120));
    assert.equal(ECO.dailyChallenge.levelStep, curve().cycle);
  });

  it('进场、每日宝箱 300 金币 + 随机技能 1 个 + 卡、七日大宝箱', () => {
    const [save, eco, species] = setup(20);
    assert.ok(DailyChallenge.enter(save, eco, 100, 'free'));
    assert.ok(!DailyChallenge.enter(save, eco, 100, 'free'));
    assert.ok(!DailyChallenge.enter(save, eco, 100, 'coins'));
    save.coins = 300;
    assert.ok(DailyChallenge.enter(save, eco, 100, 'coins'));
    assert.equal(save.coins, 0);
    const toolsBefore = Object.values(save.tools).reduce((a, b) => a + b, 0);
    const r = DailyChallenge.win(save, eco, species, 100, 0, new Rng(1));
    assert.equal(save.coins, 300);
    assert.equal(r.prizes.filter((p) => p.kind === 'skill').length, 1, '随机技能 1 个');
    assert.equal(Object.values(save.tools).reduce((a, b) => a + b, 0), toolsBefore + 1);
    assert.equal(r.prizes[r.prizes.length - 1].kind, 'card');
    assert.ok(!r.big);
    assert.deepEqual(DailyChallenge.win(save, eco, species, 100, 0, new Rng(1)).prizes, []);
    assert.ok(!DailyChallenge.enter(save, eco, 100, 'ad'));
    for (let day = 101; day < 106; day++) DailyChallenge.win(save, eco, species, day, 0, new Rng(day));
    assert.equal(DailyChallenge.streak(save, 105), 6);
    const coins = save.coins;
    const big = DailyChallenge.win(save, eco, species, 106, 0, new Rng(7));
    assert.ok(big.big);
    assert.equal(save.coins - coins, 300 + 1500 + big.prizes.filter((p) => p.kind === 'card').reduce((a, p) => a + (p.dupe_coins ?? 0), 0));
    assert.ok(Lives.isUnlimited(save, 3599) && !Lives.isUnlimited(save, 3600 + 600), '七日大宝箱 1 小时无限生命');
    assert.equal(DailyChallenge.streak(save, 106), 0);
    DailyChallenge.win(save, eco, species, 107, 0, new Rng(8));
    assert.equal(DailyChallenge.streak(save, 109), 0, '断一天清零');
  });

  it('连击金币单列；免费次走了第一步才记', () => {
    const [save, eco, species] = setup(20);
    assert.ok(DailyChallenge.canStartFree(save, 100));
    assert.equal(DailyChallenge.tries(save, 100), 0);
    const r = DailyChallenge.win(save, eco, species, 100, 0, new Rng(1), 50);
    assert.equal(r.prizes.filter((p) => p.combo === true).length, 1);
    assert.ok(!DailyChallenge.canStartFree(save, 100), '过关后当天不能再进');
    const [s2] = setup(20);
    assert.ok(DailyChallenge.enter(s2, eco, 100, 'free'));
    assert.ok(!DailyChallenge.canStartFree(s2, 100));
  });
});

describe('收藏与救援记录（docs/01 5.0、5.4）', () => {
  it('第 6 关只出第一册，开放一册多 10 张', () => {
    assert.equal(Album.pool(ECO, SPECIES, 6).length, 10);
    assert.equal(Album.pool(ECO, SPECIES, 1).length, 10, '开放前按第一册算');
    assert.equal(Album.pool(ECO, SPECIES, 20).length, 20);
    assert.equal(Album.pool(ECO, SPECIES, 100).length, 60);
  });

  it('前期抽到传说给史诗（传说只在海底宫殿）', () => {
    const [save] = setup(20);
    for (let i = 0; i < 50; i++) {
      const c = Cards.pick(save, Album.pool(ECO, SPECIES, 20), 'legend', new Rng(i));
      assert.equal(c.rarity, 'epic');
    }
  });

  it('领册子大奖与终极大奖（5000 + 每种技能 3 + 3 小时 + 头像框）', () => {
    const [save, eco, species] = setup(6);
    assert.deepEqual(Album.claim(save, eco, 0, 0), []);
    for (const id of Album.books(eco)[0].cards) save.cards[id] = 1;
    assert.equal(Album.claimable(save, eco), 1);
    const got = Album.claim(save, eco, 0, 0);
    assert.deepEqual(got[0], { kind: 'coin', amount: 1000 });
    assert.equal(save.tools.net, 1);
    assert.deepEqual(Album.claim(save, eco, 0, 0), []);
    for (const sp of species) save.cards[sp.id] = 1;
    assert.equal(Album.claimable(save, eco), 1, '没到开放关的册子不能领，只有终极大奖');
    const fin = Album.claimFinal(save, eco, 100);
    assert.deepEqual(fin[fin.length - 1], { kind: 'frame', amount: 1 });
    assert.ok(Album.hasFrame(save));
    assert.equal(save.coins, 6000);
    assert.equal(save.tools.net, 4);
    assert.equal(Lives.unlimitedLeft(save, 100), 10800);
    assert.ok(!Album.canClaimFinal(save, eco));
  });

  it('救援记录：30 / 100 / 300 只各领 50 / 100 / 300', () => {
    const [save, eco] = setup();
    Dex.record(save, { c01: 29 });
    assert.ok(!Dex.canClaim(save, eco, 'c01'));
    Dex.record(save, { c01: 80, c02: 3 });
    assert.equal(Dex.count(save, 'c01'), 109);
    assert.equal(Dex.claimable(save, eco), 1);
    assert.equal(Dex.claim(save, eco, 'c01'), 50);
    assert.equal(Dex.claim(save, eco, 'c01'), 100);
    assert.equal(Dex.claim(save, eco, 'c01'), 0);
    assert.equal(Dex.nextNeed(save, eco, 'c01'), 300);
    assert.equal(save.coins, 150);
  });

  it('只算首次通关和每日挑战', () => {
    const [save] = setup(30);
    assert.ok(Dex.countsWin(save, 30, false));
    assert.ok(!Dex.countsWin(save, 12, false));
    assert.ok(Dex.countsWin(save, 15, true));
  });
});

describe('排行榜展示', () => {
  it('自己插进榜单，同分在前，不改传入的榜单', () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ name: String(i), score: 100 - i * 5 }));
    assert.equal(WeeklyRank.rankOf(rows, 200), 1);
    assert.equal(WeeklyRank.rankOf(rows, 100), 1);
    assert.equal(WeeklyRank.rankOf(rows, 99), 2);
    assert.equal(WeeklyRank.rankOf(rows, 1), 13);
    const sorted = WeeklyRank.sorted(rows, { name: 'me', score: 90 });
    assert.equal(sorted.length, 13);
    assert.ok(sorted[2].me);
    assert.ok(!rows.some((r) => 'me' in r));
  });
});

describe('头像换成收藏生物（docs/01 5.9）', () => {
  it('只能选已拥有的卡，空串恢复平台头像', () => {
    const save = PlayerData.create(ECO);
    assert.equal(PlayerData.setAvatar(save, 'c01'), false);
    assert.equal(PlayerData.avatarOf(save), '');
    save.cards.c01 = 1;
    assert.equal(PlayerData.setAvatar(save, 'c01'), true);
    assert.equal(PlayerData.avatarOf(save), 'c01');
    assert.equal(PlayerData.setAvatar(save, ''), true);
    assert.equal(PlayerData.avatarOf(save), '');
  });
});
