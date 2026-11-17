// 「按解构造」：一边模拟一条合法打法，一边决定每条鱼的种类。
// 直接调用 Rules 推进，所以锁链、冰封等障碍自动被考虑在内。
import { Bowl, GameState, RETURN_BUBBLE, REMOVED, Status, UNASSIGNED } from '../model/gameState';
import { Tap } from '../model/levelData';
import { Rng } from '../rng/rng';
import { findSlot, openBubbles, tap } from '../rules/rules';
import { countOf } from '../util';

export const LOOKAHEAD = 6;

export interface ConstructResult {
  ok: boolean;
  /** key(气泡, 下标) → 鱼种 */
  assign: Map<number, number>;
  taps: Tap[];
}

/** base 中待定的鱼用 UNASSIGNED 标记。不修改 base */
export function construct(base: GameState, rng: Rng, slack: number): ConstructResult {
  const s = base.clone();
  const assign = new Map<number, number>();
  const taps: Tap[] = [];
  const fail: ConstructResult = { ok: false, assign, taps };
  const futureChance = 0.25 + 0.12 * slack;
  while (s.status === Status.PLAYING) {
    // 回流位里有当前缸要的鱼就先拿
    let took = false;
    for (let k = 0; k < s.returnFish.length; k++) {
      if (findSlot(s, s.returnFish[k]) >= 0) {
        tap(s, RETURN_BUBBLE, k);
        taps.push([RETURN_BUBBLE, k]);
        took = true;
        break;
      }
    }
    if (took) continue;
    const open = openBubbles(s);
    if (open.length === 0) return fail;
    const b = rng.pick(open);
    const bub = s.bubbles[b];
    let k = bub.fish.length - 1;
    while (bub.fish[k] === REMOVED) k -= 1;
    if (bub.fish[k] === UNASSIGNED) {
      let sp = -1;
      if (s.buffer.length < slack && rng.randf() < futureChance) sp = futureSpecies(s, rng);
      if (sp < 0) sp = activeSpecies(s, rng);
      if (sp < 0) return fail;
      bub.fish[k] = sp;
      assign.set(key(b, k), sp);
    }
    // 结伴鱼（只有洗牌时会遇到，生成关卡时结伴鱼是最后才系上的）：另一条还没定种类时，
    // 先当两条普通的鱼一条一条走，第一条落定后再给第二条挑种类，保证两条都有地方去
    const partner = bub.partnerOf(k);
    if (partner >= 0 && bub.fish[partner] === UNASSIGNED) {
      const saved = bub.pairs;
      bub.pairs = [];
      tap(s, b, k);
      taps.push([b, k]);
      if (s.status === Status.PLAYING) {
        const sp2 = activeSpecies(s, rng);
        if (sp2 < 0) return fail;
        bub.fish[partner] = sp2;
        assign.set(key(b, partner), sp2);
        tap(s, b, partner);
        taps.push([b, partner]);
      }
      bub.pairs = saved;
      continue;
    }
    tap(s, b, k);
    taps.push([b, k]);
  }
  return { ok: s.status === Status.WON, assign, taps };
}

export function key(b: number, k: number): number {
  return b * 16 + k;
}

/** 当前缸还缺的鱼种（扣掉回流位里已经有的） */
function activeSpecies(s: GameState, rng: Rng): number {
  const cands: number[] = [];
  for (let i = 0; i < s.openSlots; i++) {
    const bowl = s.slots[i];
    if (bowl === null) continue;
    const need = bowl.cap - bowl.count - countOf(s.returnFish, bowl.species);
    for (let n = 0; n < need; n++) cands.push(bowl.species);
  }
  if (cands.length === 0) return -1;
  return rng.pick(cands);
}

/** 挑一个「稍后才用得上」的鱼种，它会先占暂存槽 */
function futureSpecies(s: GameState, rng: Rng): number {
  const active = new Set<number>();
  for (let i = 0; i < s.openSlots; i++) {
    const bowl = s.slots[i];
    if (bowl !== null) active.add((bowl as Bowl).species);
  }
  const seen = new Set<number>();
  const cands: number[] = [];
  const end = Math.min(s.orders.length, s.nextOrder + LOOKAHEAD);
  for (let j = s.nextOrder; j < end; j++) {
    const sp = s.orders[j].s;
    if (active.has(sp) || seen.has(sp)) continue;
    seen.add(sp);
    if (countOf(s.buffer, sp) + countOf(s.returnFish, sp) < s.orders[j].cap) cands.push(sp);
  }
  if (cands.length === 0) return -1;
  return rng.pick(cands);
}

/**
 * 洗牌道具（2026-11-18 改）：只动**场上**的鱼，把架上的缸现在要的鱼和最好点的那几个位置对调，其余的都不动；候场的气泡不动。
 * 帮的是眼前这一下——能马上送走几条、腾出缸位，后面还得自己打；原来是把剩下的鱼整个重排成不需要暂存槽的局面，
 * 点一次就等于通关（docs/02 第 0 节）。结伴鱼不拆（两条的位置不变，只换种类）。
 * 场上没有鱼可换时返回 false
 */
export function rescueShuffle(s: GameState, rng: Rng): boolean {
  const open = new Set(openBubbles(s));
  // 每个位置离「点得到」有多远：开放气泡里普通泡都是 0，排队泡按离排头几条算；没开放的排在最后
  const spots: { b: number; k: number; rank: number; tie: number }[] = [];
  const pool: number[] = [];
  for (let b = 0; b < s.bubbles.length; b++) {
    const bub = s.bubbles[b];
    if (!bub.onField) continue;
    let depth = 0;
    for (let k = bub.fish.length - 1; k >= 0; k--) {
      if (bub.fish[k] === REMOVED) continue;
      spots.push({ b, k, rank: (open.has(b) ? 0 : 1000) + (bub.queue ? depth : 0), tie: rng.randf() });
      pool.push(bub.fish[k]);
      depth += 1;
    }
  }
  if (spots.length < 2) return false;
  spots.sort((x, y) => x.rank - y.rank || x.tie - y.tie);
  // 架上的缸还缺的鱼，场上有多少先拿多少
  const first: number[] = [];
  for (let i = 0; i < s.openSlots; i++) {
    const bowl = s.slots[i];
    if (bowl === null) continue;
    let need = bowl.cap - bowl.count - countOf(s.returnFish, bowl.species);
    for (let j = 0; j < pool.length && need > 0; ) {
      if (pool[j] === bowl.species) {
        first.push(pool[j]);
        pool.splice(j, 1);
        need -= 1;
      } else j += 1;
    }
  }
  // 其余的鱼不动：只把要的鱼和最前面那几个位置上的鱼对调。原来的顺序里已经排在前面的就不用换
  void pool;
  const want = first.slice();
  // 前 want.length 个最好点的位置里，已经是要的鱼的先留着
  const front = spots.slice(0, want.length);
  const keep = new Set<number>();
  front.forEach((p, i) => {
    const at = want.indexOf(s.bubbles[p.b].fish[p.k]);
    if (at >= 0) {
      want.splice(at, 1);
      keep.add(i);
    }
  });
  let moved = 0;
  front.forEach((p, i) => {
    if (keep.has(i) || want.length === 0) return;
    const sp = want.shift() as number;
    // 从后面（不好点的位置）找一条这种鱼换过来
    for (let j = spots.length - 1; j >= front.length; j--) {
      const q = spots[j];
      if (s.bubbles[q.b].fish[q.k] !== sp) continue;
      s.bubbles[q.b].fish[q.k] = s.bubbles[p.b].fish[p.k];
      s.bubbles[p.b].fish[p.k] = sp;
      moved += 1;
      break;
    }
  });
  return moved > 0;
}

/** 洗牌道具：场上剩余的鱼重新分布成低难度可解局面。成功返回 true */
export function reshuffle(s: GameState, rng: Rng): boolean {
  const blank = s.clone();
  for (const bub of blank.bubbles) {
    // 结伴鱼不拆：两条都还在的那一对留着，位置不动，只是换了种类（docs/01 5.2）
    bub.pairs = bub.pairs.filter((p) => bub.fish[p[0]] !== REMOVED && bub.fish[p[1]] !== REMOVED);
    for (let k = 0; k < bub.fish.length; k++) {
      if (bub.fish[k] !== REMOVED) bub.fish[k] = UNASSIGNED;
    }
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = construct(blank, rng, 0);
    if (res.ok) {
      for (let b = 0; b < s.bubbles.length; b++) {
        const bub = s.bubbles[b];
        bub.pairs = blank.bubbles[b].pairs;
        for (let k = 0; k < bub.fish.length; k++) {
          if (bub.fish[k] !== REMOVED) bub.fish[k] = res.assign.get(key(b, k)) as number;
        }
      }
      return true;
    }
  }
  return false;
}
