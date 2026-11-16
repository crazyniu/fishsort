// 一关内的连击计数与奖励，见 docs/01 第 3.2 节。时间由调用方传入，随机数用传入的 Rng。
import type { ComboConfig } from '../config';
import type { Rng } from '../rng/rng';

export interface HitResult {
  count: number;
  /** -1 表示还没到起算数 */
  tier: number;
  tier_up: boolean;
  coins: number;
  card: boolean;
}

export class Combo {
  count = 0;
  best = 0;
  coins = 0;
  cardWon = false;
  private last = -1000.0;

  /** 没命中（鱼进了暂存槽）时断连 */
  miss(): void {
    this.count = 0;
  }

  /** 命中一次。cardsOpen 为 false（收藏还没开放）时不送卡 */
  hit(now: number, cfg: ComboConfig, rng: Rng, cardsOpen = true): HitResult {
    if (now - this.last > cfg.windowSeconds) this.count = 0;
    this.count += 1;
    this.last = now;
    this.best = Math.max(this.best, this.count);
    const res: HitResult = { count: this.count, tier: -1, tier_up: false, coins: 0, card: false };
    if (this.count < cfg.startAt) return res;
    const tiers = cfg.tiers;
    for (let i = 0; i < tiers.length; i++) if (this.count >= tiers[i].at) res.tier = i;
    const tier = tiers[res.tier];
    res.tier_up = tier.at === this.count;
    const gain = Math.min(tier.coins, cfg.maxCoinsPerLevel - this.coins);
    this.coins += gain;
    res.coins = gain;
    const chance = Math.trunc(cfg.cardChance[String(this.count)] ?? 0);
    if (cardsOpen && !this.cardWon && chance > 0 && rng.rangeI(1, 100) <= chance) {
      this.cardWon = true;
      res.card = true;
    }
    return res;
  }

  /** 结算时的最高连击奖 */
  bestBonus(cfg: ComboConfig): number {
    return bestBonusFor(this.best, cfg);
  }
}

export function bestBonusFor(bestCombo: number, cfg: ComboConfig): number {
  const b = cfg.bestBonus;
  if (bestCombo < b.minCombo) return 0;
  return Math.min(bestCombo * b.coinsPerCombo, b.max);
}
