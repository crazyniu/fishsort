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

// ---------------------------------------------------------------- 卡藏在关卡里（稀客）

/**
 * 开局先定好这关的宝箱开出什么（docs/01 3.4，用户 2026-11-17：收藏卡要在关卡里出现）。不改存档。
 * 开出卡的关，这只生物「困」在场上的一个气泡里当稀客；过关时 openPlanned 按这里定好的入账，概率、保底和原来的 open 一样。
 */
export interface ChestPlan {
  kind: ChestResult['kind'];
  coins: number;
  skill: string;
  /** 开出卡时是哪一只（稀客），否则空串 */
  cardId: string;
  pity: boolean;
}

export function plan(save: SaveData, eco: EconomyConfig, species: Species[], challenge: boolean, rng: Rng): ChestPlan {
  const cfg = eco.chest;
  const pity = save.chest.dry >= cfg.pityAfter;
  let kind: ChestResult['kind'] = 'card';
  if (!challenge && !pity) {
    const n = cfg.normal;
    const r = rng.rangeI(1, 100);
    if (r <= n.coins) kind = 'coins';
    else if (r <= n.coins + n.skill) kind = 'skill';
  }
  if (kind === 'card' && !Features.isUnlocked(eco, 'album', save.level)) kind = 'coins';
  const out: ChestPlan = { kind, coins: 0, skill: '', cardId: '', pity: false };
  if (kind === 'skill') {
    const pool = Skills.unlockedIds(eco, save.level);
    if (pool.length === 0) out.kind = 'coins';
    else out.skill = rng.pick(pool);
  }
  if (out.kind === 'coins') out.coins = rng.rangeI(cfg.normal.coinMin, cfg.normal.coinMax);
  else if (out.kind === 'card') {
    const boost = challenge ? cfg.challengeRareBoost : 1.0;
    const rarity = Cards.rollRarity(eco, cfg.cardRates, rng, 0, Cards.rank(eco, 'rare'), boost);
    out.cardId = Cards.pick(save, Album.pool(eco, species, save.level), rarity, rng, pity).id;
    out.pity = pity;
  }
  return out;
}

/** 过关时按开局定好的结果入账；保底计数和 open 一样（出卡清零，否则加一） */
export function openPlanned(save: SaveData, eco: EconomyConfig, species: Species[], levelId: number, p: ChestPlan): ChestResult {
  const st = save.chest;
  st.lastLevel = levelId;
  st.adTaken = false;
  const res: ChestResult = { kind: p.kind, coins: 0, skill: '', card: null, pity: p.pity };
  if (p.kind === 'coins') {
    save.coins += p.coins;
    res.coins = p.coins;
  } else if (p.kind === 'skill') {
    Skills.add(save, p.skill);
    res.skill = p.skill;
  } else {
    const sp = species.find((s) => s.id === p.cardId);
    if (sp) res.card = Cards.give(save, eco, sp);
  }
  st.dry = res.kind === 'card' ? 0 : st.dry + 1;
  return res;
}
