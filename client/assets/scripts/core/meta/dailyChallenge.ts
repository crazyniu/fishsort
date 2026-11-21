// 每日挑战，见 docs/01 第 5.11 节。每天一关：从已经校验过的挑战关里按日期挑，不现场生成。
// 日期序号由调用方传入，核心层不读时钟。配置在 economy.json 的 dailyChallenge。
import type { EconomyConfig, Species } from '../config';
import type { Rng } from '../rng/rng';
import { clampi, idiv, posmod } from '../util';
import * as Album from './album';
import * as Cards from './cards';
import * as Tasks from './tasks';
import type { Prize, SaveData } from './save';

export function fresh(): SaveData['challenge'] {
  return { wonDay: -1, streak: 0, tryDay: -1, tries: 0 };
}

/**
 * 当天打哪一关：玩家打到过的挑战关里按日期轮换，同进度的玩家同一天是同一关。
 * cycle 是每几关一个挑战关，levelCount 是关卡总数
 */
export function levelFor(day: number, playerLevel: number, cycle: number, levelCount: number): number {
  const top = idiv(clampi(playerLevel, cycle, levelCount), cycle);
  // 只在最难的后一半里轮换，前面的太容易
  const from = Math.max(1, idiv(top + 1, 2));
  const n = top - from + 1;
  // 每天往后跳 7 个；候选数是 7 的倍数时跳 7 只能走到一部分（7 个候选就天天同一关），换一个和它互质的步长（#170）
  let step = 7;
  while (gcd(step, n) !== 1) step++;
  return (from + posmod(day * step + 3, n)) * cycle;
}

function gcd(a: number, b: number): number {
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

export function wonToday(save: SaveData, day: number): boolean {
  return save.challenge.wonDay === day;
}

/** 连续过关天数；昨天和今天都没过就断了 */
export function streak(save: SaveData, day: number): number {
  const c = save.challenge;
  return c.wonDay >= day - 1 ? c.streak : 0;
}

/** 今天已经进过几次 */
export function tries(save: SaveData, day: number): number {
  const c = save.challenge;
  return c.tryDay === day ? c.tries : 0;
}

/** 每天第一次免费，之后要看广告或花金币 */
export function isFree(save: SaveData, day: number): boolean {
  return tries(save, day) === 0;
}

/**
 * 能不能免费开始。免费的这一次进场时不记次数，局内走了第一步才调 enter(..., "free") 记上；
 * 进来不走直接退出不算
 */
export function canStartFree(save: SaveData, day: number): boolean {
  return !wonToday(save, day) && isFree(save, day);
}

/** 进场。pay: "free"（当天第一次）、"ad"（界面已看完广告）、"coins"。进不了返回 false */
export function enter(save: SaveData, eco: EconomyConfig, day: number, pay: 'free' | 'ad' | 'coins'): boolean {
  if (wonToday(save, day)) return false;
  if (pay === 'free' && !isFree(save, day)) return false;
  if (pay === 'coins') {
    const price = eco.dailyChallenge.retryCoins;
    if (save.coins < price) return false;
    save.coins -= price;
  }
  const c = save.challenge;
  c.tries = tries(save, day) + 1;
  c.tryDay = day;
  return true;
}

/**
 * 过关：开每日宝箱；连续天数到了再开七日大宝箱（之后从头数）。comboCoins 是本关连击金币，一起入账。
 * 今天已经领过返回空 prizes
 */
export function win(
  save: SaveData,
  eco: EconomyConfig,
  species: Species[],
  day: number,
  now: number,
  rng: Rng,
  comboCoins = 0,
  taskDay = day,
): { prizes: Prize[]; big: boolean } {
  // day = 挑战日（开局那天，过关记在它头上）；taskDay = 今天：每日任务、周进度按今天记。
  // 跨零点过关时两者不同，任务要是按挑战日记会把今天的任务和周进度重置回昨天（#170）
  if (wonToday(save, day)) return { prizes: [], big: false };
  const cfg = eco.dailyChallenge;
  const c = save.challenge;
  c.streak = streak(save, day) + 1;
  c.wonDay = day;
  Tasks.add(save, eco, taskDay, 'win');
  Tasks.add(save, eco, taskDay, 'daily');
  const prizes = Album.grant(save, cfg.reward, now, eco, rng);
  const rarity = Cards.rollRarity(eco, eco.chest.cardRates, rng);
  const open = Album.pool(eco, species, save.level);
  const card = Cards.give(save, eco, Cards.pick(save, open, rarity, rng, true));
  prizes.push({ kind: 'card', card_id: card.id, rarity: card.rarity, is_new: card.is_new, dupe_coins: card.coins });
  if (comboCoins > 0) {
    save.coins += comboCoins;
    prizes.push({ kind: 'coin', amount: comboCoins, combo: true });
  }
  const big = c.streak >= cfg.streakDays;
  if (big) {
    c.streak = 0;
    prizes.push(...Album.grant(save, cfg.streakReward, now, eco, rng));
  }
  return { prizes, big };
}
