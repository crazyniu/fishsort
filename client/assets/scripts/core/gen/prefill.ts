// 开局占格（docs/01 9.3：第 41 关起的难关、超难关，开局暂存槽里先放 1–2 条后面才用得上的鱼）。
// 从气泡里拿出几条「订单后半段才要」的鱼放进 LevelData.prefill：每种鱼的总数不变，订单照样凑得齐；
// 暂存槽一开局就少了能周转的格子，规定路线要更早想清楚。拿完以后参考解失效，由收紧时想清楚的玩家重新给（tools/level/route.ts）。
// 纯逻辑，同样的种子出同样的结果
import { LevelData } from '../model/levelData';
import { Rng } from '../rng/rng';

/** 拿几条：k；after = 只挑订单里排在这个比例之后才第一次要的鱼种（0–1） */
export function apply(lv: LevelData, k: number, after: number, rng: Rng): boolean {
  if (k <= 0) return false;
  // 每种鱼第一次被要是第几个订单
  const first = new Map<number, number>();
  lv.orders.forEach((o, i) => {
    if (!first.has(o.s)) first.set(o.s, i);
  });
  // 开局就上架的那几缸要的不能放（开局一结算就自己进缸了，等于没占）
  const shelf = lv.bowlSlots;
  const late = Array.from(first.entries())
    .filter(([, i]) => i >= Math.max(shelf, Math.floor(lv.orders.length * after)))
    .map(([sp]) => sp);
  // 后半段才要的种类不够（鱼种少的关每种都来得早）就退到最晚才第一次要的几种
  const order =
    late.length >= k
      ? late
      : Array.from(first.entries())
          .filter(([, i]) => i >= shelf)
          .sort((a, b) => b[1] - a[1])
          .map(([sp]) => sp);
  const picked: number[] = [];
  const pool = order.slice();
  while (picked.length < k && pool.length > 0) {
    const sp = pool.splice(rng.rangeI(0, pool.length - 1), 1)[0];
    // 从哪个气泡拿：至少还剩一条、没有结伴鱼（下标会错位）
    const from = lv.bubbles.filter((b) => b.fish.length >= 2 && b.pairs.length === 0 && b.fish.includes(sp));
    if (from.length === 0) continue;
    const b = rng.pick(from);
    const at = b.fish.lastIndexOf(sp);
    b.fish.splice(at, 1);
    picked.push(sp);
  }
  if (picked.length === 0) return false;
  lv.prefill = picked;
  lv.ref = [];
  return true;
}
