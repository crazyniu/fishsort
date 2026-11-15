// 关卡校验：结构不变量 + 回放参考解证明可解。对应 Godot 版 src/core/solver/level_check.gd。
import { MAX_PER_BUBBLE } from '../gen/levelGen';
import { GameState, Status } from '../model/gameState';
import { LevelData } from '../model/levelData';
import { GameEvent, start, tap } from '../rules/rules';

export interface ReplayResult {
  won: boolean;
  /** 暂存峰值 */
  peak: number;
  /** 订单下标 → 该缸在架期间的点击数 */
  steps: Map<number, number>;
}

export function replay(lv: LevelData): ReplayResult {
  const s = GameState.fromLevel(lv);
  const active = new Map<number, number>();
  const steps = new Map<number, number>();
  let peak = 0;
  let events: GameEvent[] = start(s);
  let i = 0;
  for (;;) {
    for (const e of events) {
      if (e.t === 'bowl_in') {
        active.set(e.order as number, 0);
      } else if (e.t === 'bowl_done') {
        steps.set(e.order as number, active.get(e.order as number) as number);
        active.delete(e.order as number);
      }
    }
    peak = Math.max(peak, s.buffer.length);
    if (i >= lv.ref.length || s.status !== Status.PLAYING) break;
    const t = lv.ref[i];
    i += 1;
    events = tap(s, t[0], t[1]);
    // 结伴鱼的第二条已被第一条带走时，这一步是空操作
    if (events.length > 0) for (const [o, n] of active) active.set(o, n + 1);
  }
  return { won: s.status === Status.WON, peak, steps };
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
    for (const dep of b.ice) {
      if (dep === idx || !layer.has(dep)) out.push(`气泡 ${idx} 的冰封依赖非法`);
      else if (lv.bubbles[dep].ice.length > 0) out.push(`气泡 ${idx} 的冰封依赖 ${dep} 自身也被冰封`);
      else if (lv.fieldCap > 0 && dep > idx) out.push(`掉落关里气泡 ${idx} 的冰封依赖 ${dep} 排在它后面，可能永远解不开`);
    }
  }
  if (chainSum > lv.orders.length) out.push(`锁链数字之和 ${chainSum} 超过订单数 ${lv.orders.length}`);
  if (!sameCounts(need, have)) {
    out.push(`各鱼种数量与订单容量不一致: 需要 ${fmt(need)} 实有 ${fmt(have)}`);
  }
  if (out.length === 0 && !replay(lv).won) out.push('参考解回放未通关');
  return out;
}

function sameCounts(a: Map<number, number>, b: Map<number, number>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

function fmt(m: Map<number, number>): string {
  return JSON.stringify(Object.fromEntries([...m].sort((x, y) => x[0] - y[0])));
}
