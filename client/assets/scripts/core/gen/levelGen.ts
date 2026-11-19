// 关卡生成器，见 docs/02-关卡设计.md 第 4 节。
// 先按解构造出一关和它的参考解，再在不破坏参考解的前提下叠加障碍（锁链、冰封、迷雾、结伴鱼、限时）。
import { GameState, UNASSIGNED } from '../model/gameState';
import { BubbleData, LevelData, OrderData, Tap } from '../model/levelData';
import { Rng } from '../rng/rng';
import { start, tap } from '../rules/rules';
import { DEFAULT_CLOCK, solve, wins } from '../solver/bots';
import { replay } from '../solver/levelCheck';
import { clampi, dist32, idiv, roundi, snappedf } from '../util';
import { construct, key } from './constructor';
import type { GenParams } from './levelCurve';

/** 气泡场高宽比，与局内界面的场地区域一致 */
export const FIELD_H = 1.1;
export const MAX_PER_BUBBLE = 5;
export const ATTEMPTS = 40;
/** 定限时秒数时，开 3、4 个缸位各取几局通关的打法 */
export const TIMER_SAMPLES = 3;
/** 打乱后找参考解时贪心机器人最多试几局 */
export const SOLVE_TRIES = 60;

/**
 * solver：打乱后找参考解用谁（不给 = 贪心机器人 SOLVE_TRIES 局）。排队泡关卡贪心机器人几乎打不过，
 * 关卡工具传细心玩家进来（core/solver/careful.ts）
 */
export function generate(p: GenParams, seed: number, solver?: (lv: LevelData) => Tap[]): LevelData | null {
  const rng = new Rng(seed);
  const attempts = p.attempts ?? ATTEMPTS;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const lv = attemptOnce(p, rng, solver);
    if (lv !== null) {
      lv.levelSeed = seed;
      return lv;
    }
  }
  return null;
}

function attemptOnce(p: GenParams, rng: Rng, solver?: (lv: LevelData) => Tap[]): LevelData | null {
  const lv = new LevelData();
  const ns = p.species;
  const total = p.fish;
  lv.palette = ns;
  lv.challenge = p.challenge ?? false;
  lv.buffer = p.buffer ?? lv.buffer;
  lv.orders = makeOrders(rng, ns, total, p.big ?? 0);
  lv.fieldCap = Math.trunc(p.cap ?? 0);
  lv.bubbles = makeBubbles(rng, total, p.layers, lv.fieldCap, p.per_min ?? 1, p.per_max ?? 5, p.per_avg ?? 3.0);
  // 排队泡：先定下哪些气泡要排队，参考解再照着这个规则构造（构造时每个气泡本来就是从下标最大的取起）
  if ((p.queue ?? 0) > 0) {
    for (const b of lv.bubbles) if (b.fish.length >= 2 && rng.randf() < (p.queue as number)) b.queue = true;
  }

  const s = GameState.fromLevel(lv);
  start(s);
  const res = construct(s, rng, p.slack ?? 0);
  if (!res.ok) return null;
  for (let b = 0; b < lv.bubbles.length; b++) {
    const fish = lv.bubbles[b].fish;
    for (let k = 0; k < fish.length; k++) fish[k] = res.assign.get(key(b, k)) as number;
  }
  lv.ref = res.taps;
  const scramble = Math.trunc(p.scramble ?? 0);
  if (scramble > 0) {
    scrambleFish(rng, lv, scramble, p.scrambleFrom ?? 0);
    lv.ref = solver !== undefined ? solver(lv) : solve(lv, SOLVE_TRIES);
    if (lv.ref.length === 0) return null;
  }
  // 叠加障碍：都照着参考解加，参考解照样能通关
  const tl = timeline(lv);
  addChain(rng, lv, tl, p.chain ?? 0);
  addIce(rng, lv, tl, p.ice ?? 0, p.iceAll ?? 0);
  addFog(rng, lv, tl, p.fog ?? 0.0, p.fogCount ?? [1, 1]);
  addPairs(rng, lv, p.pairs ?? 0);
  addTimers(rng, lv, p);
  if (!replay(lv).won) return null;
  return lv;
}

/** 参考解走一遍，记下每个气泡什么时候落到场上、第一次被点、破掉（都是「第几次点击之前」），以及每次点击前已经装满几缸 */
interface Timeline {
  land: number[];
  first: number[];
  pop: number[];
  done: number[];
}

const NEVER = 1 << 30;

function timeline(lv: LevelData): Timeline {
  const n = lv.bubbles.length;
  const tl: Timeline = { land: [], first: [], pop: [], done: [] };
  const s = GameState.fromLevel(lv);
  start(s);
  for (let b = 0; b < n; b++) {
    tl.land.push(s.bubbles[b].onField ? 0 : NEVER);
    tl.first.push(NEVER);
    tl.pop.push(NEVER);
  }
  for (let i = 0; i < lv.ref.length; i++) {
    tl.done.push(s.bowlsDone);
    const b = lv.ref[i][0];
    if (b >= 0 && tl.first[b] === NEVER) tl.first[b] = i;
    for (const e of tap(s, b, lv.ref[i][1])) {
      if (e.t === 'bubble_pop') tl.pop[e.b as number] = i;
      else if (e.t === 'bubble_drop') tl.land[e.b as number] = i + 1;
    }
  }
  tl.done.push(s.bowlsDone);
  return tl;
}

/**
 * 随机交换 count 对不同种的鱼。按解构造出来的关卡对「只顾眼前」的打法太顺，
 * 打乱一部分才有需要规划的局面；打乱后的可解性由找到的通关步骤证明。
 * from：只打乱编号在前 from（0–1）之后的气泡（掉落关按编号落下，前面一段顺、后面难，docs/02 附录 A.5）
 */
function scrambleFish(rng: Rng, lv: LevelData, count: number, from: number): void {
  const spots: [number, number][] = [];
  for (let b = Math.floor(lv.bubbles.length * from); b < lv.bubbles.length; b++) {
    for (let k = 0; k < lv.bubbles[b].fish.length; k++) spots.push([b, k]);
  }
  let done = 0;
  let guard = 0;
  while (done < count && guard < count * 20) {
    guard += 1;
    const x = rng.pick(spots);
    const y = rng.pick(spots);
    const fx = lv.bubbles[x[0]].fish;
    const fy = lv.bubbles[y[0]].fish;
    if (x[0] === y[0] || fx[x[1]] === fy[y[1]]) continue;
    const t = fx[x[1]];
    fx[x[1]] = fy[y[1]];
    fy[y[1]] = t;
    done += 1;
  }
}

function makeOrders(rng: Rng, ns: number, total: number, big: number): OrderData[] {
  big = Math.min(big, idiv(total - 6, 6));
  const n = idiv(total - 6 * big, 3) + big;
  const species: number[] = [];
  for (let i = 0; i < n; i++) species.push(i % ns);
  // 相邻两个缸尽量不同种
  for (let attempt = 0; attempt < 200; attempt++) {
    rng.shuffle(species);
    let ok = true;
    for (let i = 0; i < n - 1; i++) {
      if (species[i] === species[i + 1]) {
        ok = false;
        break;
      }
    }
    if (ok) break;
  }
  const out: OrderData[] = species.map((s) => ({ s, cap: 3, timer: 0 }));
  let placed = 0;
  while (placed < big) {
    const i = rng.rangeI(Math.min(2, n - 1), n - 1);
    if (out[i].cap === 3) {
      out[i].cap = 6;
      placed += 1;
    }
  }
  return out;
}

function makeBubbles(
  rng: Rng,
  total: number,
  layers: number,
  fieldCap: number,
  perMin: number,
  perMax: number,
  perAvg: number,
): BubbleData[] {
  const nb = clampi(roundi(total / perAvg), Math.ceil(total / perMax), idiv(total, perMin));
  const caps: number[] = [];
  for (let i = 0; i < nb; i++) caps.push(perMin);
  for (let i = 0; i < total - nb * perMin; i++) {
    const room: number[] = [];
    for (let j = 0; j < nb; j++) if (caps[j] < perMax) room.push(j);
    caps[rng.pick(room)] += 1;
  }
  const out: BubbleData[] = [];
  for (let i = 0; i < nb; i++) {
    // 掉落关没有遮挡，layer 恒为 1
    const layer = fieldCap > 0 ? 1 : idiv(i * layers, nb);
    const r = 0.085 + 0.011 * caps[i];
    let x = 0.5;
    let y = 0.5;
    for (let attempt = 0; attempt < 60; attempt++) {
      x = r + rng.randf() * (1.0 - 2.0 * r);
      y = r + rng.randf() * (FIELD_H - 2.0 * r);
      let clash = false;
      // 候场的气泡位置只是占位，界面落下时另找空位
      if (fieldCap > 0 && i >= fieldCap) break;
      for (const o of out) {
        if (o.layer === layer && dist32(x, y, o.x, o.y) < (r + o.r) * 0.9) {
          clash = true;
          break;
        }
      }
      if (!clash) break;
    }
    const fish: number[] = [];
    for (let k = 0; k < caps[i]; k++) fish.push(UNASSIGNED);
    const under: number[] = [];
    for (const o of out) {
      if (fieldCap === 0 && o.layer < layer && dist32(x, y, o.x, o.y) < (r + o.r) * 0.75) under.push(o.id);
    }
    out.push({
      id: i,
      x: snappedf(x, 0.001),
      y: snappedf(y, 0.001),
      r: snappedf(r, 0.001),
      layer,
      fish,
      under,
      chain: 0,
      fog: 0,
      ice: [],
      pairs: [],
    });
  }
  return out;
}

/**
 * 锁链泡：落到场上时还锁着（还差 1–2 缸），参考解第一次点它之前已经解开。
 * 锁链数字从开局就随满缸递减，所以数字 = 落下时已装满的缸数 + 还差的缸数
 */
function addChain(rng: Rng, lv: LevelData, tl: Timeline, count: number): void {
  if (count <= 0) return;
  const cands: number[] = [];
  for (const b of lv.bubbles) {
    if (tl.land[b.id] === NEVER || tl.first[b.id] === NEVER) continue;
    if (tl.done[tl.first[b.id]] - tl.done[tl.land[b.id]] >= 1) cands.push(b.id);
  }
  rng.shuffle(cands);
  for (let i = 0; i < Math.min(count, cands.length); i++) {
    const b = cands[i];
    const atLand = tl.done[tl.land[b]];
    lv.bubbles[b].chain = atLand + rng.rangeI(1, Math.min(2, tl.done[tl.first[b]] - atLand));
  }
}

/**
 * 冰封泡：依赖 1–2 个别的气泡，任何一个破了就解冻（docs/02 第 3 节）。照着参考解挑：
 * 冰封泡落到场上时依赖泡都已在场、还没破（不然落下来就没冻），并且参考解第一次点它之前至少有一个依赖泡已经破了。
 * 开局就在场的冰封泡挑离得近的做依赖，界面好画连线
 */
function addIce(rng: Rng, lv: LevelData, tl: Timeline, count: number, all = 0): void {
  if (count <= 0) return;
  if (all > 0) return addThickIce(rng, lv, tl, count, all);
  const order = lv.bubbles.map((b) => b.id);
  rng.shuffle(order);
  const depended = new Set<number>();
  let added = 0;
  for (const id of order) {
    if (added >= count) break;
    const b = lv.bubbles[id];
    if (b.chain > 0 || depended.has(id) || tl.land[id] === NEVER || tl.first[id] === NEVER) continue;
    // 在它落下时已经在场、还没破的气泡
    const alive = lv.bubbles.filter((o) => o.id !== id && o.ice.length === 0 && tl.land[o.id] <= tl.land[id] && tl.pop[o.id] >= tl.land[id] && (lv.fieldCap === 0 || o.id < id));
    const early = alive.filter((o) => tl.pop[o.id] < tl.first[id]);
    if (early.length === 0) continue;
    const near = (list: BubbleData[]) => list.slice().sort((x, y) => dist32(b.x, b.y, x.x, x.y) - dist32(b.x, b.y, y.x, y.y) || x.id - y.id);
    const first = tl.land[id] === 0 ? near(early)[0] : rng.pick(early);
    const deps = [first.id];
    if (rng.rangeI(0, 2) === 0) {
      const rest = alive.filter((o) => o.id !== first.id);
      if (rest.length > 0) deps.push((tl.land[id] === 0 ? near(rest)[0] : rng.pick(rest)).id);
    }
    b.ice = deps.sort((x, y) => x - y);
    for (const d of deps) depended.add(d);
    added += 1;
  }
}

/**
 * 厚冰泡（2026-11-19）：连着 2–maxDeps 个气泡，**全部**破了才解冻。照着参考解挑：
 * 它落到场上时这几个气泡都在场、还没破，参考解第一次点它之前它们全破了——所以按参考解走照样通关，
 * 不按这个先后走的人就要等。优先挑「参考解里它被点之前刚破不久」的气泡做依赖：依赖破得越晚，冰冻得越久，
 * 玩家越要绕着它排顺序；开局在场的再挑离得近的，界面好画连线
 */
function addThickIce(rng: Rng, lv: LevelData, tl: Timeline, count: number, maxDeps: number): void {
  const order = lv.bubbles.map((b) => b.id);
  rng.shuffle(order);
  const used = new Set<number>();
  let added = 0;
  for (const id of order) {
    if (added >= count) break;
    const b = lv.bubbles[id];
    if (b.chain > 0 || used.has(id) || tl.land[id] === NEVER || tl.first[id] === NEVER) continue;
    const early = lv.bubbles.filter(
      (o) => o.id !== id && o.ice.length === 0 && !used.has(o.id) && tl.land[o.id] <= tl.land[id] && tl.pop[o.id] >= tl.land[id] && tl.pop[o.id] < tl.first[id] && (lv.fieldCap === 0 || o.id < id),
    );
    if (early.length < 2) continue;
    const n = Math.min(early.length, rng.rangeI(2, Math.max(2, maxDeps)));
    // 破得晚的排前面；开局在场的在前一半里挑近的
    early.sort((x, y) => tl.pop[y.id] - tl.pop[x.id] || x.id - y.id);
    let pool = early.slice(0, Math.max(n, Math.ceil(early.length / 2)));
    if (tl.land[id] === 0) pool = pool.slice().sort((x, y) => dist32(b.x, b.y, x.x, x.y) - dist32(b.x, b.y, y.x, y.y) || x.id - y.id);
    const deps = pool.slice(0, n).map((o) => o.id);
    b.ice = deps.sort((x, y) => x - y);
    b.iceAll = true;
    used.add(id);
    for (const d of deps) used.add(d);
    added += 1;
  }
}

/**
 * 迷雾泡：按比例挑气泡，计数取 [最少, 最多] 里的随机数，但不超过它落下之后参考解里还会破掉的别的气泡数
 * （不然永远数不到 0）。锁链泡、冰封泡不蒙雾。迷雾不改变规则，参考解不受影响
 */
function addFog(rng: Rng, lv: LevelData, tl: Timeline, share: number, count: readonly number[]): void {
  if (share <= 0.0) return;
  for (const b of lv.bubbles) {
    if (rng.randf() >= share || tl.land[b.id] === NEVER) continue;
    // 一个气泡只带一样：已经锁着或冻着的不再蒙雾（又是冰又是雾，看不出该干什么）
    if (b.chain > 0 || b.ice.length > 0) continue;
    let later = 0;
    for (const o of lv.bubbles) if (o.id !== b.id && tl.pop[o.id] !== NEVER && tl.pop[o.id] >= tl.land[b.id]) later += 1;
    if (later <= 0) continue;
    b.fog = Math.min(rng.rangeI(count[0], count[1]), later);
  }
}

/** 参考解里同一个气泡连续被点的两条鱼可以系成结伴鱼，不改变解法 */
function addPairs(rng: Rng, lv: LevelData, count: number): void {
  if (count <= 0) return;
  const cands: number[] = [];
  for (let i = 0; i < lv.ref.length - 1; i++) {
    if (lv.ref[i][0] >= 0 && lv.ref[i][0] === lv.ref[i + 1][0]) cands.push(i);
  }
  rng.shuffle(cands);
  const used = new Set<number>();
  let added = 0;
  for (const i of cands) {
    if (added >= count) break;
    if (used.has(i) || used.has(i + 1)) continue;
    used.add(i);
    used.add(i + 1);
    lv.bubbles[lv.ref[i][0]].pairs.push([lv.ref[i][1], lv.ref[i + 1][1]]);
    added += 1;
  }
}

/**
 * 限时缸：秒数 = 该缸从上架到装满的点击数 × 每次点击的秒数 × 宽松系数 + 途中别的缸满缸的演出时间，
 * 夹在 [min, max] 里、取整到 step（docs/02 第 4 节第 5 步、docs/01 第 4 节）。头两个缸和参考解里拖得太久的缸不限时。
 *
 * 点击数不能只看 2 缸位的参考解：多开一个缸位，后面的订单会提前上架、倒计时提前开始，可它要的鱼还没掉下来
 * （实测第 31 关 2 缸胜率 85%，开第 3 缸掉到 45%）。所以再让机器人开 3、4 个缸位各打几局，取在架最久的那一次来定秒数；
 * 这样算出来超过上限的缸不限时
 */
function addTimers(rng: Rng, lv: LevelData, p: GenParams): void {
  const count = p.timer ?? 0;
  if (count <= 0) return;
  const rule = p.timerRule ?? { loose: 2, min: 45, max: 90, step: 5, maxSteps: 20 };
  const clock = p.clock ?? DEFAULT_CLOCK;
  const rep = replay(lv);
  const plays = [rep];
  for (const slots of [3, 4]) for (const taps of wins(lv, slots, TIMER_SAMPLES, TIMER_SAMPLES * 4)) plays.push(replay(lv, taps, slots));
  const seconds = (o: number) => {
    let worst = 0;
    for (const r of plays) {
      const steps = r.steps.get(o);
      if (steps !== undefined) worst = Math.max(worst, steps * clock.tapSec * rule.loose + (r.bowls.get(o) ?? 0) * clock.bowlSec);
    }
    return worst;
  };
  const cands: number[] = [];
  for (let i = 2; i < lv.orders.length; i++) {
    if ((rep.steps.get(i) ?? 99) <= rule.maxSteps && seconds(i) <= rule.max) cands.push(i);
  }
  rng.shuffle(cands);
  for (let i = 0; i < Math.min(count, cands.length); i++) {
    const o = cands[i];
    lv.orders[o].timer = clampi(Math.ceil(seconds(o) / rule.step) * rule.step, rule.min, rule.max);
  }
}
