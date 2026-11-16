// 规则状态机，见 docs/01-玩法设计.md 第 2–4 节。
// 所有函数就地修改 state，并返回供表现层播放的事件序列。
import { reshuffle } from '../gen/constructor';
import { Bowl, GameState, LoseReason, MAX_SLOTS, NO_TIMER, RETURN_BUBBLE, REMOVED, Status } from '../model/gameState';
import { Rng } from '../rng/rng';

export const REVIVE_EXTRA_SECONDS = 30.0;

export type EventType =
  | 'fish_to_bowl'
  | 'fish_to_buffer'
  | 'buffer_to_bowl'
  | 'bowl_done'
  | 'bowl_in'
  | 'chain_tick'
  | 'chain_open'
  | 'ice_melt'
  | 'fog_tick'
  | 'fog_clear'
  | 'bubble_pop'
  | 'bubble_drop'
  | 'slot_open'
  | 'net_fish'
  | 'blow'
  | 'shuffle'
  | 'revive'
  | 'win'
  | 'lose';

export interface GameEvent {
  t: EventType;
  b?: number;
  k?: number;
  species?: number;
  slot?: number;
  index?: number;
  cap?: number;
  timer?: number;
  order?: number;
  /** fog_tick：迷雾还差几次显形 */
  left?: number;
  reason?: LoseReason;
}

/** 录制与回放用的操作 */
export type Action =
  | { a: 'tap'; b: number; k: number }
  | { a: 'tick'; dt: number }
  | { a: 'unlock' }
  | { a: 'net'; slot: number }
  | { a: 'blow' }
  | { a: 'shuffle'; seed: number }
  | { a: 'current' }
  | { a: 'revive' };

/** 开局：把订单队列的前几个缸摆上架 */
export function start(s: GameState): GameEvent[] {
  const ev: GameEvent[] = [];
  settle(s, ev);
  return ev;
}

/** 统一入口，便于录制与回放 */
export function apply(s: GameState, action: Action): GameEvent[] {
  switch (action.a) {
    case 'tap':
      return tap(s, action.b, action.k);
    case 'tick':
      return tick(s, action.dt);
    case 'unlock':
      return unlockBowl(s);
    case 'net':
      return useNet(s, action.slot);
    case 'blow':
      return useBlow(s);
    case 'shuffle':
      return useShuffle(s, action.seed);
    case 'current':
      return useCurrent(s);
    case 'revive':
      return revive(s);
  }
  return [];
}

function covered(s: GameState): Set<number> {
  const out = new Set<number>();
  for (const b of s.bubbles) {
    if (b.onField && b.count() > 0) for (const u of b.under) out.add(u);
  }
  return out;
}

export function isOpen(s: GameState, b: number): boolean {
  if (b === RETURN_BUBBLE) return s.returnFish.length > 0;
  const bub = s.bubbles[b];
  if (!bub.onField || bub.count() === 0 || bub.chain > 0 || bub.frozen) return false;
  return !covered(s).has(b);
}

export function openBubbles(s: GameState): number[] {
  const out: number[] = [];
  const cov = covered(s);
  for (let i = 0; i < s.bubbles.length; i++) {
    const bub = s.bubbles[i];
    if (bub.onField && bub.count() > 0 && bub.chain === 0 && !bub.frozen && !cov.has(i)) out.push(i);
  }
  return out;
}

/** 哪个缸收这种鱼；没有返回 -1。多个缸都收时取最左 */
export function findSlot(s: GameState, species: number): number {
  for (let i = 0; i < s.openSlots; i++) {
    const bowl = s.slots[i];
    if (bowl !== null && bowl.species === species && bowl.count < bowl.cap) return i;
  }
  return -1;
}

export function tap(s: GameState, b: number, k: number): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.status !== Status.PLAYING) return ev;
  if (b === RETURN_BUBBLE) {
    if (k < 0 || k >= s.returnFish.length) return ev;
    const sp = s.returnFish[k];
    s.returnFish.splice(k, 1);
    place(s, sp, b, k, ev);
  } else {
    if (b < 0 || b >= s.bubbles.length || !isOpen(s, b)) return ev;
    const bub = s.bubbles[b];
    if (k < 0 || k >= bub.fish.length || bub.fish[k] < 0) return ev;
    const partner = bub.partnerOf(k);
    take(s, b, k, ev);
    // 结伴鱼：第二条紧跟着结算，和普通的鱼一样（有缸进缸，否则进暂存槽；暂存槽放不下才失败）
    if (partner >= 0 && bub.fish[partner] >= 0 && s.status === Status.PLAYING) take(s, b, partner, ev);
    if (bub.count() === 0) pop(s, b, ev);
  }
  finish(s, ev);
  return ev;
}

export function tick(s: GameState, dt: number): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.status !== Status.PLAYING) return ev;
  for (let i = 0; i < s.openSlots; i++) {
    const bowl = s.slots[i];
    if (bowl !== null && bowl.timer !== NO_TIMER) {
      bowl.timer = Math.max(bowl.timer - dt, 0.0);
      if (bowl.timer <= 0.0) {
        lose(s, LoseReason.TIMEOUT, ev);
        return ev;
      }
    }
  }
  return ev;
}

export function unlockBowl(s: GameState): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.status !== Status.PLAYING || s.openSlots >= MAX_SLOTS) return ev;
  s.openSlots += 1;
  ev.push({ t: 'slot_open', slot: s.openSlots - 1 });
  settle(s, ev);
  finish(s, ev);
  return ev;
}

/** 渔网：从场上任意位置捞鱼补满指定缸 */
export function useNet(s: GameState, slot: number): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.status !== Status.PLAYING || slot < 0 || slot >= s.openSlots || s.slots[slot] === null) return ev;
  const bowl = s.slots[slot] as Bowl;
  let k = 0;
  while (k < s.returnFish.length && bowl.count < bowl.cap) {
    if (s.returnFish[k] === bowl.species) {
      s.returnFish.splice(k, 1);
      bowl.count += 1;
      ev.push({ t: 'net_fish', b: RETURN_BUBBLE, k, slot, species: bowl.species });
    } else {
      k += 1;
    }
  }
  // 先捞开放气泡里的，再捞场上其它的，最后捞候场队列里的
  const order = openBubbles(s);
  for (let i = 0; i < s.bubbles.length; i++) {
    if (!order.includes(i) && s.bubbles[i].onField) order.push(i);
  }
  for (let i = 0; i < s.bubbles.length; i++) {
    if (!s.bubbles[i].onField) order.push(i);
  }
  for (const b of order) {
    const bub = s.bubbles[b];
    let taken = false;
    for (let f = 0; f < bub.fish.length; f++) {
      if (bowl.count >= bowl.cap) break;
      if (bub.fish[f] === bowl.species) {
        bub.fish[f] = REMOVED;
        bowl.count += 1;
        taken = true;
        ev.push({ t: 'net_fish', b, k: f, slot, species: bowl.species });
      }
    }
    if (taken && bub.count() === 0) pop(s, b, ev);
  }
  settle(s, ev);
  finish(s, ev);
  return ev;
}

/**
 * 洋流：场上所有能直接进缸的鱼依次自动入缸。每放进一条就重新判断一次，
 * 所以满缸换新缸后，新缸要的鱼也会继续进。发出的就是普通的 fish_to_bowl 等事件。
 */
export function useCurrent(s: GameState): GameEvent[] {
  const ev: GameEvent[] = [];
  while (s.status === Status.PLAYING) {
    const pick = currentTarget(s);
    if (pick === null) break;
    ev.push(...tap(s, pick[0], pick[1]));
  }
  return ev;
}

/** 找下一条能直接进缸的鱼 [气泡, 序号]；结伴鱼只有两条都有地方去时才放行 */
function currentTarget(s: GameState): [number, number] | null {
  for (let k = 0; k < s.returnFish.length; k++) {
    if (findSlot(s, s.returnFish[k]) >= 0) return [RETURN_BUBBLE, k];
  }
  for (const b of openBubbles(s)) {
    const bub = s.bubbles[b];
    for (let k = 0; k < bub.fish.length; k++) {
      const sp = bub.fish[k];
      if (sp < 0 || findSlot(s, sp) < 0) continue;
      const partner = bub.partnerOf(k);
      if (partner >= 0 && bub.fish[partner] >= 0 && !pairFits(s, bub.fish[k], bub.fish[partner])) continue;
      return [b, k];
    }
  }
  return null;
}

function pairFits(s: GameState, a: number, b: number): boolean {
  const slotA = findSlot(s, a);
  const slotB = findSlot(s, b);
  // 第一条入缸若恰好满缸，下一张订单可能是第二条要的，这里保守地不放行
  if (slotB < 0) return false;
  if (slotA === slotB) {
    const bowl = s.slots[slotA] as Bowl;
    return bowl.cap - bowl.count >= 2;
  }
  return true;
}

/** 吹泡：暂存槽的鱼全部回到回流位 */
export function useBlow(s: GameState): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.status !== Status.PLAYING || s.buffer.length === 0) return ev;
  blow(s, ev);
  return ev;
}

/** 洗牌：按当前局面重新构造一个可解的分布（各鱼种数量不变） */
export function useShuffle(s: GameState, seed: number): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.status !== Status.PLAYING) return ev;
  if (reshuffle(s, new Rng(seed))) ev.push({ t: 'shuffle' });
  return ev;
}

export function revive(s: GameState): GameEvent[] {
  const ev: GameEvent[] = [];
  if (s.status !== Status.LOST || s.revived) return ev;
  const reason = s.loseReason;
  s.revived = true;
  s.status = Status.PLAYING;
  s.loseReason = LoseReason.NONE;
  ev.push({ t: 'revive' });
  if (reason === LoseReason.BUFFER_FULL) {
    blow(s, ev);
  } else if (reason === LoseReason.TIMEOUT) {
    for (let i = 0; i < s.openSlots; i++) {
      const bowl = s.slots[i];
      if (bowl !== null && bowl.timer !== NO_TIMER && bowl.timer <= 0.0) bowl.timer = REVIVE_EXTRA_SECONDS;
    }
  } else if (reason === LoseReason.STUCK) {
    for (let i = 0; i < s.bubbles.length; i++) {
      const bub = s.bubbles[i];
      if (bub.chain > 0) {
        bub.chain = 0;
        ev.push({ t: 'chain_open', b: i });
      }
      if (bub.frozen) {
        bub.frozen = false;
        ev.push({ t: 'ice_melt', b: i });
      }
    }
  }
  return ev;
}

function blow(s: GameState, ev: GameEvent[]): void {
  s.returnFish.push(...s.buffer);
  s.buffer = [];
  ev.push({ t: 'blow' });
}

function take(s: GameState, b: number, k: number, ev: GameEvent[]): void {
  const bub = s.bubbles[b];
  const sp = bub.fish[k];
  bub.fish[k] = REMOVED;
  place(s, sp, b, k, ev);
}

function place(s: GameState, sp: number, b: number, k: number, ev: GameEvent[]): void {
  const slot = findSlot(s, sp);
  if (slot >= 0) {
    (s.slots[slot] as Bowl).count += 1;
    ev.push({ t: 'fish_to_bowl', b, k, species: sp, slot });
  } else {
    // 即使溢出也先放进去，保证鱼不丢，复活时一起吹回
    s.buffer.push(sp);
    ev.push({ t: 'fish_to_buffer', b, k, species: sp, index: s.buffer.length - 1 });
    if (s.buffer.length > s.bufferCap) {
      lose(s, LoseReason.BUFFER_FULL, ev);
      return;
    }
  }
  settle(s, ev);
}

/** 满缸送走 → 新缸补位 → 暂存槽自动入缸，循环到稳定 */
function settle(s: GameState, ev: GameEvent[]): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < s.openSlots; i++) {
      const bowl = s.slots[i];
      if (bowl !== null && bowl.count >= bowl.cap) {
        s.slots[i] = null;
        s.bowlsDone += 1;
        ev.push({ t: 'bowl_done', slot: i, species: bowl.species, order: bowl.order });
        for (let bi = 0; bi < s.bubbles.length; bi++) {
          const bub = s.bubbles[bi];
          if (bub.chain > 0) {
            bub.chain -= 1;
            ev.push({ t: bub.chain === 0 ? 'chain_open' : 'chain_tick', b: bi });
          }
        }
        changed = true;
      }
    }
    for (let i = 0; i < s.openSlots; i++) {
      if (s.slots[i] === null && s.nextOrder < s.orders.length) {
        const o = s.orders[s.nextOrder];
        const bowl = new Bowl();
        bowl.species = o.s;
        bowl.cap = o.cap;
        bowl.order = s.nextOrder;
        bowl.timer = o.timer > 0 ? o.timer : NO_TIMER;
        s.slots[i] = bowl;
        s.nextOrder += 1;
        ev.push({ t: 'bowl_in', slot: i, species: bowl.species, cap: bowl.cap, timer: bowl.timer, order: bowl.order });
        changed = true;
      }
    }
    let j = 0;
    while (j < s.buffer.length) {
      const slot = findSlot(s, s.buffer[j]);
      if (slot >= 0) {
        const sp = s.buffer[j];
        s.buffer.splice(j, 1);
        (s.slots[slot] as Bowl).count += 1;
        ev.push({ t: 'buffer_to_bowl', index: j, species: sp, slot });
        changed = true;
      } else {
        j += 1;
      }
    }
  }
}

function pop(s: GameState, b: number, ev: GameEvent[]): void {
  const onField = s.bubbles[b].onField;
  // 还在候场队列里就被渔网捞空的气泡，界面上从没出现过，不发破裂事件也不补落
  if (onField) ev.push({ t: 'bubble_pop', b });
  for (let i = 0; i < s.bubbles.length; i++) {
    const bub = s.bubbles[i];
    if (bub.frozen && bub.ice.includes(b)) {
      bub.frozen = false;
      ev.push({ t: 'ice_melt', b: i });
    }
  }
  if (!onField) return;
  // 迷雾：在场的迷雾泡每见一个别的气泡破掉就淡一层，数到 0 显形（先数再补落，刚落下的不算这一次）
  for (let i = 0; i < s.bubbles.length; i++) {
    const bub = s.bubbles[i];
    if (i === b || bub.fog <= 0 || !bub.onField || bub.count() === 0) continue;
    bub.fog -= 1;
    ev.push(bub.fog === 0 ? { t: 'fog_clear', b: i } : { t: 'fog_tick', b: i, left: bub.fog });
  }
  drop(s, ev);
}

/** 掉落关：场上空出一个位置，候场队列的队头落下 */
function drop(s: GameState, ev: GameEvent[]): void {
  while (s.nextDrop < s.bubbles.length) {
    const i = s.nextDrop;
    s.nextDrop += 1;
    const bub = s.bubbles[i];
    if (bub.count() === 0) continue;
    bub.onField = true;
    // 依赖的气泡任何一个破了就解冻：落下之前已经破了一个的，落下来就不冻
    bub.frozen = bub.ice.length > 0;
    for (const dep of bub.ice) {
      if (s.bubbles[dep].count() === 0) bub.frozen = false;
    }
    ev.push({ t: 'bubble_drop', b: i });
    return;
  }
}

function lose(s: GameState, reason: LoseReason, ev: GameEvent[]): void {
  s.status = Status.LOST;
  s.loseReason = reason;
  ev.push({ t: 'lose', reason });
}

function finish(s: GameState, ev: GameEvent[]): void {
  if (s.status !== Status.PLAYING) return;
  if (s.fishLeft() === 0) {
    s.status = Status.WON;
    ev.push({ t: 'win' });
  } else if (s.buffer.length >= s.bufferCap) {
    lose(s, LoseReason.BUFFER_FULL, ev);
  } else if (s.returnFish.length === 0 && openBubbles(s).length === 0) {
    lose(s, LoseReason.STUCK, ev);
  }
}
