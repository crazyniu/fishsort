// 四个技能：洗牌 shuffle、吹泡 blow、渔网 net、洋流 current。见 docs/01 第 5.2 节。
// 存档：save.tools[id] 库存；save.skillsGranted[id] 是否已发过解锁礼；save.daily.toolFree[id] 今天是否已用过免费次。
import type { EconomyConfig } from '../config';
import type { Rng } from '../rng/rng';
import * as Daily from './daily';
import * as Features from './features';
import * as Tasks from './tasks';
import type { SaveData } from './save';

export function ids(eco: EconomyConfig): string[] {
  return eco.skills.order;
}

export function unlockLevel(eco: EconomyConfig, id: string): number {
  return Features.unlockLevel(eco, 'skill_' + id);
}

export function isUnlocked(eco: EconomyConfig, id: string, level: number): boolean {
  return Features.isUnlocked(eco, 'skill_' + id, level);
}

export function unlockedIds(eco: EconomyConfig, level: number): string[] {
  return ids(eco).filter((id) => isUnlocked(eco, id, level));
}

export function count(save: SaveData, id: string): number {
  return Math.trunc(save.tools[id] ?? 0);
}

export function add(save: SaveData, id: string, n = 1): void {
  save.tools[id] = count(save, id) + n;
}

export function price(eco: EconomyConfig, id: string): number {
  return Math.trunc(eco.toolPrice[id]);
}

/** 到了解锁关的技能发 2 个（只发一次）。返回这次新发的技能 id 列表。每次进度变化后调用 */
export function syncUnlocks(save: SaveData, eco: EconomyConfig): string[] {
  const out: string[] = [];
  const granted = save.skillsGranted;
  for (const id of ids(eco)) {
    if (isUnlocked(eco, id, save.level) && !(id in granted)) {
      granted[id] = true;
      add(save, id, eco.skills.grantOnUnlock);
      out.push(id);
    }
  }
  return out;
}

/**
 * 今天这个技能还有没有免费次。
 * - 配了 `skills.freeDaily`（2026-11-18）：每天的免费次**不分种类**，一共这么多次。原来是每种每天各免费一次，一天 4 个，
 *   玩家一天要用的道具基本不用花金币（docs/01 6.3）
 * - 没配（Godot 版导出的黄金数据）：每种每天各一次
 */
export function freeAvailable(save: SaveData, id: string, eco?: EconomyConfig): boolean {
  const total = eco?.skills.freeDaily;
  if (total === undefined) return !(id in save.daily.toolFree);
  return Object.keys(save.daily.toolFree).length < total;
}

/**
 * 这一关的「第一次用技能免费」还在不在（用户 2026-11-18：前面的关卡金币不够，玩不下去）：
 * 第 1 关到 skills.freeLevelUntil 关，每关第一次用技能（不分种类）不扣库存、不记每天的免费次。
 * usedAllThisLevel 是本关各种技能合计已用几次（界面层记）；levelId 为 0（每日挑战）不送
 */
export function levelFree(eco: EconomyConfig, levelId: number, usedAllThisLevel: number): boolean {
  const until = eco.skills.freeLevelUntil ?? 0;
  return levelId > 0 && levelId <= until && usedAllThisLevel === 0;
}

export interface UseResult {
  ok: boolean;
  free: boolean;
  reason: '' | 'locked' | 'limit' | 'empty';
}

/**
 * 使用前调用。usedThisLevel 是本关已用次数（界面层记）。
 * ok 时已经扣了库存（或记了免费次），界面层随后去调 Rules。
 */
/** 第 levelId 关每种技能最多用几次 */
export function maxPerLevel(eco: EconomyConfig, levelId: number): number {
  const late = eco.toolMaxLate;
  return late && levelId >= late.from ? late.max : eco.toolMaxPerLevel;
}

/** 这个技能现在用得了吗（不扣库存、不记任务，界面层提醒用道具时先问一下）：'' = 能用，其余同 tryUse 的 reason */
export function canUse(save: SaveData, eco: EconomyConfig, id: string, usedThisLevel: number, levelId = 0, usedAllThisLevel = -1): UseResult['reason'] {
  if (!isUnlocked(eco, id, save.level)) return 'locked';
  if (usedThisLevel >= maxPerLevel(eco, levelId)) return 'limit';
  if (levelFree(eco, levelId, usedAllThisLevel)) return '';
  if (!freeAvailable(save, id, eco) && count(save, id) <= 0) return 'empty';
  return '';
}

export function tryUse(save: SaveData, eco: EconomyConfig, id: string, usedThisLevel: number, day: number, levelId = 0, usedAllThisLevel = -1): UseResult {
  Daily.roll(save, day);
  if (!isUnlocked(eco, id, save.level)) return { ok: false, free: false, reason: 'locked' };
  if (usedThisLevel >= maxPerLevel(eco, levelId)) return { ok: false, free: false, reason: 'limit' };
  if (levelFree(eco, levelId, usedAllThisLevel)) {
    Tasks.add(save, eco, day, 'skill');
    return { ok: true, free: true, reason: '' };
  }
  if (!freeAvailable(save, id, eco) && count(save, id) <= 0) return { ok: false, free: false, reason: 'empty' };
  Tasks.add(save, eco, day, 'skill');
  if (freeAvailable(save, id, eco)) {
    // 不分种类时记成「第几次_哪个」：同一种一天用两次免费的也各占一格
    save.daily.toolFree[eco.skills.freeDaily === undefined ? id : `${Object.keys(save.daily.toolFree).length}_${id}`] = true;
    return { ok: true, free: true, reason: '' };
  }
  save.tools[id] = count(save, id) - 1;
  return { ok: true, free: false, reason: '' };
}

/** 金币买 1 个 */
export function buy(save: SaveData, eco: EconomyConfig, id: string): boolean {
  const p = price(eco, id);
  if (save.coins < p) return false;
  save.coins -= p;
  save.tools[id] = count(save, id) + 1;
  return true;
}

/** 随机发一个已解锁的技能（宝箱、抽奖、分享用）；一个都没解锁时返回空串，不发 */
export function grantRandom(save: SaveData, eco: EconomyConfig, rng: Rng): string {
  const pool = unlockedIds(eco, save.level);
  if (pool.length === 0) return '';
  const id = rng.pick(pool);
  add(save, id);
  return id;
}
