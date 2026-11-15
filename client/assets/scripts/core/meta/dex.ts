// 救援记录，见 docs/01 第 5.4 节。记录局内救过的每种生物和数量；
// 每种救够几档数量各领一次金币。配置在 economy.json 的 dex。界面上并入收藏卡，没有单独的页面。
import type { EconomyConfig } from '../config';
import type { SaveData } from './save';

export function fresh(): SaveData['dex'] {
  return { seen: {}, claimed: {} };
}

/** 过关时记账。counts: { 生物 id: 这一关救了几只 } */
export function record(save: SaveData, counts: Record<string, number>): void {
  const seen = save.dex.seen;
  for (const id of Object.keys(counts)) seen[id] = (seen[id] ?? 0) + Math.trunc(counts[id]);
}

/**
 * 这次过关算不算进救援记录：只有通过当前进度的关（首次通关）和每日挑战才算，重玩旧关不算。
 * levelId 是刚过的关，在 Settle.win 推进进度之前调用
 */
export function countsWin(save: SaveData, levelId: number, daily: boolean): boolean {
  return daily || levelId === save.level;
}

export function count(save: SaveData, id: string): number {
  return Math.trunc(save.dex.seen[id] ?? 0);
}

/** 已经领到第几档（0 = 还没领过） */
export function claimedTier(save: SaveData, id: string): number {
  return Math.trunc(save.dex.claimed[id] ?? 0);
}

/** 救的数量够到第几档 */
export function reachedTier(save: SaveData, eco: EconomyConfig, id: string): number {
  const n = count(save, id);
  let tier = 0;
  for (const need of eco.dex.tiers) if (n >= need) tier++;
  return tier;
}

export function canClaim(save: SaveData, eco: EconomyConfig, id: string): boolean {
  return reachedTier(save, eco, id) > claimedTier(save, id);
}

/** 下一档要救多少只；全部领完返回 0 */
export function nextNeed(save: SaveData, eco: EconomyConfig, id: string): number {
  const tiers = eco.dex.tiers;
  const at = claimedTier(save, id);
  return at < tiers.length ? tiers[at] : 0;
}

/** 领下一档的金币，返回金币数；不能领返回 0 */
export function claim(save: SaveData, eco: EconomyConfig, id: string): number {
  if (!canClaim(save, eco, id)) return 0;
  const at = claimedTier(save, id);
  const coins = eco.dex.coins[at];
  save.dex.claimed[id] = at + 1;
  save.coins += coins;
  return coins;
}

/** 有几种生物有奖可领（收藏页签红点的一部分） */
export function claimable(save: SaveData, eco: EconomyConfig): number {
  let n = 0;
  for (const id of Object.keys(save.dex.seen)) if (canClaim(save, eco, id)) n++;
  return n;
}
