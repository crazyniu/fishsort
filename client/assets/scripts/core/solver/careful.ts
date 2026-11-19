// 细心玩家机器人与「卡住了花道具」的打法，见 docs/02-关卡设计.md 附录 A.3。
// 生成器用它找排队泡关卡的参考解（贪心机器人在这种关卡里几乎打不过），关卡工具用它量「这一关要花几样才过」。
//
// 细心玩家：每一步对每个候选各推演 ROLLOUTS 局（推演里按随手玩家的打法），挑分数最高的那一步；
// 分数 = 每赢一局 1000，输的局减掉剩下的鱼数。它知道后面的订单和候场的气泡，比真人强。
// 随手玩家：有目标鱼就点，否则点最快用得上的（同 bots.ts 的贪心，不考虑迷雾和限时）。
//
// 花道具：只在「真的卡死了」的时候花——没有一条点得到的鱼能直接进缸，暂存槽只剩最后一格（再点一下就输）。
// 所以「一样都不花就赢了」的那些局和完全不带道具打出来的一模一样，一局就能同时量出不花、花 1 样、花 2 样……的过关概率。
import { GameState, RETURN_BUBBLE, Status } from '../model/gameState';
import { LevelData, Tap } from '../model/levelData';
import { Rng } from '../rng/rng';
import { findSlot, openBubbles, start, tap, tick, unlockBowl, useBlow, useNet, useShuffle } from '../rules/rules';

export const ROLLOUTS = 5;
export const MAX_STEPS = 800;

/** 一局最多能花的道具：洗牌、开缸、吹泡、渔网各几次（洋流只会自动点能进缸的鱼，卡死的时候没用，不算） */
export interface ItemCaps {
  shuffle: number;
  bowl: number;
  blow: number;
  net: number;
}
export const NO_ITEMS: ItemCaps = { shuffle: 0, bowl: 0, blow: 0, net: 0 };
/** 卡死时按这个顺序挑还有、而且用了有效果的那一样（和局内「卡住了」小手指的顺序一致） */
export const ITEM_ORDER = ['shuffle', 'bowl', 'blow', 'net'] as const;
export type Item = (typeof ITEM_ORDER)[number];

export interface PlayResult {
  won: boolean;
  /** 花了几样（输了也照算） */
  items: number;
  /** 依次花了什么 */
  used: Item[];
  /** 点击步骤（花道具的那几下不在里面）；不花道具赢下来的就是一条参考解 */
  taps: Tap[];
}

/** [气泡, 下标, 鱼种, 泡里还剩几条] */
type Opt = [number, number, number, number];

function options(s: GameState): Opt[] {
  const out: Opt[] = [];
  for (let k = 0; k < s.returnFish.length; k++) out.push([RETURN_BUBBLE, k, s.returnFish[k], 1]);
  for (const b of openBubbles(s)) {
    const bub = s.bubbles[b];
    const left = bub.count();
    for (let k = bub.fish.length - 1; k >= 0; k--) if (bub.canTake(k)) out.push([b, k, bub.fish[k], left]);
  }
  return out;
}

function greedy(s: GameState, opts: Opt[], rng: Rng): Opt {
  let best: Opt[] = [];
  let bestScore = Infinity;
  for (const o of opts) {
    const sp = o[2];
    let score: number;
    if (findSlot(s, sp) >= 0) score = o[3];
    else {
      let soon = 99;
      for (let j = s.nextOrder; j < s.orders.length; j++) {
        if (s.orders[j].s === sp) {
          soon = j - s.nextOrder;
          break;
        }
      }
      score = 1000 + (s.buffer.includes(sp) ? 0 : 10000) + soon * 10 + o[3];
    }
    if (score < bestScore) {
      bestScore = score;
      best = [o];
    } else if (score === bestScore) best.push(o);
  }
  return rng.pick(best);
}

function step(s: GameState, o: Opt): void {
  tap(s, o[0], o[1]);
  tick(s, 0.01);
}

/** 按随手玩家的打法推演到底，返回还剩多少条鱼（0 = 通关） */
function rollout(s: GameState, rng: Rng): number {
  let guard = 0;
  while (s.status === Status.PLAYING && guard++ < MAX_STEPS) {
    const opts = options(s);
    if (opts.length === 0) break;
    step(s, greedy(s, opts, rng));
  }
  return s.status === Status.WON ? 0 : s.fishLeft();
}

/** 卡死了：点得到的鱼没有一条能直接进缸，暂存槽只剩最后一格 */
export function stuck(s: GameState): boolean {
  if (s.status !== Status.PLAYING || s.buffer.length < s.bufferCap - 1) return false;
  for (const o of options(s)) if (findSlot(s, o[2]) >= 0) return false;
  return true;
}

/** 花一样道具，花成了（有效果）返回 true */
function useItem(s: GameState, item: Item, seed: number): boolean {
  if (item === 'shuffle') return useShuffle(s, seed).length > 0;
  if (item === 'bowl') return unlockBowl(s).length > 0;
  if (item === 'blow') return s.buffer.length > 0 && useBlow(s).length > 0;
  let best = -1;
  let need = 0;
  for (let i = 0; i < s.openSlots; i++) {
    const bowl = s.slots[i];
    if (bowl !== null && bowl.cap - bowl.count > need) {
      need = bowl.cap - bowl.count;
      best = i;
    }
  }
  return best >= 0 && useNet(s, best).length > 0;
}

/** 普通玩家没有目标鱼可点时，有多大概率不想、随手点一条（真人每局走法不一样） */
export const NORMAL_SLIP = 0.25;

/**
 * 普通玩家：有目标鱼就点；没有的时候看一眼排队泡里排第二的那条——点掉排头能露出一条要的鱼，就点这个；
 * 再不行才按随手玩家的办法挑最快用得上的。只看眼前一步，不推演；没有目标鱼时有 NORMAL_SLIP 的概率随手点
 */
function peek(s: GameState, opts: Opt[], rng: Rng): Opt {
  if (opts.some((o) => findSlot(s, o[2]) >= 0)) return greedy(s, opts, rng);
  if (rng.randf() < NORMAL_SLIP) return rng.pick(opts);
  const reveal = opts.filter((o) => {
    if (o[0] === RETURN_BUBBLE) return false;
    const bub = s.bubbles[o[0]];
    if (!bub.queue) return false;
    for (let k = o[1] - 1; k >= 0; k--) {
      if (bub.fish[k] < 0) continue;
      return findSlot(s, bub.fish[k]) >= 0;
    }
    return false;
  });
  return greedy(s, reveal.length > 0 ? reveal : opts, rng);
}

export type Player = 'careful' | 'normal' | 'casual';

/**
 * 打一局。player：细心 / 普通 / 随手（见文件头和 peek）。caps 是这局最多能花的道具，按 ITEM_ORDER 轮着花。
 * 迷雾不算（细心的人会等雾散了再点），每次点击只走 0.01 秒（不考限时）
 */
export function play(lv: LevelData, seed: number, player: Player, caps: ItemCaps = NO_ITEMS, slots = 2, rollouts = ROLLOUTS): PlayResult {
  const s = GameState.fromLevel(lv);
  s.openSlots = slots;
  s.bowlOnce = true;
  start(s);
  for (const b of s.bubbles) b.fog = 0;
  const left: Record<Item, number> = { ...caps };
  const used: Item[] = [];
  const taps: Tap[] = [];
  const rng = new Rng(seed * 7919 + 13);
  let next = 0;
  let guard = 0;
  while (s.status === Status.PLAYING && guard++ < MAX_STEPS) {
    if (stuck(s)) {
      let spent = false;
      for (let i = 0; i < ITEM_ORDER.length && !spent; i++) {
        const item = ITEM_ORDER[(next + i) % ITEM_ORDER.length];
        if (left[item] <= 0) continue;
        if (useItem(s, item, seed * 131 + used.length * 17 + 77)) {
          left[item] -= 1;
          used.push(item);
          next = (ITEM_ORDER.indexOf(item) + 1) % ITEM_ORDER.length;
          spent = true;
        }
      }
      if (spent) continue;
    }
    const opts = options(s);
    if (opts.length === 0) break;
    const choice = player === 'careful' ? think(s, opts, seed, rng, rollouts) : player === 'normal' ? peek(s, opts, rng) : greedy(s, opts, rng);
    taps.push([choice[0], choice[1]]);
    step(s, choice);
  }
  return { won: s.status === Status.WON, items: used.length, used, taps };
}

function think(s: GameState, opts: Opt[], seed: number, rng: Rng, rollouts: number): Opt {
  // 同一个气泡里同一种鱼只留一个候选
  const seen = new Set<number>();
  const cands = opts.filter((o) => {
    const k = (o[0] + 1) * 64 + o[2];
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (cands.length === 1) return cands[0];
  let bestScore = -Infinity;
  let bests: Opt[] = [];
  for (const o of cands) {
    let score = 0;
    for (let r = 0; r < rollouts; r++) {
      const c = s.clone();
      step(c, o);
      const left = rollout(c, new Rng(seed * 31 + r * 977 + o[0] * 13 + o[1]));
      score += left === 0 ? 1000 : -left;
    }
    if (score > bestScore) {
      bestScore = score;
      bests = [o];
    } else if (score === bestScore) bests.push(o);
  }
  return greedy(s, bests, rng);
}

/**
 * 打 games 局，返回每局花了几样才过（过不了记 Infinity）。seedBase 换一组不重叠的种子
 */
export function itemsNeeded(lv: LevelData, games: number, player: Player, caps: ItemCaps, seedBase = 0, rollouts = ROLLOUTS): number[] {
  const out: number[] = [];
  for (let g = 0; g < games; g++) {
    const r = play(lv, seedBase + g, player, caps, 2, rollouts);
    out.push(r.won ? r.items : Infinity);
  }
  return out;
}

/** 花不超过 k 样就过关的比例（0–1） */
export function within(needs: readonly number[], k: number): number {
  if (needs.length === 0) return 0;
  return needs.filter((n) => n <= k).length / needs.length;
}
