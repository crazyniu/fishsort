// 关卡生成器，见 docs/02-关卡设计.md 第 4 节。对应 Godot 版 src/core/gen/level_gen.gd。
import { GameState, UNASSIGNED } from '../model/gameState';
import { BubbleData, LevelData, OrderData } from '../model/levelData';
import { Rng } from '../rng/rng';
import { start } from '../rules/rules';
import { solve } from '../solver/bots';
import { replay } from '../solver/levelCheck';
import { clampi, dist32, idiv, roundi, snappedf } from '../util';
import { construct, key } from './constructor';
import type { GenParams } from './levelCurve';

/** 气泡场高宽比，与局内界面的场地区域一致 */
export const FIELD_H = 1.1;
export const MAX_PER_BUBBLE = 5;
export const ATTEMPTS = 40;
/** 打乱后找参考解时贪心机器人最多试几局 */
export const SOLVE_TRIES = 60;

export function generate(p: GenParams, seed: number): LevelData | null {
  const rng = new Rng(seed);
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    // 后一半尝试去掉锁链和冰封，保证总能出关卡
    const lv = attemptOnce(p, rng, attempt >= ATTEMPTS / 2);
    if (lv !== null) {
      lv.levelSeed = seed;
      return lv;
    }
  }
  return null;
}

function attemptOnce(p: GenParams, rng: Rng, plain: boolean): LevelData | null {
  const lv = new LevelData();
  const ns = p.species;
  const total = p.fish;
  lv.palette = ns;
  lv.challenge = p.challenge ?? false;
  lv.orders = makeOrders(rng, ns, total, p.big ?? 0);
  lv.fieldCap = Math.trunc(p.cap ?? 0);
  lv.bubbles = makeBubbles(rng, total, p.layers, lv.fieldCap, p.per_min ?? 1, p.per_max ?? 5);
  if (!plain) {
    addChain(rng, lv, p.chain ?? 0);
    addIce(rng, lv, p.ice ?? 0);
  }
  const fog = p.fog ?? 0.0;
  for (const b of lv.bubbles) {
    const covered = lv.fieldCap > 0 || b.layer < p.layers - 1;
    b.fog = fog > 0.0 && covered && rng.randf() < fog;
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
    scrambleFish(rng, lv, scramble);
    lv.ref = solve(lv, SOLVE_TRIES);
    if (lv.ref.length === 0) return null;
  }
  addPairs(rng, lv, p.pairs ?? 0);
  addTimers(rng, lv, p.timer ?? 0);
  if (!replay(lv).won) return null;
  return lv;
}

/**
 * 随机交换 count 对不同种的鱼。按解构造出来的关卡对「只顾眼前」的打法太顺，
 * 打乱一部分才有需要规划的局面；打乱后的可解性由 Bots.solve 找到的通关步骤证明
 */
function scrambleFish(rng: Rng, lv: LevelData, count: number): void {
  const spots: [number, number][] = [];
  for (let b = 0; b < lv.bubbles.length; b++) {
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
): BubbleData[] {
  const nb = clampi(roundi(total / 3.0), Math.ceil(total / perMax), idiv(total, perMin));
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
      fog: false,
      ice: [],
      pairs: [],
    });
  }
  return out;
}

function addChain(rng: Rng, lv: LevelData, count: number): void {
  for (let i = 0; i < count; i++) {
    const b = rng.pick(lv.bubbles);
    if (b.chain === 0) b.chain = rng.rangeI(1, 2);
  }
}

function addIce(rng: Rng, lv: LevelData, count: number): void {
  const depended = new Set<number>();
  for (let i = 0; i < count; i++) {
    const b = rng.pick(lv.bubbles);
    if (b.chain > 0 || b.ice.length > 0 || depended.has(b.id)) continue;
    // 依赖的邻居必须不比自己低、自己没被冰封，否则可能互相等待。
    // 掉落关里邻居必须排在自己前面，并且与自己同时可能在场
    let best = -1;
    let bestD = Infinity;
    for (const o of lv.bubbles) {
      if (o.id === b.id || o.layer < b.layer || o.ice.length > 0) continue;
      if (lv.fieldCap > 0 && (o.id > b.id || o.id < b.id - lv.fieldCap)) continue;
      const d = dist32(b.x, b.y, o.x, o.y);
      if (d < bestD) {
        bestD = d;
        best = o.id;
      }
    }
    if (best >= 0) {
      b.ice.push(best);
      depended.add(best);
    }
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

function addTimers(rng: Rng, lv: LevelData, count: number): void {
  if (count <= 0) return;
  const steps = replay(lv).steps;
  const cands: number[] = [];
  for (let i = 2; i < lv.orders.length; i++) {
    if ((steps.get(i) ?? 99) <= 20) cands.push(i);
  }
  rng.shuffle(cands);
  for (let i = 0; i < Math.min(count, cands.length); i++) {
    const o = cands[i];
    lv.orders[o].timer = clampi((steps.get(o) as number) * 3 + 15, 45, 90);
  }
}
