// 功能开放关，见 docs/01 第 5.3 节。level 传玩家当前所在关（save.level）。
import type { EconomyConfig } from '../config';

export function unlockLevel(eco: EconomyConfig, feature: string): number {
  return Math.trunc(eco.features[feature]);
}

export function isUnlocked(eco: EconomyConfig, feature: string, level: number): boolean {
  return level >= unlockLevel(eco, feature);
}

/** 从 oldLevel 升到 newLevel 时新开放的功能（按开放关排序），主页解锁动画用 */
export function newlyUnlocked(eco: EconomyConfig, oldLevel: number, newLevel: number): string[] {
  const out: string[] = [];
  for (const f of Object.keys(eco.features)) {
    const at = unlockLevel(eco, f);
    if (at > oldLevel && at <= newLevel) out.push(f);
  }
  out.sort((a, b) => unlockLevel(eco, a) - unlockLevel(eco, b));
  return out;
}
