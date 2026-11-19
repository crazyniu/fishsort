// 幸运泡（docs/01 9.3，第 18 关起）：少数关每次进关随机挑一个气泡发金光，里面一条鱼带小奖励（金币、一次免费道具，偶尔一张卡）。
// 只影响多拿多少，不影响能不能过（docs/01 9.1：运气只影响冒不冒险）。每次进关重新抽，同一关重打可能有也可能没有。纯逻辑
import type { EconomyConfig, Species } from '../config';
import { GameState } from '../model/gameState';
import type { Rng } from '../rng/rng';
import * as Cards from './cards';
import type { CardResult, SaveData } from './save';
import * as Skills from './skills';

export interface LuckyPlan {
  bubble: number;
  /** 气泡里第几条鱼带奖励 */
  fish: number;
  kind: 'coins' | 'skill' | 'card';
  coins: number;
  rarity: string;
}

/** 这一局有没有幸运泡、在哪：开局就在场、不是排队泡（排队泡只有排头点得到）、至少 2 条鱼的气泡里挑一个 */
export function plan(s: GameState, eco: EconomyConfig, levelId: number, rng: Rng, albumOpen: boolean): LuckyPlan | null {
  const c = eco.lucky;
  if (!c || levelId < c.from || rng.randf() >= c.chance) return null;
  const cands: number[] = [];
  s.bubbles.forEach((b, i) => {
    if (b.onField && !b.queue && b.fish.length >= 2 && b.pairs.length === 0) cands.push(i);
  });
  if (cands.length === 0) return null;
  const bubble = rng.pick(cands);
  const fish = rng.rangeI(0, s.bubbles[bubble].fish.length - 1);
  const pool = c.rewards.filter((r) => r.kind !== 'card' || albumOpen);
  let roll = rng.randf() * pool.reduce((a, r) => a + r.w, 0);
  let pick = pool[0];
  for (const r of pool) {
    roll -= r.w;
    if (roll < 0) {
      pick = r;
      break;
    }
  }
  return { bubble, fish, kind: pick.kind, coins: pick.coins ?? 0, rarity: pick.rarity ?? 'common' };
}

export interface LuckyGain {
  coins: number;
  skill: string;
  card: CardResult | null;
}

/** 点到那条鱼：入账。技能给一个已解锁的随机技能；卡从已开放的册子里挑 */
export function grant(save: SaveData, eco: EconomyConfig, p: LuckyPlan, pool: Species[], rng: Rng): LuckyGain {
  if (p.kind === 'coins') {
    save.coins += p.coins;
    return { coins: p.coins, skill: '', card: null };
  }
  if (p.kind === 'skill') {
    const id = Skills.grantRandom(save, eco, rng);
    if (id) return { coins: 0, skill: id, card: null };
    save.coins += 10;
    return { coins: 10, skill: '', card: null };
  }
  if (pool.length === 0) {
    save.coins += 10;
    return { coins: 10, skill: '', card: null };
  }
  return { coins: 0, skill: '', card: Cards.give(save, eco, Cards.pick(save, pool, p.rarity, rng, true)) };
}
