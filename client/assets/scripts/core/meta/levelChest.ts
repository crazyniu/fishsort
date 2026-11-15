// 过关宝箱，见 docs/01 第 3.4 节。存档 save.chest = { dry, lastLevel, adTaken }。
import type { EconomyConfig, Species } from '../config';
import type { Rng } from '../rng/rng';
import * as Album from './album';
import * as Cards from './cards';
import * as Features from './features';
import * as Skills from './skills';
import type { CardResult, SaveData } from './save';

export interface ChestResult {
  kind: 'coins' | 'skill' | 'card';
  coins: number;
  skill: string;
  /** 没出卡时为 null */
  card: CardResult | null;
  pity: boolean;
}

export function fresh(): SaveData['chest'] {
  return { dry: 0, lastLevel: 0, adTaken: false };
}

/**
 * 开箱并入账。连续 pityAfter 关没出卡，下一关必出一张未拥有的卡。
 * 收藏还没开放（features.album）时不出卡，该出卡的改发安慰金币。
 */
export function open(
  save: SaveData,
  eco: EconomyConfig,
  species: Species[],
  levelId: number,
  challenge: boolean,
  rng: Rng,
): ChestResult {
  const st = save.chest;
  st.lastLevel = levelId;
  st.adTaken = false;
  const res = roll(save, eco, species, challenge, rng, st.dry);
  st.dry = res.kind === 'card' ? 0 : st.dry + 1;
  return res;
}

/** 看广告再开一个，每关一次。没开过本关的箱子或已开过返回 null。不影响保底计数（出卡则清零） */
export function openAd(
  save: SaveData,
  eco: EconomyConfig,
  species: Species[],
  levelId: number,
  challenge: boolean,
  rng: Rng,
): ChestResult | null {
  const st = save.chest;
  if (st.lastLevel !== levelId || st.adTaken) return null;
  st.adTaken = true;
  const res = roll(save, eco, species, challenge, rng, 0);
  if (res.kind === 'card') st.dry = 0;
  return res;
}

function roll(save: SaveData, eco: EconomyConfig, species: Species[], challenge: boolean, rng: Rng, dry: number): ChestResult {
  const cfg = eco.chest;
  const res: ChestResult = { kind: 'coins', coins: 0, skill: '', card: null, pity: false };
  const pity = dry >= cfg.pityAfter;
  let kind: ChestResult['kind'] = 'card';
  if (!challenge && !pity) {
    const n = cfg.normal;
    const r = rng.rangeI(1, 100);
    if (r <= n.coins) kind = 'coins';
    else if (r <= n.coins + n.skill) kind = 'skill';
  }
  if (kind === 'card' && !Features.isUnlocked(eco, 'album', save.level)) kind = 'coins';
  if (kind === 'skill') {
    res.skill = Skills.grantRandom(save, eco, rng);
    if (res.skill === '') kind = 'coins'; // 还没有任何技能开放：改发金币
  }
  if (kind === 'coins') {
    const amount = rng.rangeI(cfg.normal.coinMin, cfg.normal.coinMax);
    save.coins += amount;
    res.coins = amount;
  } else if (kind === 'card') {
    const boost = challenge ? cfg.challengeRareBoost : 1.0;
    const rarity = Cards.rollRarity(eco, cfg.cardRates, rng, 0, Cards.rank(eco, 'rare'), boost);
    const card = Cards.pick(save, Album.pool(eco, species, save.level), rarity, rng, pity);
    res.card = Cards.give(save, eco, card);
    res.pity = pity;
  }
  res.kind = kind;
  return res;
}
