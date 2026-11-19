// 关卡校验：结构不变量 + 回放参考解证明可解（docs/02 第 3、5 节）。
import { MAX_PER_BUBBLE } from '../gen/levelGen';
import { GameState, Status } from '../model/gameState';
import { LevelData, Tap } from '../model/levelData';
import { GameEvent, start, tap } from '../rules/rules';

export interface ReplayResult {
  won: boolean;
  /** 暂存峰值 */
  peak: number;
  /** 订单下标 → 该缸在架期间的点击数 */
  steps: Map<number, number>;
  /** 订单下标 → 该缸在架期间别的缸装满了几个 */
  bowls: Map<number, number>;
  /** 落到场上时依赖泡已经破了（等于没冻）的冰封泡 */
  thawed: number[];
}

/** 回放一串点击（默认是参考解，按关卡默认的缸位数）；slots 指定开几个缸位 */
export function replay(lv: LevelData, taps: readonly Tap[] = lv.ref, slots = lv.bowlSlots): ReplayResult {
  const s = GameState.fromLevel(lv);
  s.openSlots = slots;
  const active = new Map<number, number>();
  const steps = new Map<number, number>();
  const bowls = new Map<number, number>();
  const others = new Map<number, number>();
  let peak = 0;
  const thawed: number[] = [];
  let events: GameEvent[] = start(s);
  let i = 0;
  for (;;) {
    for (const e of events) {
      if (e.t === 'bowl_in') {
        active.set(e.order as number, 0);
        others.set(e.order as number, 0);
      } else if (e.t === 'bowl_done') {
        steps.set(e.order as number, active.get(e.order as number) as number);
        bowls.set(e.order as number, others.get(e.order as number) as number);
        active.delete(e.order as number);
        others.delete(e.order as number);
        for (const [o, n] of others) others.set(o, n + 1);
      } else if (e.t === 'bubble_drop') {
        const b = e.b as number;
        if (lv.bubbles[b].ice.length > 0 && !s.bubbles[b].frozen) thawed.push(b);
      }
    }
    peak = Math.max(peak, s.buffer.length);
    if (i >= taps.length || s.status !== Status.PLAYING) break;
    const t = taps[i];
    i += 1;
    events = tap(s, t[0], t[1]);
    // 结伴鱼的第二条已被第一条带走时，这一步是空操作
    if (events.length > 0) for (const [o, n] of active) active.set(o, n + 1);
  }
  return { won: s.status === Status.WON, peak, steps, bowls, thawed };
}

export function errors(lv: LevelData): string[] {
  const out: string[] = [];
  const need = new Map<number, number>();
  for (const o of lv.orders) need.set(o.s, (need.get(o.s) ?? 0) + o.cap);
  const have = new Map<number, number>();
  const layer = new Map<number, number>();
  let chainSum = 0;
  for (const b of lv.bubbles) layer.set(b.id, b.layer);
  for (let idx = 0; idx < lv.bubbles.length; idx++) {
    const b = lv.bubbles[idx];
    const fish = b.fish;
    if (b.id !== idx) out.push(`气泡 id 与下标不一致: ${idx}`);
    if (fish.length < 1 || fish.length > MAX_PER_BUBBLE) out.push(`气泡 ${idx} 的鱼数 ${fish.length} 不在 1–5`);
    for (const f of fish) {
      if (f < 0 || f >= lv.palette) out.push(`气泡 ${idx} 有非法鱼种 ${f}`);
      have.set(f, (have.get(f) ?? 0) + 1);
    }
    if (lv.fieldCap > 0) {
      if (b.under.length > 0) out.push(`掉落关的气泡 ${idx} 不能压住别的气泡`);
      if (b.layer !== 1) out.push(`掉落关的气泡 ${idx} layer 必须为 1`);
    }
    chainSum += b.chain;
    for (const u of b.under) {
      if (!layer.has(u) || (layer.get(u) as number) >= b.layer) out.push(`气泡 ${idx} 压住了不比它低的气泡 ${u}`);
    }
    if (b.fog < 0) out.push(`气泡 ${idx} 的迷雾计数 ${b.fog} 不能是负数`);
    const iceMax = b.iceAll === true ? 3 : 2;
    if (b.ice.length > iceMax) out.push(`气泡 ${idx} 的冰封依赖有 ${b.ice.length} 个，最多 ${iceMax} 个`);
    for (const dep of b.ice) {
      if (dep === idx || !layer.has(dep)) out.push(`气泡 ${idx} 的冰封依赖非法`);
      else if (lv.bubbles[dep].ice.length > 0) out.push(`气泡 ${idx} 的冰封依赖 ${dep} 自身也被冰封`);
      else if (lv.fieldCap > 0 && dep > idx) out.push(`掉落关里气泡 ${idx} 的冰封依赖 ${dep} 排在它后面，可能永远解不开`);
      else if (lv.fieldCap > 0 && idx < lv.fieldCap && dep >= lv.fieldCap) out.push(`开局在场的冰封泡 ${idx} 依赖的 ${dep} 还在候场`);
    }
  }
  if (chainSum > lv.orders.length) out.push(`锁链数字之和 ${chainSum} 超过订单数 ${lv.orders.length}`);
  if (!sameCounts(need, have)) {
    out.push(`各鱼种数量与订单容量不一致: 需要 ${fmt(need)} 实有 ${fmt(have)}`);
  }
  if (out.length === 0) {
    const rep = replay(lv);
    if (!rep.won) out.push('参考解回放未通关');
    for (const b of rep.thawed) out.push(`冰封泡 ${b} 落到场上时依赖泡已经破了，等于没冻`);
  }
  return out;
}

function sameCounts(a: Map<number, number>, b: Map<number, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

function fmt(m: Map<number, number>): string {
  return JSON.stringify(Object.fromEntries(Array.from(m).sort((x, y) => x[0] - y[0])));
}
