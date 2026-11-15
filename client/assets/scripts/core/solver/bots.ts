// 用来估计难度的机器人，见 docs/02-关卡设计.md 第 5 节。对应 Godot 版 src/core/solver/bots.gd。
import { GameState, RETURN_BUBBLE, Status } from '../model/gameState';
import { LevelData, Tap } from '../model/levelData';
import { Rng } from '../rng/rng';
import { findSlot, openBubbles, start, tap } from '../rules/rules';
import { idiv } from '../util';

export const MAX_STEPS = 2000;

export type BotKind = 'greedy' | 'random';

/** [气泡, 位置, 鱼种, 该泡剩几条] */
type Option = [number, number, number, number];

/** slots: 开几个缸位 */
export function play(lv: LevelData, kind: BotKind, rng: Rng, slots: number): boolean {
  return run(lv, kind, rng, slots, []);
}

/** 用贪心机器人找一条 2 缸位、不用道具的通关步骤，找不到返回空数组 */
export function solve(lv: LevelData, tries: number): Tap[] {
  for (let i = 0; i < tries; i++) {
    const taps: Tap[] = [];
    if (run(lv, 'greedy', new Rng(i * 104729 + 31), 2, taps)) return taps;
  }
  return [];
}

function run(lv: LevelData, kind: BotKind, rng: Rng, slots: number, taps: Tap[]): boolean {
  const s = GameState.fromLevel(lv);
  s.openSlots = slots;
  start(s);
  let guard = 0;
  while (s.status === Status.PLAYING && guard < MAX_STEPS) {
    guard += 1;
    const opts = options(s);
    if (opts.length === 0) break;
    const choice = kind === 'random' ? rng.pick(opts) : greedy(s, opts, rng);
    taps.push([choice[0], choice[1]]);
    tap(s, choice[0], choice[1]);
  }
  return s.status === Status.WON;
}

function options(s: GameState): Option[] {
  const opts: Option[] = [];
  for (let k = 0; k < s.returnFish.length; k++) opts.push([RETURN_BUBBLE, k, s.returnFish[k], 1]);
  for (const b of openBubbles(s)) {
    const bub = s.bubbles[b];
    const left = bub.count();
    for (let k = 0; k < bub.fish.length; k++) if (bub.fish[k] >= 0) opts.push([b, k, bub.fish[k], left]);
  }
  return opts;
}

/** 贪心机器人在当前局面下点哪条；没得点返回 null（调试自动玩用） */
export function nextTap(s: GameState, rng: Rng): Tap | null {
  const opts = options(s);
  if (opts.length === 0) return null;
  const choice = greedy(s, opts, rng);
  return [choice[0], choice[1]];
}

/**
 * 有目标鱼就点（优先快要破的泡），否则点最快用得上的鱼。同分时随机挑，
 * 这样同一关多跑几局能得到胜率而不是非 0 即 100
 */
function greedy(s: GameState, opts: Option[], rng: Rng): Option {
  let best: Option[] = [];
  let bestScore = Infinity;
  for (const o of opts) {
    const sp = o[2];
    let score: number;
    if (findSlot(s, sp) >= 0) {
      score = o[3];
    } else {
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
    } else if (score === bestScore) {
      best.push(o);
    }
  }
  return rng.pick(best);
}

/** 胜率百分比 */
export function rate(lv: LevelData, kind: BotKind, slots: number, runs: number): number {
  let wins = 0;
  for (let i = 0; i < runs; i++) if (play(lv, kind, new Rng(i * 7919 + 13), slots)) wins += 1;
  return idiv(wins * 100, runs);
}
