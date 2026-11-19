// 把 level_curve.json 的难度曲线换算成某一关的生成参数与目标胜率，见 docs/02-关卡设计.md 第 2 节。
// 参数随关卡号连续插值，不按段跳变。障碍搭配、挑战关降幅、第 3 缸区间是 2026-11-16 关卡设计复查后的规则。
import type { CurveConfig, JamKind } from '../config';
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
  /** 冰封泡做成厚冰：最多连几个气泡、全部破了才解冻（0 或不给 = 旧的「任何一个破了就解冻」） */
  iceAll?: number;
  big?: number;
  pairs?: number;
  challenge?: boolean;
  scramble?: number;
  /** 只打乱编号在这个比例之后的气泡（0–1，不给 = 全部） */
  scrambleFrom?: number;
  /** 最多试几次（不给 = LevelGen.ATTEMPTS） */
  attempts?: number;
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
    // 鱼数按海域定（一个海域里持平）；没配的海域照曲线、封顶 normalFishMax
    const seaFish = curve.seaFish;
    const own = seaFish && seaFish.length > 0 ? seaFish[Math.min(seaFish.length - 1, Math.floor((id - 1) / (curve.route?.targets.seaSize ?? 20)))] : 0;
    if (own > 0) p.fish = own;
    else if (curve.normalFishMax !== undefined) p.fish = Math.min(p.fish, curve.normalFishMax);
    if (isChallenge(curve, id)) challenge(curve, id, p);
    if (isBoss(curve, id)) p.species += curve.challenge.bossSpeciesPlus ?? 0;
  }
  jam(curve, id, ease, p);
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

/** 第 id 关开局暂存槽里先放几条鱼（docs/01 9.3：第 41 关起的难关、超难关）；普通关、没配返回 0 */
export function prefillFor(curve: CurveConfig, id: number): number {
  const p = curve.prefill;
  if (!p || id < p.from || !isChallenge(curve, id)) return 0;
  let n = 0;
  for (const [from, k] of p.count) if (id >= from) n = k;
  return n;
}

/** 超难关（每 jam.bigEvery 关一个，海域最后一关，原来叫「守关」；docs/01 9.2） */
export function isBoss(curve: CurveConfig, id: number): boolean {
  return jamKind(curve, id) === 'big';
}

/**
 * 这一关尺子（route.ruler）量的不用道具的过关率目标（0–1，docs/01 9.2，用户 2026-11-20 定）：不逐关降——
 * 一个海域（seaSize 关）里普通关同一个数，每进一个海域换一档；难关、超难关各有自己的一张表；头几关（early）再缓一档。都不低于 min。
 * 没配 route.targets、或是新手期前几关返回 null
 */
export function routeTarget(curve: CurveConfig, id: number): number | null {
  const t = curve.route?.targets;
  if (!t) return null;
  const own = t.overrides?.[String(id)];
  if (own !== undefined) return own;
  if (id < t.from) return id >= t.tutorial[0][0] ? knot(t.tutorial, id) : null;
  // 刚出新手期的头几关缓一档（排队泡首发、开始扣命，docs/01 9.2）
  if (t.early && id <= t.early.until) return Math.max(t.min, isChallenge(curve, id) ? t.early.hard : t.early.normal);
  const table = isBoss(curve, id) ? t.boss : isChallenge(curve, id) ? t.hard : t.normal;
  const sea = Math.min(table.length - 1, Math.floor((id - 1) / t.seaSize));
  return Math.max(t.min, table[sea]);
}

/** 这一关想清楚的玩家不能低于多少（docs/02 0.3）：min(floor.max, 目标 + floor.gap)；没配 floor 用 route.thinkFloor */
export function thinkFloorFor(curve: CurveConfig, id: number): number {
  const r = curve.route;
  if (!r) return 0.9;
  const t = routeTarget(curve, id);
  if (!r.floor || t === null) return r.thinkFloor;
  return Math.min(r.floor.max, Math.round((t + r.floor.gap) * 100) / 100);
}

/** 排队泡关卡：这一关是哪一档；不是排队泡关卡（jam 没配或还没到 jam.from）返回 null */
export function jamKind(curve: CurveConfig, id: number): JamKind | null {
  const j = curve.jam;
  if (!j || id < j.from) return null;
  if (id % j.bigEvery === 0) return 'big';
  return isChallenge(curve, id) ? 'hard' : 'normal';
}

/** 分段线性的折点表取值：第一个折点之前、最后一个之后取端点值 */
export function knot(k: readonly (readonly number[])[], id: number): number {
  if (id <= k[0][0]) return k[0][1];
  for (let i = 1; i < k.length; i++) {
    if (id <= k[i][0]) return k[i - 1][1] + ((id - k[i - 1][0]) * (k[i][1] - k[i - 1][1])) / (k[i][0] - k[i - 1][0]);
  }
  return k[k.length - 1][1];
}

/**
 * 排队泡关卡的生成参数：多少气泡排队、从哪里开始打乱、打乱多少（起点）。变体按 jam.ease 少打乱，
 * 也没有难关、大难关的加量（按普通关的规模生成）
 */
function jam(curve: CurveConfig, id: number, ease: number, p: GenParams): void {
  const kind = jamKind(curve, id);
  if (kind === null) return;
  const j = curve.jam as NonNullable<CurveConfig['jam']>;
  p.queue = knot(j.queue, id);
  p.scrambleFrom = knot(j.scrambleFrom, id);
  const share = knot(j.scramble[kind], id) * (ease > 0 ? j.ease[Math.min(ease, j.ease.length) - 1] : 1);
  p.scramble = Math.trunc(p.fish * share);
}

/**
 * 排队泡关卡的验收目标：普通玩家机器人花不超过 k 样就过关的比例 [不花, ≤1, ≤2, …]（0–1）。
 * 变体：难关、大难关的第 1 个变体取这一档和普通关的中间，第 2 个变体取普通关；普通关的变体不设目标（只要更容易）
 */
export function jamTargets(curve: CurveConfig, id: number, ease: number): number[] | null {
  const kind = jamKind(curve, id);
  if (kind === null) return null;
  const j = curve.jam as NonNullable<CurveConfig['jam']>;
  const at = (k: JamKind) => {
    let t = j.targets[k][0][1];
    for (const [from, v] of j.targets[k]) if (id >= from) t = v;
    return t;
  };
  const normal = at('normal');
  if (ease <= 0) return at(kind);
  if (kind === 'normal') return null;
  if (ease >= 2) return normal;
  const own = at(kind);
  return own.map((v, i) => (v + (normal[Math.min(i, normal.length - 1)] ?? 1)) / 2);
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
  // 按解锁关从早到晚排（解锁关不一定和 MECHANICS 的先后一致；同一关解锁的保持原来的先后）
  const open: Mechanic[] = MECHANICS.filter((m) => id >= unlock[m]).sort((x, y) => unlock[x] - unlock[y]);
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
  if (p.ice) p.iceAll = iceAllFor(curve, id);
  p.timerRule = curve.timer;
  p.clock = curve.bot;
}

function challenge(curve: CurveConfig, id: number, p: GenParams): void {
  const c = curve.challenge;
  p.challenge = true;
  const plus = c.speciesPlus;
  p.species = p.species + (id >= c.speciesPlusFrom ? plus[1] : plus[0]);
  // 多三成，但不超过 fishMax、也不比普通关多出 fishPlusMax 条；取 3 的倍数（一缸 3 条）
  const more = Math.min(Math.trunc(p.fish * c.fishMul), c.fishMax, c.fishPlusMax !== undefined ? p.fish + c.fishPlusMax : Infinity);
  p.fish = Math.max(p.fish, more - (more % 3));
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

/** 第 id 关的冰封泡最多连几个（厚冰，全部破了才解冻）：level_curve.json 的 iceAll 是 [从第几关起, 几个] 的表；没配返回 0（旧规则） */
export function iceAllFor(curve: CurveConfig, id: number): number {
  let n = 0;
  for (const [from, deps] of curve.iceAll ?? []) if (id >= from) n = deps;
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
