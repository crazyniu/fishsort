// 家园「重建海湾」，见 docs/01 第 5.12 节。6 个区域，一个区域一个海域，按顺序建；每个区域 5 步，
// 每步花星星和金币。建完一个区域当场开区域宝箱；下一个区域要到开放关才能开始。
// 星星：首次通过一关得 1 颗，挑战关 2 颗（Settle 发），重玩和每日挑战不给。
// 数值在 economy.json 的 homeBase。存档 save.base = { stars, built: [每个区域建了几步] }。
import type { Area, EconomyConfig } from '../config';
import { idiv } from '../util';
import * as Album from './album';
import type { Prize, SaveData } from './save';

export function fresh(): SaveData['base'] {
  return { stars: 0, built: [] };
}

export function areas(eco: EconomyConfig): Area[] {
  return eco.homeBase.areas;
}

export function areaCount(eco: EconomyConfig): number {
  return areas(eco).length;
}

export function stepCount(eco: EconomyConfig, area: number): number {
  return areas(eco)[area].steps.length;
}

export function stars(save: SaveData): number {
  return save.base.stars;
}

/** 首次通过一关该发几颗星：普通关 1，挑战关 2 */
export function starsForLevel(eco: EconomyConfig, challenge: boolean): number {
  const cfg = eco.homeBase.stars;
  return challenge ? cfg.challenge : cfg.level;
}

export function addStars(save: SaveData, n: number): void {
  save.base.stars = stars(save) + n;
}

/** 首次通过第 1 … cleared 关一共能拿几颗星：每关 1 颗，其中每 challengeEvery 关一个挑战关再多 1 颗（锁页和数值核对用） */
export function starsThrough(eco: EconomyConfig, cleared: number): number {
  if (cleared <= 0) return 0;
  const cfg = eco.homeBase.stars;
  const hard = idiv(cleared, cfg.challengeEvery);
  return (cleared - hard) * cfg.level + hard * cfg.challenge;
}

/** 这个区域已经建了几步 */
export function built(save: SaveData, area: number): number {
  const arr = save.base.built;
  return area < arr.length ? arr[area] : 0;
}

export function isComplete(save: SaveData, eco: EconomyConfig, area: number): boolean {
  return built(save, area) >= stepCount(eco, area);
}

export function unlockLevel(eco: EconomyConfig, area: number): number {
  return areas(eco)[area].unlock;
}

export function isOpen(eco: EconomyConfig, area: number, level: number): boolean {
  return level >= unlockLevel(eco, area);
}

/** 正在建的区域：第一个没建完的；全部建完返回 areaCount */
export function currentArea(save: SaveData, eco: EconomyConfig): number {
  for (let i = 0; i < areaCount(eco); i++) if (!isComplete(save, eco, i)) return i;
  return areaCount(eco);
}

export function allDone(save: SaveData, eco: EconomyConfig): boolean {
  return currentArea(save, eco) >= areaCount(eco);
}

/** 当前区域下一步的花费；全部建完返回 null */
export function nextCost(save: SaveData, eco: EconomyConfig): { stars: number; coins: number } | null {
  const area = currentArea(save, eco);
  if (area >= areaCount(eco)) return null;
  const step = areas(eco)[area].steps[built(save, area)];
  return { stars: step[0], coins: step[1] };
}

export type BuildBlock = '' | 'done' | 'locked' | 'stars' | 'coins';

/** 能不能建下一步。返回 "" 表示可以，否则是原因 */
export function check(save: SaveData, eco: EconomyConfig): BuildBlock {
  const area = currentArea(save, eco);
  if (area >= areaCount(eco)) return 'done';
  if (!isOpen(eco, area, save.level)) return 'locked';
  const cost = nextCost(save, eco) as { stars: number; coins: number };
  if (stars(save) < cost.stars) return 'stars';
  if (save.coins < cost.coins) return 'coins';
  return '';
}

export function canBuild(save: SaveData, eco: EconomyConfig): boolean {
  return check(save, eco) === '';
}

export interface BuildResult {
  ok: boolean;
  reason: BuildBlock;
  area: number;
  /** 刚建好的是第几步，0 起 */
  step: number;
  completed: boolean;
  /** 区域宝箱的奖品 */
  prizes: Prize[];
}

/** 建下一步：扣星星和金币，步数 +1；这一步建完了区域就当场发区域宝箱 */
export function build(save: SaveData, eco: EconomyConfig, now: number): BuildResult {
  const reason = check(save, eco);
  const res: BuildResult = { ok: false, reason, area: -1, step: -1, completed: false, prizes: [] };
  if (reason !== '') return res;
  const area = currentArea(save, eco);
  const cost = nextCost(save, eco) as { stars: number; coins: number };
  save.base.stars = stars(save) - cost.stars;
  save.coins -= cost.coins;
  const arr = save.base.built;
  while (arr.length <= area) arr.push(0);
  arr[area] += 1;
  res.ok = true;
  res.area = area;
  res.step = arr[area] - 1;
  if (isComplete(save, eco, area)) {
    res.completed = true;
    res.prizes = Album.grant(save, areas(eco)[area].reward, now);
  }
  return res;
}

/** 整个家园一共要花多少金币、多少星星（文档核对与锁页展示用） */
export function totalCost(eco: EconomyConfig): { stars: number; coins: number } {
  let s = 0;
  let c = 0;
  for (const a of areas(eco)) {
    for (const step of a.steps) {
      s += step[0];
      c += step[1];
    }
  }
  return { stars: s, coins: c };
}
