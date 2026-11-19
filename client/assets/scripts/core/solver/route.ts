// 精确求解器（docs/02 第 0.2 节，2026-11-19「规定路线」）：不靠抽样，把走法穷举一遍（记下算过的局面、剪掉等价的走法），
// 判断一个局面「不用任何道具、不开缸还能不能通关」。在它之上量规定路线的两个数：
// - 容错：暂存槽最少要几格才能赢；关卡给的格数减去它 = 还能犯几次「把鱼放进暂存槽」的错
// - 关键步：在「最少要的格数」下沿路线走，这一步能点的鱼里只有一两种点法还能赢，其余的点了就要多占暂存槽——
//   也就是走偏了、用掉一次容错（容错用完再偏就过不去）。在关卡给的格数下判断的话，容错还有富余时一步都数不出来
// 迷雾不影响规则，求解器当作看得见（「玩家看不见」由生成器另外检查）。不用道具、不复活、不限时。
// 算不完（局面太多，超过 budget）时返回 null，调用方当作「不知道」。
import { GameState, REMOVED, Status } from '../model/gameState';
import type { LevelData, Tap } from '../model/levelData';
import { findSlot, openBubbles, start, tap } from '../rules/rules';

/** 一个局面里所有不等价的点法 */
export function moves(s: GameState): Tap[] {
  const out: Tap[] = [];
  for (const b of openBubbles(s)) {
    const bub = s.bubbles[b];
    if (bub.queue) {
      const k = bub.front();
      if (k >= 0) out.push([b, k]);
      continue;
    }
    // 普通气泡里同一种鱼（没有结伴的）点哪条都一样，只留一条
    const seen = new Set<number>();
    for (let k = 0; k < bub.fish.length; k++) {
      const sp = bub.fish[k];
      if (sp === REMOVED || !bub.canTake(k)) continue;
      if (bub.partnerOf(k) < 0) {
        if (seen.has(sp)) continue;
        seen.add(sp);
      }
      out.push([b, k]);
    }
  }
  return out;
}

/** 局面的指纹：每个气泡还剩哪几条、暂存槽（不管先后）、订单进度和架上的缸。锁链、冰、迷雾、掉落都由这几样推得出来 */
export function key(s: GameState): string {
  let k = '';
  for (const b of s.bubbles) {
    let m = 0;
    for (let i = 0; i < b.fish.length; i++) if (b.fish[i] === REMOVED) m |= 1 << i;
    k += m.toString(36) + ',';
  }
  k += '|' + s.buffer.slice().sort((a, b) => a - b).join(',') + '|' + s.nextOrder;
  for (let i = 0; i < s.openSlots; i++) {
    const bowl = s.slots[i];
    k += bowl === null ? '.' : `${bowl.order}:${bowl.count}`;
  }
  return k;
}

/** 求解器的记忆：同一关、同一个暂存槽格数下算过的局面（true 赢得了 / false 赢不了），可以跨多次查询共用 */
export class Memo {
  readonly known = new Map<string, boolean>();
  /** 一共展开了多少个局面 */
  nodes = 0;
}

/** 点法的先后：先点进得了缸的（能破泡、能露出别的气泡的更先），再点要进暂存槽的（后面的缸要的先放） */
function ordered(s: GameState, list: Tap[]): Tap[] {
  const score = (t: Tap): number => {
    const bub = s.bubbles[t[0]];
    const sp = bub.fish[t[1]];
    let v = 0;
    if (findSlot(s, sp) >= 0) v += 1000;
    if (bub.count() === 1) v += 100;
    else v -= bub.count();
    // 进暂存槽的：订单里越早要它越好
    for (let i = s.nextOrder; i < Math.min(s.orders.length, s.nextOrder + 6); i++) {
      if (s.orders[i].s === sp) {
        v += 50 - (i - s.nextOrder) * 8;
        break;
      }
    }
    return v;
  };
  return list.map((t) => [t, score(t)] as const).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
}

/**
 * 这个局面不用道具还能不能通关。budget 是这一次最多再展开几个局面，超过返回 null（不知道）。
 * win 不为 null 时，赢的时候把这一步之后的走法写进去（从后往前）
 */
export function winnable(s: GameState, memo: Memo, budget = 200000, win: Tap[] | null = null): boolean | null {
  const limit = memo.nodes + budget;
  const go = (st: GameState, path: Tap[] | null): boolean | null => {
    if (st.status === Status.WON) return true;
    if (st.status !== Status.PLAYING) return false;
    const k = key(st);
    const hit = memo.known.get(k);
    if (hit !== undefined && (hit === false || path === null)) return hit;
    if (memo.nodes >= limit) return null;
    memo.nodes++;
    let unknown = false;
    for (const t of ordered(st, moves(st))) {
      const next = st.clone();
      tap(next, t[0], t[1]);
      const r = go(next, path);
      if (r === true) {
        memo.known.set(k, true);
        if (path !== null) path.push(t);
        return true;
      }
      if (r === null) unknown = true;
    }
    if (unknown) return null;
    memo.known.set(k, false);
    return false;
  };
  const r = go(s, win);
  if (win !== null && r === true) win.reverse();
  return r;
}

/** 开局状态（只开关卡给的缸、不用道具），暂存槽可以改格数 */
export function initial(lv: LevelData, bufferCap = lv.buffer): GameState {
  const s = GameState.fromLevel(lv);
  s.bufferCap = bufferCap;
  start(s);
  for (const b of s.bubbles) b.fog = 0;
  return s;
}

/**
 * 按 taps 一步步走，第几步（下标）点完以后就不用道具过不去了——「走错的那一步」（难度调试页的演示用，docs/01 9.7）。
 * 一直过得去返回 -1；算不完的局面当作过得去（只会晚报、不会错报）
 */
export function firstDead(lv: LevelData, taps: readonly Tap[], budget = 20000): number {
  const s = initial(lv);
  const memo = new Memo();
  for (let i = 0; i < taps.length; i++) {
    tap(s, taps[i][0], taps[i][1]);
    if (s.status === Status.LOST) return i;
    if (s.status !== Status.PLAYING) return -1;
    if (winnable(s.clone(), memo, budget) === false) return i;
  }
  return -1;
}

/** 不用道具能不能通关；能的话给出一条走法 */
export function solve(lv: LevelData, budget = 500000, bufferCap = lv.buffer): { ok: boolean | null; taps: Tap[]; nodes: number } {
  const memo = new Memo();
  const taps: Tap[] = [];
  const ok = winnable(initial(lv, bufferCap), memo, budget, taps);
  return { ok, taps: ok === true ? taps : [], nodes: memo.nodes };
}

/**
 * 暂存槽最少要几格才能通关（从关卡给的格数往下试）；一格都不少也赢不了返回关卡的格数 + 1。
 * 少一格算不完（证明「赢不了」很贵）就停在已经证明赢得了的格数上：返回的是上限，容错只会少算、不会多算；
 * 关卡给的格数本身都算不完返回 null
 */
export function minBuffer(lv: LevelData, budget = 500000): number | null {
  let need = lv.buffer + 1;
  for (let cap = lv.buffer; cap >= 0; cap--) {
    const r = solve(lv, budget, cap).ok;
    if (r === null) return cap === lv.buffer ? null : need;
    if (!r) break;
    need = cap;
  }
  return need;
}

export interface RouteReport {
  /** 路线每一步：不等价的点法有几种、其中还能赢的几种（-1 = 算不完） */
  options: number[];
  good: number[];
  /** 关键步：有点了就赢不了的点法，而且还能赢的只有 1–2 种 */
  keySteps: number;
  /** 其中只有 1 种能赢的 */
  forced: number;
  /** 按路线走，暂存槽最多同时占几格；容错 = 关卡的格数 − 它（还能多犯几次「把鱼放进暂存槽」的错） */
  peak: number;
  slack: number;
  /** exact 时：暂存槽最少要几格才能赢（证明「赢不了」很贵，算不完时是上限），否则 null */
  minBuffer: number | null;
  /** 有没有哪一步算不完 */
  unknown: boolean;
  nodes: number;
  /** 量的是哪条路线 */
  route: Tap[];
}

/**
 * 沿着路线（不给就先求一条）量关键步和容错。stepBudget 是每一步每种点法最多展开几个局面。
 * 容错按路线占暂存槽最多的时候算（路线是生成器设计的，这个数直接有）；exact 时再穷举暂存槽最少要几格（慢）
 */
export function analyze(lv: LevelData, route: Tap[] | null = null, stepBudget = 50000, exact = false, cap = lv.buffer): RouteReport {
  const memo = new Memo();
  let path = route;
  if (path === null || path.length === 0) {
    const taps: Tap[] = [];
    if (winnable(initial(lv, cap), memo, stepBudget * 20, taps) !== true) {
      return { options: [], good: [], keySteps: 0, forced: 0, peak: lv.buffer + 1, slack: -1, minBuffer: null, unknown: true, nodes: memo.nodes, route: [] };
    }
    path = taps;
  }
  const s = initial(lv, cap);
  const options: number[] = [];
  const good: number[] = [];
  let keySteps = 0;
  let forced = 0;
  let unknown = false;
  let peak = 0;
  for (const t of path) {
    if (s.status !== Status.PLAYING) break;
    const list = moves(s);
    let ok = 0;
    let dead = 0;
    let unk = false;
    for (const m of list) {
      const next = s.clone();
      tap(next, m[0], m[1]);
      const r = winnable(next, memo, stepBudget);
      if (r === true) ok++;
      else if (r === false) dead++;
      else unk = true;
    }
    options.push(list.length);
    good.push(unk ? -1 : ok);
    if (unk) unknown = true;
    if (dead > 0 && ok >= 1 && ok <= 2) {
      keySteps++;
      if (ok === 1) forced++;
    }
    tap(s, t[0], t[1]);
    peak = Math.max(peak, s.buffer.length);
  }
  const mb = exact ? minBuffer(lv, stepBudget * 20) : null;
  return { options, good, keySteps, forced, peak, slack: lv.buffer - Math.max(peak + 1, cap === lv.buffer ? peak + 1 : cap), minBuffer: mb, unknown, nodes: memo.nodes, route: path };
}

/**
 * 规定路线的两个数（docs/02 第 0.2 节）：先找占暂存槽最少的路线（暂存槽从 1 格往上试，第一个解得开的格数 = 最少要的格数），
 * 再在这个格数下沿路线数关键步。容错 = 关卡给的格数 − 最少要的格数
 */
export function measure(lv: LevelData, budget = 20000, stepBudget = 8000): RouteReport | null {
  for (let cap = 1; cap <= lv.buffer; cap++) {
    const r = solve(lv, budget, cap);
    if (r.ok !== true) continue;
    const rep = analyze(lv, r.taps, stepBudget, false, cap);
    rep.minBuffer = cap;
    rep.slack = lv.buffer - cap;
    return rep;
  }
  return null;
}
