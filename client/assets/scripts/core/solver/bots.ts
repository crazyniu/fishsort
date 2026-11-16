// 用来估计难度的机器人，见 docs/02-关卡设计.md 第 2.1、5 节。
// 机器人按真人会遇到的限制来玩：每点一次要花时间（限时缸会超时），看不见没显形的迷雾泡里是什么鱼。
import { Bowl, GameState, NO_TIMER, RETURN_BUBBLE, Status } from '../model/gameState';
import { LevelData, Tap } from '../model/levelData';
import { Rng } from '../rng/rng';
import { findSlot, openBubbles, start, tap, tick } from '../rules/rules';
import { idiv } from '../util';

export const MAX_STEPS = 2000;

export type BotKind = 'greedy' | 'random';

/** 机器人计时：每点一次、每满一缸各算几秒（level_curve.json 的 bot） */
export interface BotClock {
  tapSec: number;
  bowlSec: number;
}
export const DEFAULT_CLOCK: BotClock = { tapSec: 1.5, bowlSec: 1.5 };

/** [气泡, 位置, 鱼种, 该泡剩几条, 是不是没显形的迷雾鱼（1 / 0）] */
type Option = [number, number, number, number, number];

/** slots: 开几个缸位 */
export function play(lv: LevelData, kind: BotKind, rng: Rng, slots: number, clock: BotClock = DEFAULT_CLOCK): boolean {
  return run(lv, kind, rng, slots, [], clock);
}

/** 用贪心机器人找一条 2 缸位、不用道具的通关步骤，找不到返回空数组 */
export function solve(lv: LevelData, tries: number): Tap[] {
  const found = wins(lv, 2, 1, tries);
  return found.length > 0 ? found[0] : [];
}

/** 贪心机器人开 slots 个缸位打 tries 局，收集最多 want 条通关步骤（生成器用来量多开缸位时各缸在架上待多久） */
export function wins(lv: LevelData, slots: number, want: number, tries: number): Tap[][] {
  const out: Tap[][] = [];
  for (let i = 0; i < tries && out.length < want; i++) {
    const taps: Tap[] = [];
    if (run(lv, 'greedy', new Rng(i * 104729 + 31), slots, taps, DEFAULT_CLOCK)) out.push(taps);
  }
  return out;
}

function run(lv: LevelData, kind: BotKind, rng: Rng, slots: number, taps: Tap[], clock: BotClock): boolean {
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
    const ev = tap(s, choice[0], choice[1]);
    // 这一下花掉的时间：点一次 + 途中每满一缸的演出
    let sec = clock.tapSec;
    for (const e of ev) if (e.t === 'bowl_done') sec += clock.bowlSec;
    tick(s, sec);
  }
  return s.status === Status.WON;
}

function options(s: GameState): Option[] {
  const opts: Option[] = [];
  for (let k = 0; k < s.returnFish.length; k++) opts.push([RETURN_BUBBLE, k, s.returnFish[k], 1, 0]);
  for (const b of openBubbles(s)) {
    const bub = s.bubbles[b];
    const left = bub.count();
    const hidden = bub.fog > 0 ? 1 : 0;
    for (let k = 0; k < bub.fish.length; k++) if (bub.fish[k] >= 0) opts.push([b, k, bub.fish[k], left, hidden]);
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
 * 有目标鱼就点（先顾限时缸，再优先快要破的泡），否则点最快用得上的鱼。同分时随机挑，
 * 这样同一关多跑几局能得到胜率而不是非 0 即 100。
 * 没显形的迷雾泡里是什么鱼它不知道：只在没有别的鱼可点时才盲点，点到哪条随机
 */
function greedy(s: GameState, all: Option[], rng: Rng): Option {
  const opts = all.filter((o) => o[4] === 0);
  if (opts.length === 0) return rng.pick(all);
  let best: Option[] = [];
  let bestScore = Infinity;
  for (const o of opts) {
    const sp = o[2];
    let score: number;
    const slot = findSlot(s, sp);
    if (slot >= 0) {
      // 限时缸要的鱼排最前（真人看得见倒计时），其次是快要破的泡
      score = o[3] - ((s.slots[slot] as Bowl).timer !== NO_TIMER ? 10 : 0);
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
/**
 * 胜率百分比。seedBase 换一组不重叠的机器人种子：搜索用 0 起的那一组，验收用另一组（docs/02 第 4 节）
 */
export function rate(lv: LevelData, kind: BotKind, slots: number, runs: number, seedBase = 0, clock: BotClock = DEFAULT_CLOCK): number {
  let wins = 0;
  for (let i = 0; i < runs; i++) if (play(lv, kind, new Rng((seedBase + i) * 7919 + 13), slots, clock)) wins += 1;
  return idiv(wins * 100, runs);
}
