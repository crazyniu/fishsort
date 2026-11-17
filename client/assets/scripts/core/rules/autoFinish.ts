// 收尾自动入缸（docs/01 第 2 节，用户 2026-11-17）：只剩「无脑点」的最后几个气泡时，不再让玩家一下下去点，自动把鱼送进缸。
// 什么算无脑：
// 1. 后面没有新缸了——还没完成的订单都已经摆在架子上（剩下的鱼正好装满架上的缸，每一条都有地方去）；
// 2. 照规则模拟：每次挑一条能直接进缸的鱼点下去，一直点到赢，中间一条都不进暂存槽。
//    被压住、锁链、冰封、掉落都按规则在模拟里自然解开，所以不另外排除。
// 满足就返回点的顺序；否则返回 null，玩家照常自己点。
import { GameState, RETURN_BUBBLE, Status } from '../model/gameState';
import * as Rules from './rules';

export interface AutoTap {
  b: number;
  k: number;
}

export function plan(s: GameState): AutoTap[] | null {
  if (s.status !== Status.PLAYING) return null;
  if (s.nextOrder < s.orders.length) return null;
  const sim = s.clone();
  const out: AutoTap[] = [];
  // 每一步至少走掉一条鱼，鱼的总数就是步数上限
  let guard = sim.returnFish.length + sim.bubbles.reduce((n, b) => n + b.count(), 0) + 1;
  while (sim.status === Status.PLAYING && guard-- > 0) {
    const next = pick(sim);
    if (next === null) return null;
    const ev = Rules.tap(sim, next.b, next.k);
    if (ev.length === 0 || ev.some((e) => e.t === 'fish_to_buffer' || e.t === 'lose')) return null;
    out.push(next);
  }
  return sim.status === Status.WON ? out : null;
}

/** 下一条能直接进缸的鱼：回流泡里的先，再按气泡、鱼的顺序找 */
function pick(s: GameState): AutoTap | null {
  for (let k = 0; k < s.returnFish.length; k++) if (Rules.findSlot(s, s.returnFish[k]) >= 0) return { b: RETURN_BUBBLE, k };
  for (const b of Rules.openBubbles(s)) {
    const bub = s.bubbles[b];
    for (let k = 0; k < bub.fish.length; k++) {
      const sp = bub.fish[k];
      if (sp < 0 || Rules.findSlot(s, sp) < 0) continue;
      // 结伴鱼：搭档也得有缸收，不然搭档会进暂存槽
      const p = bub.partnerOf(k);
      if (p >= 0 && bub.fish[p] >= 0 && p !== k) {
        const other = bub.fish[p];
        const same = other === sp;
        const slot = Rules.findSlot(s, other);
        if (slot < 0) continue;
        if (same) {
          const bowl = s.slots[slot];
          if (bowl === null || bowl.cap - bowl.count < 2) continue;
        }
      }
      return { b, k };
    }
  }
  return null;
}
