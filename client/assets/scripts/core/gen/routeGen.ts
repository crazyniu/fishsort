// 规定路线的关卡收紧（docs/02 第 0.4 节，2026-11-19 第二版）。
// 尺子是两个只看屏幕的玩家（solver/players.ts）：
// - 随手点的玩家的过关率 = 难度：一点一点往下压，压到这一关的目标为止
// - 想清楚的玩家的过关率 = 公平：一直守在下限之上（看得见的信息就排得出路线，不用读心）
// 做法：先生成一关能过的，再反复交换两条鱼的种类（每种鱼的数量不变，订单照样凑得齐），
// 只留「想清楚的照样能过、随手点的不更容易」的交换。一路上随手点的过关率每到一档（10% 一档）存一份：
// 目标那一档是本体，更容易的几档给连输后的变体和难度调试页（docs/01 9.7）挑。
// 第一版按全知求解器的「容错」收紧，压出来的路线要知道后面第 3、4 缸要什么、要在脑子里推十几步，正常人全输（docs/02 0.2）。
// 纯逻辑，同样的种子出同样的结果。
import { LevelData, Tap } from '../model/levelData';
import { GameState } from '../model/gameState';
import { Rng } from '../rng/rng';
import { start, tap } from '../rules/rules';
import * as Players from '../solver/players';

export interface TightenOptions {
  /** 随手点的玩家过关率压到多少为止（0–1） */
  casual: number;
  /** 想清楚的玩家过关率不能低于多少（0–1） */
  thinkFloor: number;
  /** 局内预告几缸（玩家看得到架上的缸之外的几缸） */
  preview: number;
  /** 最多试几次交换 */
  iterations: number;
  seed: number;
  /** 每次量随手点的玩家打几局、想清楚的玩家打几局 */
  casualGames?: number;
  thinkGames?: number;
  /** 一次交换随手点的过关率最多降几个点（0–1，不给 = 0.12）：一下子掉太多就不要，难度一档一档下来，中间每档都有 */
  maxStep?: number;
}

export interface Measure {
  casual: number;
  think: number;
  /** 随手点的玩家暂存槽平均最多占几格（过关率一样时，越高越接近输） */
  peak: number;
  /** 想清楚的玩家赢下来的一条走法（参考解、提示道具用） */
  route: Tap[];
}

export interface Snapshot {
  lv: LevelData;
  m: Measure;
}

export interface TightenResult {
  /** 随手点的玩家过关率每一档（键 = 百分数，10 一档，向下取整）存的那一份 */
  byPct: Map<number, Snapshot>;
  /** 最后停在哪 */
  last: Snapshot | null;
  tries: number;
}

const copy = (lv: LevelData) => LevelData.fromDict(lv.toDict());

/** 难度刻度：随手点的玩家输得越多、暂存槽塞得越满越难（过关率一样时靠暂存槽给收紧一个方向） */
const hardness = (m: { casual: number; peak: number }) => (1 - m.casual) * 100 + m.peak;

/** 量一关；想清楚的玩家明显过不了下限就提前停（返回 null） */
export function measure(lv: LevelData, o: TightenOptions, casual?: Players.Rate): Measure | null {
  const opts = { preview: o.preview };
  const c = casual ?? Players.rate(lv, 'casual', o.casualGames ?? 80, opts);
  const t = Players.rate(lv, 'think', o.thinkGames ?? 10, opts, 0, o.thinkFloor);
  if (t.win < o.thinkFloor || t.route === null) return null;
  return { casual: c.win, think: t.win, peak: c.peak, route: t.route };
}

export function bucket(casual: number): number {
  return Math.floor(casual * 10 + 1e-9) * 10;
}

export function tighten(start0: LevelData, o: TightenOptions): TightenResult {
  const rng = new Rng(o.seed);
  const lv = copy(start0);
  const byPct = new Map<number, Snapshot>();
  const keep = (m: Measure) => {
    const b = bucket(m.casual);
    const old = byPct.get(b);
    // 同一档里想清楚的玩家越稳越好，再看离这一档的中间近不近
    if (!old || m.think > old.m.think || (m.think === old.m.think && Math.abs(m.casual * 100 - b - 5) < Math.abs(old.m.casual * 100 - b - 5))) {
      byPct.set(b, { lv: copy(lv), m });
    }
  };
  const first = measure(lv, o);
  if (first === null) return { byPct, last: null, tries: 0 };
  let cur: Measure = first;
  keep(cur);
  // 能交换的位置：结伴鱼不动（两条要一起走，换了容易拆散）
  const spots: [number, number][] = [];
  lv.bubbles.forEach((b, bi) =>
    b.fish.forEach((_, k) => {
      if (!b.pairs.some((p) => p.includes(k))) spots.push([bi, k]);
    }),
  );
  let tries = 0;
  for (let it = 0; it < o.iterations && spots.length > 1 && cur.casual > o.casual; it++) {
    const [b1, k1] = rng.pick(spots);
    const [b2, k2] = rng.pick(spots);
    const f1 = lv.bubbles[b1].fish[k1];
    const f2 = lv.bubbles[b2].fish[k2];
    if (b1 === b2 || f1 === f2) continue;
    tries++;
    lv.bubbles[b1].fish[k1] = f2;
    lv.bubbles[b2].fish[k2] = f1;
    // 先量便宜的随手点玩家：不更难就不用再量想清楚的玩家
    const c = Players.rate(lv, 'casual', o.casualGames ?? 80, { preview: o.preview });
    // 一下子掉太多的不要（一步从「大部分能过」跳到「谁都过不去」，就是第一版的毛病），压过目标太多的也不要
    const ok: boolean = hardness({ casual: c.win, peak: c.peak }) >= hardness(cur) && cur.casual - c.win <= (o.maxStep ?? 0.12) && c.win >= o.casual - 0.1;
    const m: Measure | null = ok ? measure(lv, o, c) : null;
    if (m !== null) {
      cur = m;
      keep(m);
    } else {
      lv.bubbles[b1].fish[k1] = f1;
      lv.bubbles[b2].fish[k2] = f2;
    }
  }
  return { byPct, last: byPct.get(bucket(cur.casual)) ?? null, tries };
}

/** 按路线走最长能连几下（中间不进暂存槽；暂存槽里的鱼自动补进新缸也算一下），连击目标按它定（docs/01 9.4） */
export function longestRun(lv: LevelData, route: readonly Tap[]): number {
  const s = GameState.fromLevel(lv);
  start(s);
  let run = 0;
  let best = 0;
  for (const t of route) {
    for (const e of tap(s, t[0], t[1])) {
      if (e.t === 'fish_to_bowl' || e.t === 'buffer_to_bowl') best = Math.max(best, ++run);
      else if (e.t === 'fish_to_buffer') run = 0;
    }
  }
  return best;
}
