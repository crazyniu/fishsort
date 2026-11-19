// 规定路线的关卡收紧（docs/02 第 0.4 节，2026-11-19）：随机生成的关卡容错都很大（同种的鱼散在很多开着的气泡里，总能绕开），
// 所以先生成一关能过的，再反复交换两条鱼的种类（每种鱼的数量不变，订单照样凑得齐），用精确求解器量，
// 只留「还能过、而且更接近目标」的交换，把容错一格一格压下来。
// 一路上每到一档容错存一份：目标那一档是本体，再松 1、2 格的是连输后换上的两个变体（布局一样、只是更宽松），
// 难度调试页（docs/01 9.7）也从这些档里挑。纯逻辑，同样的种子出同样的结果。
import { LevelData, Tap } from '../model/levelData';
import { Rng } from '../rng/rng';
import { start, tap } from '../rules/rules';
import { GameState } from '../model/gameState';
import * as Route from '../solver/route';

export interface TightenOptions {
  /** 目标容错（暂存槽比最少要的多几格） */
  slack: number;
  /** 关键步希望落在的范围（只是次要目标：先满足容错） */
  keys?: readonly [number, number];
  /** 最多试几次交换 */
  iterations: number;
  seed: number;
  /** 求解器每次最多展开几个局面（找路线 / 沿路线逐步判断） */
  budget?: number;
  stepBudget?: number;
}

export interface Snapshot {
  lv: LevelData;
  rep: Route.RouteReport;
}

export interface TightenResult {
  /** 每一档容错存的那一份（键 = 容错） */
  bySlack: Map<number, Snapshot>;
  /** 最后停在哪：最接近目标的那一份 */
  best: Snapshot | null;
  tries: number;
}

function copy(lv: LevelData): LevelData {
  return LevelData.fromDict(lv.toDict());
}

/**
 * 离目标多远：先看容错，再看关键步；越小越好。容错还没压到目标时，「只有一种点法不走偏」的步越多越好——
 * 给收紧一个方向（不然很多交换容错不变，随便走）
 */
function distance(rep: Route.RouteReport, o: TightenOptions): number {
  let d = Math.abs(rep.slack - o.slack) * 100;
  if (rep.slack > o.slack) return d - Math.min(rep.forced, 50);
  if (o.keys) {
    if (rep.keySteps < o.keys[0]) d += o.keys[0] - rep.keySteps;
    else if (rep.keySteps > o.keys[1]) d += rep.keySteps - o.keys[1];
  }
  return d;
}

export function tighten(start0: LevelData, o: TightenOptions): TightenResult {
  const budget = o.budget ?? 20000;
  const stepBudget = o.stepBudget ?? 6000;
  const rng = new Rng(o.seed);
  const lv = copy(start0);
  const bySlack = new Map<number, Snapshot>();
  const keep = (rep: Route.RouteReport) => {
    const old = bySlack.get(rep.slack);
    if (!old || distance(rep, { ...o, slack: rep.slack }) < distance(old.rep, { ...o, slack: rep.slack })) bySlack.set(rep.slack, { lv: copy(lv), rep });
  };
  let cur = Route.measure(lv, budget, stepBudget);
  if (cur === null) return { bySlack, best: null, tries: 0 };
  keep(cur);
  // 能交换的位置：结伴鱼不动（两条要一起走，换了容易拆散）
  const spots: [number, number][] = [];
  lv.bubbles.forEach((b, bi) => b.fish.forEach((_, k) => {
    if (!b.pairs.some((p) => p.includes(k))) spots.push([bi, k]);
  }));
  let tries = 0;
  for (let it = 0; it < o.iterations && spots.length > 1; it++) {
    if (distance(cur, o) === 0) break;
    const [b1, k1] = rng.pick(spots);
    const [b2, k2] = rng.pick(spots);
    const f1 = lv.bubbles[b1].fish[k1];
    const f2 = lv.bubbles[b2].fish[k2];
    if (b1 === b2 || f1 === f2) continue;
    tries++;
    lv.bubbles[b1].fish[k1] = f2;
    lv.bubbles[b2].fish[k2] = f1;
    const rep = Route.measure(lv, budget, stepBudget);
    // 容错已经比目标还小（太难）也不要
    if (rep !== null && rep.slack >= o.slack && distance(rep, o) <= distance(cur, o)) {
      cur = rep;
      keep(rep);
    } else {
      lv.bubbles[b1].fish[k1] = f1;
      lv.bubbles[b2].fish[k2] = f2;
    }
  }
  let best: Snapshot | null = null;
  for (const s of bySlack.values()) if (best === null || distance(s.rep, o) < distance(best.rep, o)) best = s;
  return { bySlack, best, tries };
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
