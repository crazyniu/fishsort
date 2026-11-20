// 规定路线的关卡收紧（docs/02 第 0.4 节，2026-11-19 第二版）。
// 尺子是两个只看屏幕的玩家（solver/players.ts）：
// - 随手点的玩家的过关率 = 难度：一点一点往下压，压到这一关的目标为止
// - 想清楚的玩家的过关率 = 公平：一直守在下限之上（看得见的信息就排得出路线，不用读心）
// 做法：先生成一关能过的，再反复交换两条鱼的种类（每种鱼的数量不变，订单照样凑得齐），
// 只留「想清楚的照样能过、随手点的不更容易」的交换（起点比目标还难时反过来，只留更容易的，放松到目标）。一路上随手点的过关率每到一档（10% 一档）存一份：
// 目标那一档是本体，更容易的几档给连输后的变体和难度调试页（docs/01 9.7）挑。
// 第一版按全知求解器的「容错」收紧，压出来的路线要知道后面第 3、4 缸要什么、要在脑子里推十几步，正常人全输（docs/02 0.2）。
// 纯逻辑，同样的种子出同样的结果。
import { LevelData, Tap } from '../model/levelData';
import { GameState } from '../model/gameState';
import { Rng } from '../rng/rng';
import { start, tap } from '../rules/rules';
import * as Players from '../solver/players';

export interface TightenOptions {
  /** 尺子量出来的过关率压到多少为止（0–1） */
  target: number;
  /** 量难度用哪个玩家（不给 = 随手点的玩家） */
  ruler?: Players.Ruler;
  /** 想清楚的玩家过关率不能低于多少（0–1） */
  thinkFloor: number;
  /** 局内预告几缸（玩家看得到架上的缸之外的几缸） */
  preview: number;
  /** 最多试几次交换 */
  iterations: number;
  seed: number;
  /** 每次量随手点的玩家打几局、尺子打几局、想清楚的玩家打几局 */
  casualGames?: number;
  rulerGames?: number;
  thinkGames?: number;
  /** 一次交换尺子量的过关率最多降几个点（0–1，不给 = 0.12）：一下子掉太多就不要，难度一档一档下来，中间每档都有 */
  maxStep?: number;
  /** 量的时候用哪一组种子（不给 = 0）。同一组种子一直量，挑出来的交换会偏向坑到这几局；接着收的时候换一组 */
  seedBase?: number;
}

export interface Measure {
  /** 尺子量的过关率（难度） */
  level: number;
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
  /** 尺子量的过关率每一档（键 = 百分数，10 一档，向下取整）存的那一份 */
  byPct: Map<number, Snapshot>;
  /** 最后停在哪 */
  last: Snapshot | null;
  tries: number;
  /** 每次交换的去向（看生成慢在哪）：随手点明显往反方向走就没量尺子 / 尺子量了不要 / 想清楚的不够 / 留下 */
  stats: TightenStats;
}

export interface TightenStats {
  skip: number;
  ruler: number;
  think: number;
  kept: number;
}

const copy = (lv: LevelData) => LevelData.fromDict(lv.toDict());

/** 难度刻度：尺子输得越多、随手点的暂存槽塞得越满越难（过关率一样时靠暂存槽给收紧一个方向） */
const hardness = (level: number, peak: number) => (1 - level) * 100 + peak;

const isCasual = (o: TightenOptions) => !o.ruler || o.ruler.kind === 'casual';

/**
 * 难度刻度里暂存槽高峰最多能补多少过关率：hardness = (1 - 过关率) × 100 + 高峰，高峰是平均占几格（不超过暂存槽格数，最多 5），
 * 所以过关率差出 0.06 以上，高峰再怎么差也追不回来
 */
const PEAK_SLACK = 0.06;

/**
 * 量一关；想清楚的玩家明显过不了下限就提前停（返回 null）。thinkSeed：想清楚的玩家这一次用哪组种子——
 * 收紧时每次都换一组：一直用同一组的话，挑出来的交换会偏向「只有这几局想得通」，换种子复量就掉到六七成（2026-11-19 第 273 关）
 */
export function measure(lv: LevelData, o: TightenOptions, casual?: Players.Rate, ruler?: Players.Rate, thinkSeed = o.seedBase ?? 0): Measure | null {
  const opts = { preview: o.preview };
  const c = casual ?? Players.rate(lv, 'casual', o.casualGames ?? 80, opts, o.seedBase ?? 0);
  const r = isCasual(o) ? c : (ruler ?? Players.rulerRate(lv, o.ruler as Players.Ruler, o.rulerGames ?? 40, o.preview, o.seedBase ?? 0));
  const t = Players.rate(lv, 'think', o.thinkGames ?? 10, opts, thinkSeed, o.thinkFloor);
  if (t.win < o.thinkFloor || t.route === null) return null;
  return { level: r.win, casual: c.win, think: t.win, peak: c.peak, route: t.route };
}

export function bucket(rate: number): number {
  return Math.floor(rate * 10 + 1e-9) * 10;
}

export function tighten(start0: LevelData, o: TightenOptions): TightenResult {
  const rng = new Rng(o.seed);
  const lv = copy(start0);
  const byPct = new Map<number, Snapshot>();
  const keep = (m: Measure) => {
    const b = bucket(m.level);
    const old = byPct.get(b);
    // 同一档里想清楚的玩家越稳越好，再看离这一档的中间近不近
    if (!old || m.think > old.m.think || (m.think === old.m.think && Math.abs(m.level * 100 - b - 5) < Math.abs(old.m.level * 100 - b - 5))) {
      byPct.set(b, { lv: copy(lv), m });
    }
  };
  const first = measure(lv, o);
  if (first === null) return { byPct, last: null, tries: 0, stats: { skip: 0, ruler: 0, think: 0, kept: 0 } };
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
  const stats: TightenStats = { skip: 0, ruler: 0, think: 0, kept: 0 };
  // 起点已经比目标难（生成参数偏难）就反过来走：只留「更容易」的交换，放松到目标为止。两头都一档一档走、每档存一份
  const up = cur.level < o.target;
  const reached = () => (up ? cur.level >= o.target : cur.level <= o.target);
  const step = o.maxStep ?? 0.12;
  for (let it = 0; it < o.iterations && spots.length > 1 && !reached(); it++) {
    const [b1, k1] = rng.pick(spots);
    const [b2, k2] = rng.pick(spots);
    const f1 = lv.bubbles[b1].fish[k1];
    const f2 = lv.bubbles[b2].fish[k2];
    if (b1 === b2 || f1 === f2) continue;
    tries++;
    lv.bubbles[b1].fish[k1] = f2;
    lv.bubbles[b2].fish[k2] = f1;
    // 先量便宜的随手点玩家：尺子是想几步的玩家时，随手点的明显变容易了就不用再量尺子（尺子一局要贵几十倍）
    const c = Players.rate(lv, 'casual', o.casualGames ?? 80, { preview: o.preview }, o.seedBase ?? 0);
    let r: Players.Rate | null = c;
    if (!isCasual(o)) {
      // 随手点的明显往反方向走了（收紧时明显变容易、放松时明显变难）就不量尺子
      const wrong = up ? hardness(c.win, c.peak) > hardness(cur.casual, cur.peak) + 3 : hardness(c.win, c.peak) < hardness(cur.casual, cur.peak) - 3;
      // 提前停（2026-11-20 提速，结果不变）：下面只留尺子量的过关率不比现在更容易（收紧时）/ 不比现在更难（放松时）的交换，
      // 暂存槽的高峰最多差 PEAK_SLACK 个百分点的难度刻度。打到一半就已经确定超过这条线的，后面的局不用打了——这次交换反正不要
      const stopAbove = up ? 1 : Math.min(1, cur.level + PEAK_SLACK);
      const stopBelow = up ? Math.max(0, cur.level - PEAK_SLACK) : 0;
      r = wrong ? null : Players.rulerRate(lv, o.ruler as Players.Ruler, o.rulerGames ?? 40, o.preview, o.seedBase ?? 0, stopBelow, stopAbove);
    }
    // 一下子变太多的不要（一步从「大部分能过」跳到「谁都过不去」，就是第一版的毛病），越过目标太多的也不要
    let ok = r !== null;
    if (r !== null) {
      const h = hardness(r.win, c.peak);
      ok = up
        ? h <= hardness(cur.level, cur.peak) && r.win - cur.level <= step && r.win <= o.target + 0.1
        : h >= hardness(cur.level, cur.peak) && cur.level - r.win <= step && r.win >= o.target - 0.1;
    }
    const m: Measure | null = ok && r !== null ? measure(lv, o, c, r, 200000 + (o.seedBase ?? 0) + tries * 131) : null;
    if (r === null) stats.skip++;
    else if (!ok) stats.ruler++;
    else if (m === null) stats.think++;
    else stats.kept++;
    if (m !== null) {
      cur = m;
      keep(m);
    } else {
      lv.bubbles[b1].fish[k1] = f1;
      lv.bubbles[b2].fish[k2] = f2;
    }
  }
  return { byPct, last: byPct.get(bucket(cur.level)) ?? null, tries, stats };
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
