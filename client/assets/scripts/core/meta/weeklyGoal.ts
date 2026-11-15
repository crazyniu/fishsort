// 每周过关目标，见 docs/01 第 5.9 节（代替旧版「按名次发奖」）。
// 本周首次通过的关卡数到 10 / 25 / 50 各领一档，在排行页顶部领；周一 0 点清零，没领的作废。
// 计数在 save.week.cleared（Settle.win 只在首次通过时 +1），已领的档在 save.week.claimed。
import type { EconomyConfig, WeeklyGoalTier } from '../config';
import type { Rng } from '../rng/rng';
import * as Album from './album';
import * as Daily from './daily';
import * as Features from './features';
import type { Prize, SaveData } from './save';

export function tiers(eco: EconomyConfig): WeeklyGoalTier[] {
  return eco.weeklyGoal?.tiers ?? [];
}

/** 本周已经首次通过了几关 */
export function cleared(save: SaveData, day: number): number {
  Daily.roll(save, day);
  return save.week.cleared;
}

export function isClaimed(save: SaveData, tier: number): boolean {
  return save.week.claimed.includes(tier);
}

export function canClaim(save: SaveData, eco: EconomyConfig, tier: number, day: number): boolean {
  if (!Features.isUnlocked(eco, 'rank', save.level)) return false;
  const t = tiers(eco)[tier];
  return t !== undefined && cleared(save, day) >= t.clears && !isClaimed(save, tier);
}

/** 有几档可以领（排行页签红点） */
export function claimable(save: SaveData, eco: EconomyConfig, day: number): number {
  let n = 0;
  for (let i = 0; i < tiers(eco).length; i++) if (canClaim(save, eco, i, day)) n++;
  return n;
}

/** 领一档。不能领返回空数组 */
export function claim(save: SaveData, eco: EconomyConfig, tier: number, day: number, now: number, rng: Rng): Prize[] {
  if (!canClaim(save, eco, tier, day)) return [];
  save.week.claimed.push(tier);
  return Album.grant(save, tiers(eco)[tier].reward, now, eco, rng);
}
