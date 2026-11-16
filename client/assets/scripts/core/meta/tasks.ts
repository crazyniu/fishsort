// 任务中心，见 docs/01 第 5.9 节（代替旧版排行页上的「每周过关目标」）。
// 每天从池子里定几项任务，做完自动记积分；积分只推进度条，到档开宝箱，不是货币。
// 每日积分封顶后同时累计成本周积分。日期序号由调用方传入，核心层不读时钟。配置在 economy.json 的 tasks。
import type { EconomyConfig, Species, TaskDef, TaskTier, TasksConfig } from '../config';
import { Rng } from '../rng/rng';
import * as Album from './album';
import * as Cards from './cards';
import * as Daily from './daily';
import * as Features from './features';
import type { Prize, SaveData, TasksSave } from './save';

export type Scope = 'day' | 'week';

export function fresh(): TasksSave {
  return { day: -1, ids: [], prog: {}, claimed: [] };
}

function cfg(eco: EconomyConfig): TasksConfig | null {
  return eco.tasks ?? null;
}

export function def(eco: EconomyConfig, id: string): TaskDef | undefined {
  return cfg(eco)?.pool.find((t) => t.id === id);
}

/**
 * 某天、某个进度的任务表：固定的几项 + 按日期随机抽的几项，只抽已开放功能的。
 * 同一天同进度的玩家抽到的一样
 */
export function pick(eco: EconomyConfig, day: number, level: number): string[] {
  const c = cfg(eco);
  if (c === null) return [];
  const open = c.pool.filter((t) => t.feature === undefined || Features.isUnlocked(eco, t.feature, level));
  const out = open.filter((t) => c.fixed.includes(t.id)).map((t) => t.id);
  const rest = open.filter((t) => !c.fixed.includes(t.id)).map((t) => t.id);
  new Rng(day * 2654435761 + 97).shuffle(rest);
  return out.concat(rest.slice(0, c.random));
}

/** 跨天换一批任务、清进度。所有任务功能进来先调它 */
export function sync(save: SaveData, eco: EconomyConfig, day: number): void {
  Daily.roll(save, day);
  if (cfg(eco) === null || save.tasks.day === day) return;
  save.tasks = { day, ids: pick(eco, day, save.level), prog: {}, claimed: [] };
}

/** 今天的任务（按任务表的顺序） */
export function list(save: SaveData, eco: EconomyConfig, day: number): TaskDef[] {
  sync(save, eco, day);
  const out: TaskDef[] = [];
  for (const id of save.tasks.ids) {
    const d = def(eco, id);
    if (d) out.push(d);
  }
  return out;
}

export function progress(save: SaveData, eco: EconomyConfig, id: string, day: number): number {
  sync(save, eco, day);
  const d = def(eco, id);
  return Math.min(Math.trunc(save.tasks.prog[id] ?? 0), d ? d.goal : 0);
}

export function isDone(save: SaveData, eco: EconomyConfig, id: string, day: number): boolean {
  const d = def(eco, id);
  return d !== undefined && save.tasks.ids.includes(id) && progress(save, eco, id, day) >= d.goal;
}

/** 今天的积分：做完的任务积分之和，封顶 dayMax */
export function dayPoints(save: SaveData, eco: EconomyConfig, day: number): number {
  const c = cfg(eco);
  if (c === null) return 0;
  let sum = 0;
  for (const t of list(save, eco, day)) if (isDone(save, eco, t.id, day)) sum += t.points;
  return Math.min(sum, c.dayMax);
}

export function weekPoints(save: SaveData, eco: EconomyConfig, day: number): number {
  sync(save, eco, day);
  return save.week.points;
}

/** 本周积分最多能到多少（进度条满格） */
export function weekMax(eco: EconomyConfig): number {
  return (cfg(eco)?.dayMax ?? 0) * Daily.WEEK_DAYS;
}

/**
 * 记一次任务进度：n 是这次做了几个（mode 为 max 的任务传单次的值，如本局最高连击）。
 * 今天没有这项任务就不记。返回今天积分涨了多少（已同步加进本周积分）
 */
export function add(save: SaveData, eco: EconomyConfig, day: number, id: string, n = 1): number {
  if (cfg(eco) === null) return 0;
  sync(save, eco, day);
  const d = def(eco, id);
  if (d === undefined || !save.tasks.ids.includes(id) || n <= 0) return 0;
  const before = dayPoints(save, eco, day);
  const prog = save.tasks.prog;
  const cur = Math.trunc(prog[id] ?? 0);
  prog[id] = Math.min(d.goal, d.mode === 'max' ? Math.max(cur, Math.trunc(n)) : cur + Math.trunc(n));
  const gained = dayPoints(save, eco, day) - before;
  save.week.points += gained;
  return gained;
}

export function tiers(eco: EconomyConfig, scope: Scope): TaskTier[] {
  const c = cfg(eco);
  if (c === null) return [];
  return scope === 'day' ? c.dayTiers : c.weekTiers;
}

function claimedList(save: SaveData, scope: Scope): number[] {
  return scope === 'day' ? save.tasks.claimed : save.week.taskClaimed;
}

export function isClaimed(save: SaveData, eco: EconomyConfig, scope: Scope, tier: number, day: number): boolean {
  sync(save, eco, day);
  return claimedList(save, scope).includes(tier);
}

export function canClaim(save: SaveData, eco: EconomyConfig, scope: Scope, tier: number, day: number): boolean {
  if (!Features.isUnlocked(eco, 'tasks', save.level)) return false;
  const t = tiers(eco, scope)[tier];
  if (t === undefined || isClaimed(save, eco, scope, tier, day)) return false;
  const points = scope === 'day' ? dayPoints(save, eco, day) : weekPoints(save, eco, day);
  return points >= t.points;
}

/** 有几档宝箱可以领（任务页签红点） */
export function claimable(save: SaveData, eco: EconomyConfig, day: number): number {
  let n = 0;
  for (const scope of ['day', 'week'] as const) {
    for (let i = 0; i < tiers(eco, scope).length; i++) if (canClaim(save, eco, scope, i, day)) n++;
  }
  return n;
}

/** 领一档宝箱：先发奖励，再发卡（只出已开放册子里的，重复卡自动换金币）。不能领返回空数组 */
export function claim(
  save: SaveData,
  eco: EconomyConfig,
  species: Species[],
  scope: Scope,
  tier: number,
  day: number,
  now: number,
  rng: Rng,
): Prize[] {
  if (!canClaim(save, eco, scope, tier, day)) return [];
  claimedList(save, scope).push(tier);
  const t = tiers(eco, scope)[tier];
  const out = t.reward ? Album.grant(save, t.reward, now, eco, rng) : [];
  if (t.card) {
    const min = t.card.minRarity ? Cards.rank(eco, t.card.minRarity) : 0;
    const rarity = Cards.rollRarity(eco, t.card.rates ?? eco.chest.cardRates, rng, min);
    const open = Album.pool(eco, species, save.level);
    const card = Cards.give(save, eco, Cards.pick(save, open, rarity, rng, t.card.preferUnowned === true));
    out.push({ kind: 'card', card_id: card.id, rarity: card.rarity, is_new: card.is_new, dupe_coins: card.coins });
  }
  return out;
}
