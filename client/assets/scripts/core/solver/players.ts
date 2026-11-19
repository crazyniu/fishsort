// 只用「屏幕上看得到的东西」打的两个玩家（docs/02 第 0.2 节，2026-11-19 第二版）。
// 规定路线的难度要满足两头：想清楚的人不用道具能过、随手点的人过不去。两头都只能用玩家看得到的信息——
// 架上的缸、预告里的后面几缸（preview，局内「接下来」小牌的个数）、场上看得见的鱼。
// 更后面要什么、迷雾里是什么、候场的气泡，两个玩家都不知道（第一版的尺子用了全知的求解器，量出来的「规定路线」
// 要读心才走得出来，正常人全输，就是这个原因）。
//
// - 想清楚的玩家（think）：每一步先在脑子里排：只看已知的那几缸，怎么点能把它们全装满、往暂存槽放的鱼最少；
//   按排出来的第一步点，点完再重新排（新露出来的鱼、新上架的缸都会改变计划）。排不出来（已知的缸凑不齐）就退回随手点。
// - 随手点的玩家（casual）：点得到的鱼里有缸要的就点（同种的随便挑一条），没有就把已知的缸里最快要用的那种放进暂存槽，
//   都不要就随便点。slip 的概率不看、随手点一条（真人手快点错）。
// 纯逻辑：同样的关卡、种子、参数出同样的结果。
import { GameState, REMOVED, Status } from '../model/gameState';
import type { LevelData, Tap } from '../model/levelData';
import { Rng } from '../rng/rng';
import { findSlot, openBubbles, start, tap } from '../rules/rules';

export type Kind = 'think' | 'casual';

export interface PlayOptions {
  /** 预告几缸（架上的缸之外还看得到后面几缸要什么） */
  preview: number;
  /** 随手点的玩家每一步有多大概率不看、随手点 */
  slip?: number;
  /** 想清楚的玩家每一步在脑子里最多推几个局面（不给 = THINK_BUDGET） */
  budget?: number;
  /** 暂存槽格数（难度调试页的整体三档会改它），不给用关卡的 */
  bufferCap?: number;
}

export interface PlayResult {
  won: boolean;
  taps: Tap[];
  /** 想清楚的玩家：有几步排不出计划、退回了随手点 */
  fallbacks: number;
  /** 暂存槽最多同时占了几格（赢的局越接近满越险，收紧关卡时当「离输还有多远」的刻度） */
  peak: number;
}

const MAX_STEPS = 600;
/** 想清楚的玩家每一步在脑子里推的局面数上限：够把架上两缸怎么凑排清楚，不够把后面十几步全算到底（那是电脑，不是人） */
export const THINK_BUDGET = 300;
/** 随手点的玩家没有缸要的鱼时，不看、随手点一条的概率 */
export const CASUAL_SLIP = 0.25;

/** 看得见、点得到的走法（迷雾里的不算；同一个气泡里同一种鱼只留一条） */
function visibleMoves(s: GameState): Tap[] {
  const out: Tap[] = [];
  for (const b of openBubbles(s)) {
    const bub = s.bubbles[b];
    if (bub.fog > 0) continue;
    if (bub.queue) {
      const k = bub.front();
      if (k >= 0) out.push([b, k]);
      continue;
    }
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

/** 迷雾里的也算上（看得见的都没有了，只能点雾里的） */
function anyMove(s: GameState): Tap[] {
  const out: Tap[] = [];
  for (const b of openBubbles(s)) {
    const bub = s.bubbles[b];
    for (let k = 0; k < bub.fish.length; k++) if (bub.canTake(k)) out.push([b, k]);
  }
  return out;
}

/** 已知的订单到第几个为止（不含）：架上的缸 + 预告的几缸 */
function horizon(s: GameState, preview: number): number {
  return Math.min(s.orders.length, s.nextOrder + preview);
}

/** 已知的缸里多久以后要这种鱼（0 = 架上的缸就要；不知道 = 99） */
function soon(s: GameState, sp: number, preview: number): number {
  for (let i = 0; i < s.openSlots; i++) {
    const bowl = s.slots[i];
    if (bowl !== null && bowl.species === sp && bowl.count < bowl.cap) return 0;
  }
  const h = horizon(s, preview);
  for (let j = s.nextOrder; j < h; j++) if (s.orders[j].s === sp) return 1 + j - s.nextOrder;
  return 99;
}

function casualPick(s: GameState, rng: Rng, preview: number, slip: number): Tap | null {
  const ms = visibleMoves(s);
  if (ms.length === 0) {
    const all = anyMove(s);
    return all.length > 0 ? rng.pick(all) : null;
  }
  const toBowl = ms.filter(([b, k]) => findSlot(s, s.bubbles[b].fish[k]) >= 0);
  if (toBowl.length > 0) return rng.pick(toBowl);
  if (slip > 0 && rng.randf() < slip) return rng.pick(ms);
  let best: Tap[] = [];
  let bestScore = Infinity;
  for (const m of ms) {
    const sp = s.bubbles[m[0]].fish[m[1]];
    // 暂存槽里已经有同种的先放（凑一对），再看已知的缸里多久要
    const score = soon(s, sp, preview) * 2 - (s.buffer.includes(sp) ? 1 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = [m];
    } else if (score === bestScore) best.push(m);
  }
  return rng.pick(best);
}

/**
 * 想清楚的玩家脑子里的推演：只装已知的这几缸（后面的订单删掉、候场的气泡不落下），
 * 暂存槽最多再放 room 条，能不能把已知的缸全装满。能的话把计划的第一步写进 first
 */
function planWithin(root: GameState, room: number, budget: { left: number }, rng: Rng, first: Tap[]): boolean | null {
  const target = root.orders.length;
  const seen = new Set<string>();
  const go = (s: GameState, used: number): boolean | null => {
    if (s.bowlsDone >= target) return true;
    if (s.status !== Status.PLAYING) return s.status === Status.WON;
    const k = keyOf(s) + '#' + used;
    if (seen.has(k)) return false;
    if (budget.left <= 0) return null;
    budget.left--;
    seen.add(k);
    const ms = visibleMoves(s);
    // 先试能进缸的（顺序打乱：同样好的走法里人会随便挑一种），再试放进暂存槽的
    const bowl: Tap[] = [];
    const buf: Tap[] = [];
    for (const m of ms) (findSlot(s, s.bubbles[m[0]].fish[m[1]]) >= 0 ? bowl : buf).push(m);
    rng.shuffle(bowl);
    rng.shuffle(buf);
    let unknown = false;
    for (const m of bowl) {
      const next = s.clone();
      tap(next, m[0], m[1]);
      const r = go(next, used);
      if (r === true) {
        first.push(m);
        return true;
      }
      if (r === null) unknown = true;
    }
    if (used < room) {
      for (const m of buf) {
        const next = s.clone();
        tap(next, m[0], m[1]);
        const r = go(next, used + 1);
        if (r === true) {
          first.push(m);
          return true;
        }
        if (r === null) unknown = true;
      }
    }
    return unknown ? null : false;
  };
  return go(root, 0);
}

function keyOf(s: GameState): string {
  let k = '';
  for (const b of s.bubbles) {
    let m = 0;
    for (let i = 0; i < b.fish.length; i++) if (b.fish[i] === REMOVED) m |= 1 << i;
    k += m.toString(36) + ',';
  }
  k += '|' + s.buffer.slice().sort((a, b) => a - b).join(',');
  return k;
}

/** 脑子里那一局：后面不知道的订单删掉、候场的不落、迷雾里的不算 */
function imagined(s: GameState, preview: number): GameState {
  const c = s.clone();
  c.orders = c.orders.slice(0, horizon(s, preview));
  c.nextDrop = c.bubbles.length;
  return c;
}

function thinkPick(s: GameState, rng: Rng, preview: number, budget: number, slip: number): { tap: Tap | null; planned: boolean } {
  const ms = visibleMoves(s);
  if (ms.length <= 1) return { tap: ms.length === 1 ? ms[0] : casualPick(s, rng, preview, 0), planned: true };
  // 暂存槽少用为先：先找一格都不占的计划，不行再允许占 1 格、2 格……（最后一格放进去就输，不能用）。
  // 连预告的几缸一起排不出来，就只排架上的缸
  const free = s.bufferCap - 1 - s.buffer.length;
  for (const pv of preview > 0 ? [preview, 0] : [0]) {
    const head = imagined(s, pv);
    const left = { left: budget };
    for (let room = 0; room <= free; room++) {
      const first: Tap[] = [];
      const r = planWithin(head, room, left, rng, first);
      if (r === true) return { tap: first[first.length - 1], planned: true };
      if (r === null) break;
    }
  }
  return { tap: casualPick(s, rng, preview, slip), planned: false };
}

/**
 * 提示道具（docs/01 9.3）：从现在这个局面算下一步该点哪条——就是想清楚的玩家此刻会点的那条（只看屏幕上的信息）。
 * 一条都点不了返回 null
 */
export function hint(s: GameState, preview: number, seed = 1): Tap | null {
  if (s.status !== Status.PLAYING) return null;
  return thinkPick(s, new Rng(seed), preview, THINK_BUDGET, 0).tap;
}

/** 打一局（不用道具、不开缸，只开关卡给的缸） */
export function play(lv: LevelData, kind: Kind, seed: number, o: PlayOptions): PlayResult {
  const s = GameState.fromLevel(lv);
  if (o.bufferCap !== undefined) s.bufferCap = o.bufferCap;
  start(s);
  const rng = new Rng(seed * 7919 + (kind === 'think' ? 17 : 29));
  const taps: Tap[] = [];
  let fallbacks = 0;
  let peak = 0;
  for (let i = 0; i < MAX_STEPS && s.status === Status.PLAYING; i++) {
    let t: Tap | null;
    if (kind === 'think') {
      const r = thinkPick(s, rng, o.preview, o.budget ?? THINK_BUDGET, 0);
      if (!r.planned) fallbacks++;
      t = r.tap;
    } else t = casualPick(s, rng, o.preview, o.slip ?? CASUAL_SLIP);
    if (t === null) break;
    taps.push(t);
    tap(s, t[0], t[1]);
    peak = Math.max(peak, s.buffer.length);
  }
  return { won: s.status === Status.WON, taps, fallbacks, peak };
}

export interface Rate {
  /** 过关率（0–1） */
  win: number;
  /** 暂存槽最多占几格，各局平均 */
  peak: number;
  /** 赢的第一局的走法（没有赢的为 null）：想清楚的玩家赢下来的就是「看得见的信息就走得出来」的参考解 */
  route: Tap[] | null;
}

/** 打 games 局。stopBelow：赢的局数已经不可能到这个比例就提前停（收紧关卡时省时间，返回的过关率是已打的那几局的） */
export function rate(lv: LevelData, kind: Kind, games: number, o: PlayOptions, seedBase = 0, stopBelow = 0): Rate {
  let won = 0;
  let peak = 0;
  let route: Tap[] | null = null;
  let g = 0;
  for (; g < games; g++) {
    const r = play(lv, kind, seedBase + g, o);
    if (r.won) {
      won++;
      if (route === null) route = r.taps;
    }
    peak += r.peak;
    if (stopBelow > 0 && won + (games - g - 1) < stopBelow * games) {
      g++;
      break;
    }
  }
  return { win: won / g, peak: peak / g, route };
}

/**
 * 量难度用的「尺子」（docs/02 第 0.2 节，2026-11-19 第三版）：随手点的玩家（casual，slip = 点错的概率），
 * 或想几步的玩家（think，budget = 每一步在脑子里推几个局面：60 ≈ 会看、会想几步的真人；300 是「想清楚」）
 */
export interface Ruler {
  kind: Kind;
  budget?: number;
  slip?: number;
}

export function rulerRate(lv: LevelData, ruler: Ruler, games: number, preview: number, seedBase = 0): Rate {
  return ruler.kind === 'think' ? rate(lv, 'think', games, { preview, budget: ruler.budget }, seedBase) : rate(lv, 'casual', games, { preview, slip: ruler.slip }, seedBase);
}

export function winRate(lv: LevelData, kind: Kind, games: number, o: PlayOptions, seedBase = 0): number {
  return rate(lv, kind, games, o, seedBase).win;
}
