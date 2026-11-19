// 连击目标（docs/01 9.4，取代 3.2 的「连击送收藏卡」掷骰子）：进关时告诉玩家「连击 ×N → 奖励」，诱使他抢快、点错。
// N 从关卡的参考解（想清楚的玩家赢下来的路线）算：按路线走、中间不进暂存槽最长能连几下，取它的 share（约七成半）。
// 知道路线又点得快才够得着。达到就给，每关只在第一次通关时给；普通关给普通卡、难关给更好的卡、超难关给稀有卡，
// 收藏还没开放时换成金币（技能留给首次三星，免得一关送两个技能）。纯逻辑
import type { EconomyConfig, Species } from '../config';
import { longestRun } from '../gen/routeGen';
import type { LevelData } from '../model/levelData';
import type { Rng } from '../rng/rng';
import * as Cards from './cards';
import type { CardResult, SaveData } from './save';

export type GoalKind = 'normal' | 'hard' | 'boss';

/** 这一关的连击目标；没配、新手期、参考解太短返回 0（不出目标） */
export function goalFor(lv: LevelData, eco: EconomyConfig, levelId: number): number {
  const c = eco.comboGoal;
  if (!c || levelId < c.from || lv.ref.length === 0) return 0;
  const run = longestRun(lv, lv.ref);
  const n = Math.min(c.max, Math.floor(run * c.share));
  return n >= c.min ? n : 0;
}

export interface GoalReward {
  /** 收藏开放时给卡（入账结果），否则给金币 */
  card: CardResult | null;
  coins: number;
}

/** 入账：收藏开放给这一档的卡（优先没有的），否则给金币 */
export function grant(save: SaveData, eco: EconomyConfig, kind: GoalKind, pool: Species[], rng: Rng, albumOpen: boolean): GoalReward {
  const r = (eco.comboGoal as NonNullable<EconomyConfig['comboGoal']>).reward[kind];
  if (albumOpen && pool.length > 0) {
    return { card: Cards.give(save, eco, Cards.pick(save, pool, r.card, rng, true)), coins: 0 };
  }
  save.coins += r.coins;
  return { card: null, coins: r.coins };
}
