// 星级和首次三星奖励（docs/01 9.5，取代 3.3「三颗星只是庆祝」）。
// ★★★：一个道具都没用（技能、开缸、撤销、提示、复活都算；强制教学那一次不算）；★★：没超过这一种关的两星线；★：超过。
// 每关记最好的星数；这一关第一次拿到三星时多送一份（越难的关送得越多，前 earlyUntil 关少一点）。纯逻辑
import type { EconomyConfig, Species } from '../config';
import type { Rng } from '../rng/rng';
import * as Cards from './cards';
import type { CardResult, SaveData } from './save';
import * as Skills from './skills';

export type Kind = 'normal' | 'hard' | 'boss';

/** 用了 items 个道具拿几颗星 */
export function starsFor(eco: EconomyConfig, kind: Kind, items: number): number {
  if (items <= 0) return 3;
  const line = eco.stars?.twoStarLine[kind] ?? 1;
  return items <= line ? 2 : 1;
}

/** 这一关拿过最好几颗星（没过 = 0） */
export function best(save: SaveData, levelId: number): number {
  return Math.trunc(save.stars?.[String(levelId)] ?? 0);
}

export interface First3 {
  coins: number;
  card: CardResult | null;
  skills: string[];
}

export interface StarResult {
  stars: number;
  /** 这次之前最好几颗 */
  before: number;
  /** 第一次拿到三星时的奖励（已经入账） */
  first3: First3 | null;
}

/** 过关时记星：存最好的；第一次三星发奖励。pool = 已开放册子里的卡，albumOpen = 收藏开放了没有（没开放给卡换成金币里不给卡） */
export function record(save: SaveData, eco: EconomyConfig, levelId: number, kind: Kind, items: number, pool: Species[], rng: Rng, albumOpen: boolean, eased = false): StarResult {
  const stars = Math.min(starsFor(eco, kind, items), eased ? 2 : 3);
  const before = best(save, levelId);
  if (save.stars === undefined) save.stars = {};
  if (stars > before) save.stars[String(levelId)] = stars;
  if (stars < 3 || before >= 3 || !eco.stars) return { stars, before, first3: null };
  const r = eco.stars.first3[kind];
  const coins = levelId <= eco.stars.earlyUntil ? Math.min(r.coins, eco.stars.earlyCoins) : r.coins;
  save.coins += coins;
  const card = r.card && albumOpen && pool.length > 0 ? Cards.give(save, eco, Cards.pick(save, pool, r.card, rng, true)) : null;
  const skills: string[] = [];
  for (let i = 0; i < (r.skill ?? 0); i++) {
    const id = Skills.grantRandom(save, eco, rng);
    if (id) skills.push(id);
  }
  return { stars, before, first3: { coins, card, skills } };
}
