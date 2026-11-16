// 「按解构造」：一边模拟一条合法打法，一边决定每条鱼的种类。对应 Godot 版 src/core/gen/constructor.gd。
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

/** 洗牌道具：场上剩余的鱼重新分布成低难度可解局面。成功返回 true */
export function reshuffle(s: GameState, rng: Rng): boolean {
  const blank = s.clone();
  for (const bub of blank.bubbles) {
    bub.pairs = [];
    for (let k = 0; k < bub.fish.length; k++) {
      if (bub.fish[k] !== REMOVED) bub.fish[k] = UNASSIGNED;
    }
  }
  for (let attempt = 0; attempt < 20; attempt++) {
    const res = construct(blank, rng, 0);
    if (res.ok) {
      for (let b = 0; b < s.bubbles.length; b++) {
        const bub = s.bubbles[b];
        bub.pairs = [];
        for (let k = 0; k < bub.fish.length; k++) {
          if (bub.fish[k] !== REMOVED) bub.fish[k] = res.assign.get(key(b, k)) as number;
        }
      }
      return true;
    }
  }
  return false;
}
