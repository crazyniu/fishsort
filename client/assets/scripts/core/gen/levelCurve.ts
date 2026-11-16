// 把 level_curve.json 的难度曲线换算成某一关的生成参数与目标胜率，见 docs/02-关卡设计.md 第 2 节。
// 对应 Godot 版 src/core/gen/level_curve.gd。参数随关卡号连续插值，不按段跳变。
import type { CurveConfig } from '../config';
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
  chain?: number;
  timer?: number;
  fog?: number;
  ice?: number;
  big?: number;
  pairs?: number;
  challenge?: boolean;
  scramble?: number;
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

/**
 * 障碍按解锁关逐个加入：解锁那一关只用它一个；之后最新的一个必带，
 * 其余在更早解锁的里轮换，单关最多 maxMechanics 种
 */
function mechanics(curve: CurveConfig, id: number, p: GenParams): void {
  const unlock = curve.unlock;
  const open: Mechanic[] = MECHANICS.filter((m) => id >= unlock[m]);
  if (open.length === 0) return;
  const chosen: Mechanic[] = [open[open.length - 1]];
  if (id !== unlock[chosen[0]]) {
    const older = open.slice(0, open.length - 1);
    const room = curve.maxMechanics - 1;
    for (let i = 0; i < Math.min(room, older.length); i++) chosen.push(older[(id + i) % older.length]);
  }
  for (const m of chosen) p[m] = m === 'fog' ? Number(curve.counts[m]) : Math.trunc(curve.counts[m]);
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

/** 贪心机器人（2 缸）胜率的目标值（百分比，浮点） */
export function targetRate(curve: CurveConfig, id: number, isChal: boolean): number {
  const t = curve.targets;
  if (id <= t.tutorialUntil) return 100.0;
  const normal = t.start - ((id - t.first) * (t.start - t.end)) / (t.last - t.first);
  if (isChal) return Math.max(normal - t.challengeDrop, t.challengeFloor);
  return normal;
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
