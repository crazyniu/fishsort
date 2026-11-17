// 把 level_curve.json 的难度曲线换算成某一关的生成参数与目标胜率，见 docs/02-关卡设计.md 第 2 节。
// 参数随关卡号连续插值，不按段跳变。障碍搭配、挑战关降幅、第 3 缸区间是 2026-11-16 关卡设计复查后的规则。
import type { CurveConfig } from '../config';
import { NO_TIMER } from '../model/gameState';
import type { LevelData } from '../model/levelData';
import { clampf, idiv, lerpf, roundi } from '../util';

export const MECHANICS = ['chain', 'timer', 'fog', 'ice', 'big', 'pairs'] as const;
export type Mechanic = (typeof MECHANICS)[number];

/** 生成参数，见 LevelGen.generate */
export interface GenParams {
  species: number;
  fish: number;
  layers: number;
  slack: number;
  cap?: number;
  per_min?: number;
  per_max?: number;
  /** 平均一个气泡几条鱼（不给 = 3）。生成器加难度时往下调：同时在场的气泡数不变，看得见的鱼变少 */
  per_avg?: number;
  /** 多大比例的气泡是排队泡（0–1，只有 2 条鱼以上的才算） */
  queue?: number;
  chain?: number;
  timer?: number;
  /** 迷雾泡占气泡总数的比例 */
  fog?: number;
  /** 迷雾计数范围 [最少, 最多] */
  fogCount?: readonly number[];
  ice?: number;
  big?: number;
  pairs?: number;
  challenge?: boolean;
  scramble?: number;
  /** 限时缸秒数的算法（level_curve.json 的 timer）与机器人的计时（bot） */
  timerRule?: { loose: number; min: number; max: number; step: number; maxSteps: number };
  clock?: { tapSec: number; bowlSec: number };
  /** 暂存槽几格（level_curve.json 的 buffer，不给 = 5） */
  buffer?: number;
}

export function isChallenge(curve: CurveConfig, id: number): boolean {
  return id > curve.targets.tutorialUntil && id % curve.cycle === 0;
}

/** ease: 0 = 普通，1/2 = 连续失败后换上的更易变体 */
export function params(curve: CurveConfig, id: number, ease: number): GenParams {
  const fixed = curve.fixed ?? {};
  let p: GenParams;
  const f = fixed[String(id)];
  if (f !== undefined) {
    p = { ...f, cap: 0 };
  } else {
    p = base(curve, id);
    mechanics(curve, id, p);
    if (isChallenge(curve, id)) challenge(curve, id, p);
  }
  const e = curve.ease;
  if (ease > 0) {
    p.species = Math.max(3, p.species - ease * e.species);
    p.fish = Math.max(9, p.fish - ease * e.fish);
    p.slack = Math.max(0, p.slack - ease * e.slack);
    if ((p.cap ?? 0) > 0) p.cap = (p.cap as number) + ease * e.cap;
  }
  p.fish = Math.max(9, idiv(p.fish, 3) * 3);
  p.buffer = bufferFor(curve, id);
  return p;
}

function base(curve: CurveConfig, id: number): GenParams {
  let seg = curve.segments[0];
  for (const s of curve.segments) {
    seg = s;
    if (id <= s.to) break;
  }
  const span = seg.to - seg.from;
  const t = span <= 0 ? 0.0 : clampf((id - seg.from) / span, 0.0, 1.0);
  return {
    species: lerpI(seg.species, t),
    fish: lerpI(seg.fish, t),
    cap: lerpI(seg.cap, t),
    layers: seg.layers,
    per_min: seg.per[0],
    per_max: seg.per[1],
    slack: lerpI(seg.slack, t),
  };
}

/** 第一个掉落关（它是「掉落」这个机制的解锁关） */
export function firstDrop(curve: CurveConfig): number {
  for (const s of curve.segments) if (s.cap[0] > 0) return s.from;
  return 0;
}

/** 第一个分层关 */
export function firstLayered(curve: CurveConfig): number {
  for (const s of curve.segments) if (s.layers > 1) return s.from;
  return 0;
}

/**
 * 这一关首发的机制：chain / timer / fog / ice / big / pairs，或 'drop'（掉落）、'layer'（分层）；没有返回 ''。
 * 机制说明弹窗、校验器的「新机制首发」检查都用它
 */
export function unlockedAt(curve: CurveConfig, id: number): string {
  for (const m of MECHANICS) if (curve.unlock[m] === id) return m;
  if (id === firstDrop(curve)) return 'drop';
  if (id === firstLayered(curve)) return 'layer';
  return '';
}

/** 解锁后第 k 关（k 从 1 起）带不带这个新机制：levels 关里挑 share 关，先密后疏（9 关挑 5 关 = 第 1、2、4、6、8 关） */
function freshOn(curve: CurveConfig, k: number): boolean {
  const f = curve.fresh;
  return Math.ceil((k * f.share) / f.levels) > Math.ceil(((k - 1) * f.share) / f.levels);
}

/**
 * 这一关带哪几种障碍（docs/02 第 2.4 节）：
 * - 解锁关只带新机制一个；掉落的解锁关什么障碍都不带
 * - 每个周期按 rhythm 排种数（挑战关后一关是第 1 关），不超过 maxMechanics 和已解锁的种数
 * - 新机制解锁后的 fresh.levels 关里，挑出的 fresh.share 关必带它，其余几关不带；过了这段和别的平等轮换
 * - 其余名额在已解锁的机制里按关卡号轮换
 */
export function mechanicsFor(curve: CurveConfig, id: number): Mechanic[] {
  const unlock = curve.unlock;
  const open: Mechanic[] = MECHANICS.filter((m) => id >= unlock[m]);
  if (open.length === 0 || id === firstDrop(curve)) return [];
  const newest = open[open.length - 1];
  if (id === unlock[newest]) return [newest];
  const want = Math.min(curve.rhythm[(id - 1) % curve.cycle], curve.maxMechanics);
  const chosen: Mechanic[] = [];
  let pool = open;
  const k = id - unlock[newest];
  if (k <= curve.fresh.levels) {
    pool = open.slice(0, open.length - 1);
    if (freshOn(curve, k)) chosen.push(newest);
  }
  for (let i = 0; chosen.length < want && i < pool.length; i++) chosen.push(pool[(id + i) % pool.length]);
  return MECHANICS.filter((m) => chosen.indexOf(m) >= 0);
}

function mechanics(curve: CurveConfig, id: number, p: GenParams): void {
  for (const m of mechanicsFor(curve, id)) p[m] = m === 'fog' ? Number(curve.counts[m]) : Math.trunc(curve.counts[m]);
  p.fogCount = curve.fogCount;
  p.timerRule = curve.timer;
  p.clock = curve.bot;
}

function challenge(curve: CurveConfig, id: number, p: GenParams): void {
  const c = curve.challenge;
  p.challenge = true;
  const plus = c.speciesPlus;
  p.species = p.species + (id >= c.speciesPlusFrom ? plus[1] : plus[0]);
  p.fish = Math.min(Math.trunc(p.fish * c.fishMul), c.fishMax);
  p.slack = p.slack + c.slackPlus;
  // 分层关（cap 为 0）的挑战关多压一层；掉落关的挑战关缩小场上容量
  if ((p.cap ?? 0) <= 0) p.layers = Math.min(p.layers + 1, c.layersMax);
  else p.cap = Math.max(c.capMin, (p.cap as number) - c.capMinus);
}

/**
 * 限时关里连击加时间（docs/01 第 4 节，用户 2026-11-17：时间给短一点，用连击把时间挣回来）：
 * 连击起算以后每命中一次加几秒，按连击档位（economy.json 的 combo.tiers 的下标）查 clock.comboSeconds；没配或没到起算是 0
 */
export function comboSeconds(curve: CurveConfig, tier: number): number {
  const t = curve.clock?.comboSeconds;
  if (!t || tier < 0 || t.length === 0) return 0;
  return t[Math.min(tier, t.length - 1)];
}

/** 第 id 关暂存槽几格：level_curve.json 的 buffer 是 [从第几关起, 几格] 的表，没配就是 5 格 */
export function bufferFor(curve: CurveConfig, id: number): number {
  let n = 5;
  for (const [from, slots] of curve.buffer ?? []) if (id >= from) n = slots;
  return n;
}

function lerpI(span: readonly number[], t: number): number {
  return roundi(lerpf(span[0], span[1], t));
}

/** 第 id 关里两种生物的颜色至少要差多少（Lab 色差）；没配就不限制 */
export function colorGap(curve: CurveConfig, id: number): number {
  let gap = 0;
  for (const [from, g] of curve.colorGap ?? []) if (id >= from) gap = g;
  return gap;
}

export function seedFor(id: number, ease: number): number {
  return id * 1000 + ease * 100 + 7;
}

/** 挑战关比同位置的普通关低几个点：从第一个挑战关的 challengeDrop[0] 线性加到 challengeDropUntil 关的 challengeDrop[1] */
export function challengeDrop(curve: CurveConfig, id: number): number {
  const t = curve.targets;
  const span = t.challengeDropUntil - curve.cycle;
  const k = span <= 0 ? 1.0 : clampf((id - curve.cycle) / span, 0.0, 1.0);
  return lerpf(t.challengeDrop[0], t.challengeDrop[1], k);
}

/** 贪心机器人（2 缸）胜率的目标值（百分比，浮点） */
export function targetRate(curve: CurveConfig, id: number, isChal: boolean): number {
  const t = curve.targets;
  if (id <= t.tutorialUntil) return 100.0;
  const drop = firstDrop(curve);
  const offset = drop > 0 && id >= drop ? t.segmentOffset.drop : t.segmentOffset.layered;
  // 有 knots 就按它分段线性插值（2026-11-17 第二次调难度：前 60 关不动，后面降得更快），下面的 start / end / tail 不再用
  if (t.knots && t.knots.length > 0) {
    const k = t.knots;
    let base = k[0][1];
    if (id >= k[k.length - 1][0]) base = k[k.length - 1][1];
    else {
      for (let i = 1; i < k.length; i++) {
        if (id <= k[i][0]) {
          base = id <= k[i - 1][0] ? k[i - 1][1] : k[i - 1][1] + ((id - k[i - 1][0]) * (k[i][1] - k[i - 1][1])) / (k[i][0] - k[i - 1][0]);
          break;
        }
      }
    }
    const normal = base + offset;
    if (isChal) return Math.max(normal - challengeDrop(curve, id), t.challengeFloor);
    return normal;
  }
  // 第 last 关以后（2026-11-17 关卡从 120 加到 240）：第 1–last 关的目标不动，之后从 end 再缓缓降到 tail.end
  const tail = t.tail;
  const base =
    tail && id > t.last
      ? t.end - ((Math.min(id, tail.to) - t.last) * (t.end - tail.end)) / (tail.to - t.last)
      : t.start - ((id - t.first) * (t.start - t.end)) / (t.last - t.first);
  const normal = base + offset;
  if (isChal) return Math.max(normal - challengeDrop(curve, id), t.challengeFloor);
  return normal;
}

/**
 * 第 3 缸胜率该落在哪（docs/02 第 2.1 节）：要明显有用（≥ 2 缸 + plus），但不保证过关（capFrom 关起 ≤ 2 缸 + capPlus 且 ≤ cap）。
 * 2 缸胜率已经高到「加 plus 就超过上限」时（或 ≥ easyFrom），第 3 缸只要不低于 2 缸；2 缸已经到 cap 以上时不设上限
 */
export function bowl3Span(curve: CurveConfig, id: number, g2: number): [number, number] {
  const b = curve.targets.bowl3;
  if (id <= curve.targets.tutorialUntil) return [g2, 100];
  const hi = id >= b.capFrom && g2 < b.cap ? Math.min(g2 + b.capPlus, b.cap) : 100;
  const lo = g2 >= b.easyFrom || g2 + b.plus > hi ? g2 : g2 + b.plus;
  return [lo, Math.max(lo, hi)];
}

/** 目标区间 [下限, 上限]，容差 ±tol，上限不超过 100 */
export function target(curve: CurveConfig, id: number, isChal: boolean): [number, number] {
  const c = targetRate(curve, id, isChal);
  const tol = curve.targets.tol;
  if (id <= curve.targets.tutorialUntil) return [100, 100];
  // 目标在 easyFrom 以上的前期关卡允许 100%：机器人胜率只有几档，卡不出 94 和 100 的差别
  const top = c >= curve.targets.easyFrom ? 100 : Math.floor(c + tol);
  return [Math.ceil(c - tol), Math.min(100, top)];
}

/** 胜率离目标区间多远，0 = 落在区间内 */
export function miss(span: readonly number[], rate: number): number {
  return Math.max(0, Math.max(span[0] - rate, rate - span[1]));
}

/**
 * 限时关（docs/01 第 4 节，用户 2026-11-17：细心慢慢玩都能过，后面的关加上时间）：这一关整关有几秒，不限时返回 NO_TIMER。
 * 按机器人的点击节奏算出「不犹豫地点完要多久」，再乘一个越往后越紧的系数；挑战关更紧。
 * 机器人每次点击 bot.tapSec 秒，系数都大于 1，所以机器人不会超时，关卡的胜率目标不受影响——这个时间是给真人的压力
 */
export function clockFor(curve: CurveConfig, id: number, lv: LevelData): number {
  const c = curve.clock;
  if (!c) return NO_TIMER;
  if (!isChallenge(curve, id) || id < c.challengeFrom) return NO_TIMER;
  let fish = 0;
  for (const b of lv.bubbles) fish += b.fish.length;
  const base = fish * curve.bot.tapSec + lv.orders.length * curve.bot.bowlSec;
  const t = clampf((id - c.challengeFrom) / Math.max(1, curve.total - c.challengeFrom), 0, 1);
  let k = lerpf(c.factor[0], c.factor[1], t);
  // 排队泡多的关卡要想清楚先取哪条，时间按排队泡占的比例加长（全是排队泡 = 再加 queueExtra 倍）。
  // 用户 2026-11-18 试第 140 关：126 条鱼给 135 秒，一秒一条，来不及想
  let queued = 0;
  for (const b of lv.bubbles) if (b.queue === true) queued += 1;
  if (queued > 0) k *= 1 + (c.queueExtra ?? 0) * (queued / Math.max(1, lv.bubbles.length));
  return Math.max(c.min, Math.ceil((base * k) / c.step) * c.step);
}
