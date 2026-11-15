// 抽奖（宝箱抽奖页），见 docs/01 第 5.5 节。存档 save.wheel = { extra, dry, total }：
// extra 存下来的额外次数，dry 是连续没出史诗以上的次数；每日计数在 save.daily 的 wheelFree / wheelAd 与 share.wheel。
import type { EconomyConfig, Species, WheelPrize } from '../config';
import type { Rng } from '../rng/rng';
import * as Album from './album';
import * as Cards from './cards';
import * as Daily from './daily';
import * as Lives from './lives';
import * as Skills from './skills';
import type { CardResult, SaveData } from './save';

export interface SpinResult {
  prize: string;
  kind: WheelPrize['kind'];
  card: CardResult | null;
  coins: number;
  skill: string;
  unlimited: number;
  pity: boolean;
}

export function fresh(): SaveData['wheel'] {
  return { extra: 0, dry: 0, total: 0 };
}

/** 概率：[{ id, kind, rarity, amount, percent }]，percent 由权重归一化得到，总和 100（页面上不展示，审核要求时放设置页） */
export function odds(eco: EconomyConfig): { id: string; kind: string; rarity: string; amount: number; percent: number }[] {
  const prizes = eco.wheel.prizes;
  let total = 0.0;
  for (const p of prizes) total += p.weight;
  return prizes.map((p) => ({
    id: p.id,
    kind: p.kind,
    rarity: p.rarity ?? '',
    amount: Math.trunc(p.amount ?? 0),
    percent: (p.weight / total) * 100.0,
  }));
}

/** 当天还能用的次数（免费 + 存下来的） */
export function spinsLeft(save: SaveData, eco: EconomyConfig, day: number): number {
  Daily.roll(save, day);
  return freeLeft(save, eco, day) + save.wheel.extra;
}

export function freeLeft(save: SaveData, eco: EconomyConfig, day: number): number {
  Daily.roll(save, day);
  return Math.max(eco.wheel.freePerDay - save.daily.wheelFree, 0);
}

export function adLeft(save: SaveData, eco: EconomyConfig, day: number): number {
  Daily.roll(save, day);
  return Math.max(eco.wheel.adPerDay - save.daily.wheelAd, 0);
}

/** 加抽奖次数（首胜、签到等） */
export function addSpins(save: SaveData, n = 1): void {
  save.wheel.extra += n;
}

/** 看完广告 +1 次。每天上限见 wheel.adPerDay，用完返回 false */
export function claimAd(save: SaveData, eco: EconomyConfig, day: number): boolean {
  if (adLeft(save, eco, day) <= 0) return false;
  save.daily.wheelAd += 1;
  addSpins(save);
  return true;
}

/**
 * 抽一次。pay: "spin" 先用每日免费再用存下来的次数；"coins" 花金币。
 * 没有次数 / 金币不够返回 null
 */
export function spin(
  save: SaveData,
  eco: EconomyConfig,
  species: Species[],
  rng: Rng,
  day: number,
  now: number,
  pay: 'spin' | 'coins',
): SpinResult | null {
  Daily.roll(save, day);
  if (pay === 'coins') {
    const cost = eco.wheel.coinCost;
    if (save.coins < cost) return null;
    save.coins -= cost;
  } else if (freeLeft(save, eco, day) > 0) {
    save.daily.wheelFree += 1;
  } else if (save.wheel.extra > 0) {
    save.wheel.extra -= 1;
  } else {
    return null;
  }
  return draw(save, eco, species, rng, now, '');
}

/** 十连，花金币。保底至少 1 张稀有以上。金币不够返回 null */
export function tenPull(
  save: SaveData,
  eco: EconomyConfig,
  species: Species[],
  rng: Rng,
  day: number,
  now: number,
): { results: SpinResult[] } | null {
  Daily.roll(save, day);
  const cost = eco.wheel.tenCost;
  if (save.coins < cost) return null;
  save.coins -= cost;
  const n = eco.wheel.tenCount;
  const minRank = Cards.rank(eco, eco.wheel.tenMinRarity);
  const results: SpinResult[] = [];
  let hasGood = false;
  for (let i = 0; i < n; i++) {
    let force = '';
    if (i === n - 1 && !hasGood) force = eco.wheel.tenMinRarity;
    const r = draw(save, eco, species, rng, now, force);
    if (r.card !== null && Cards.rank(eco, r.card.rarity) >= minRank) hasGood = true;
    results.push(r);
  }
  return { results };
}

/** 单次抽取。force 非空时只在该稀有度及以上的卡片奖里抽（保底） */
function draw(save: SaveData, eco: EconomyConfig, species: Species[], rng: Rng, now: number, force: string): SpinResult {
  const w = save.wheel;
  const pity = w.dry >= eco.wheel.pityAfter;
  if (pity) force = eco.wheel.pityMinRarity;
  const prize = pickPrize(eco, rng, force);
  const res: SpinResult = { prize: prize.id, kind: prize.kind, card: null, coins: 0, skill: '', unlimited: 0, pity };
  switch (prize.kind) {
    case 'coins':
      save.coins += Math.trunc(prize.amount ?? 0);
      res.coins = Math.trunc(prize.amount ?? 0);
      break;
    case 'skill':
      res.skill = Skills.grantRandom(save, eco, rng);
      break;
    case 'unlimited':
      Lives.grantUnlimited(save, Math.trunc(prize.amount ?? 0), now);
      res.unlimited = Math.trunc(prize.amount ?? 0);
      break;
    case 'card': {
      const card = Cards.pick(save, Album.pool(eco, species, save.level), prize.rarity as string, rng);
      res.card = Cards.give(save, eco, card);
      break;
    }
  }
  const epicRank = Cards.rank(eco, eco.wheel.pityMinRarity);
  const gotEpic = prize.kind === 'card' && Cards.rank(eco, prize.rarity as string) >= epicRank;
  w.dry = gotEpic ? 0 : w.dry + 1;
  w.total += 1;
  return res;
}

function pickPrize(eco: EconomyConfig, rng: Rng, minRarity: string): WheelPrize {
  const minRank = minRarity !== '' ? Cards.rank(eco, minRarity) : -1;
  const pool: WheelPrize[] = [];
  let total = 0.0;
  for (const p of eco.wheel.prizes) {
    if (minRank >= 0 && (p.kind !== 'card' || Cards.rank(eco, p.rarity as string) < minRank)) continue;
    pool.push(p);
    total += p.weight;
  }
  let roll = rng.randf() * total;
  for (const p of pool) {
    roll -= p.weight;
    if (roll < 0.0) return p;
  }
  return pool[pool.length - 1];
}
