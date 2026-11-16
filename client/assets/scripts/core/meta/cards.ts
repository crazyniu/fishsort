// 收藏卡的稀有度抽取与入账。宝箱、抽奖、签到共用。
import type { EconomyConfig, Rarity, Species } from '../config';
import type { Rng } from '../rng/rng';
import type { CardResult, SaveData } from './save';

/** 稀有度从低到高，与 economy.json 的 rarities 一致 */
export const ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legend'];

export function rank(eco: EconomyConfig, rarity: string): number {
  return eco.rarities.indexOf(rarity as Rarity);
}

/**
 * 按权重抽稀有度。rates: { 稀有度: 权重 }（可为小数）；minRank 以下的权重视为 0；
 * boostRank 及以上的权重乘 boost（挑战关宝箱）
 */
export function rollRarity(
  eco: EconomyConfig,
  rates: Partial<Record<string, number>>,
  rng: Rng,
  minRank = 0,
  boostRank = 99,
  boost = 1.0,
): Rarity {
  const weights: number[] = [];
  let total = 0.0;
  const order = eco.rarities;
  for (let i = 0; i < order.length; i++) {
    let w = Number(rates[order[i]] ?? 0.0);
    if (i < minRank) w = 0.0;
    else if (i >= boostRank) w *= boost;
    weights.push(w);
    total += w;
  }
  let roll = rng.randf() * total;
  for (let i = 0; i < order.length; i++) {
    roll -= weights[i];
    if (roll < 0.0 && weights[i] > 0.0) return order[i];
  }
  // 浮点误差兜底：取最后一个有权重的
  for (let i = order.length - 1; i >= 0; i--) if (weights[i] > 0.0) return order[i];
  return order[0];
}

/** 从该稀有度里挑一张。preferUnowned 时优先挑没有的，该档集齐则退到任意未拥有，再退到该档任意 */
export function pick(save: SaveData, species: Species[], rarity: string, rng: Rng, preferUnowned = false): Species {
  const cards = save.cards;
  let same = species.filter((sp) => sp.rarity === rarity);
  // 传进来的可能只是已开放册子里的卡（Album.pool）：里面没有这一档时往低一档找，
  // 再没有就从整池挑（传说卡在最后一册，前期抽到传说给史诗）
  let at = ORDER.indexOf(rarity as Rarity);
  while (same.length === 0 && at > 0) {
    at -= 1;
    same = species.filter((sp) => sp.rarity === ORDER[at]);
  }
  if (same.length === 0) same = species;
  if (preferUnowned) {
    let miss = same.filter((sp) => !(sp.id in cards));
    if (miss.length === 0) miss = species.filter((sp) => !(sp.id in cards));
    if (miss.length > 0) return rng.pick(miss);
  }
  return rng.pick(same);
}

/** 入账一张卡：新卡进收藏，重复卡换金币 */
export function give(save: SaveData, eco: EconomyConfig, card: Species): CardResult {
  const cards = save.cards;
  const isNew = !(card.id in cards);
  cards[card.id] = (cards[card.id] ?? 0) + 1;
  const coins = isNew ? 0 : eco.dupeCoins[card.rarity];
  save.coins += coins;
  return { id: card.id, rarity: card.rarity, is_new: isNew, coins };
}
