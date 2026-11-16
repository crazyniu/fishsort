// 七日签到，见 docs/01 第 5.6 节。表在 economy.json 的 signInDays。
// 存档 save.signin = { count, lastDay, doubledDay }。断签不清零，按累计天数循环。
import type { EconomyConfig, SignInDay, Species } from '../config';
import type { Rng } from '../rng/rng';
import { deepCopy } from '../util';
import * as Album from './album';
import * as Cards from './cards';
import * as Features from './features';
import * as Lives from './lives';
import * as Skills from './skills';
import * as Wheel from './wheel';
import type { CardResult, SaveData } from './save';

export interface SignInResult {
  index: number;
  coins: number;
  wheel: number;
  skills: string[];
  cards: CardResult[];
  unlimited: number;
  doubled: boolean;
}

export function canClaim(save: SaveData, day: number): boolean {
  return save.signin.lastDay !== day;
}

/** 下一次领的是第几天（0 起，0–6） */
export function nextIndex(save: SaveData, eco: EconomyConfig): number {
  return save.signin.count % eco.signInDays.length;
}

/** 签到。doubled 为 true（看完广告后）奖励翻倍，宝箱多开一个。今天已签返回 null */
export function claim(
  save: SaveData,
  eco: EconomyConfig,
  species: Species[],
  rng: Rng,
  day: number,
  now: number,
  doubled = false,
): SignInResult | null {
  if (!canClaim(save, day)) return null;
  const idx = nextIndex(save, eco);
  save.signin.count += 1;
  save.signin.lastDay = day;
  const res: SignInResult = { index: idx, coins: 0, wheel: 0, skills: [], cards: [], unlimited: 0, doubled: false };
  grant(save, eco, species, rng, now, eco.signInDays[idx], res);
  if (doubled) double(save, eco, species, rng, now, res);
  return res;
}

/** 先签到后看广告的流程：把当天奖励再发一份。每天一次；今天没签或已翻倍返回 null */
export function doubleToday(
  save: SaveData,
  eco: EconomyConfig,
  species: Species[],
  rng: Rng,
  day: number,
  now: number,
  last: SignInResult | null,
): SignInResult | null {
  if (canClaim(save, day) || (save.signin.doubledDay ?? -1) === day || last === null) return null;
  const res = deepCopy(last);
  double(save, eco, species, rng, now, res);
  return res;
}

function double(save: SaveData, eco: EconomyConfig, species: Species[], rng: Rng, now: number, res: SignInResult): void {
  save.signin.doubledDay = save.signin.lastDay;
  res.doubled = true;
  grant(save, eco, species, rng, now, eco.signInDays[res.index], res);
}

function grant(
  save: SaveData,
  eco: EconomyConfig,
  species: Species[],
  rng: Rng,
  now: number,
  cfg: SignInDay,
  res: SignInResult,
): void {
  if (cfg.coins !== undefined) {
    save.coins += cfg.coins;
    res.coins += cfg.coins;
  }
  if (cfg.wheel !== undefined) {
    Wheel.addSpins(save, cfg.wheel);
    res.wheel += cfg.wheel;
  }
  if (cfg.skill !== undefined) {
    for (let i = 0; i < cfg.skill; i++) res.skills.push(Skills.grantRandom(save, eco, rng));
  }
  if (cfg.chest !== undefined) smallChest(save, eco, species, rng, cfg.chest, res);
  if (cfg.bigChest !== undefined) {
    const big = cfg.bigChest;
    const rarity = Cards.rollRarity(eco, eco.chest.cardRates, rng, Cards.rank(eco, big.minRarity));
    card(save, eco, species, rng, rarity, res);
    save.coins += big.coins;
    res.coins += big.coins;
    Lives.grantUnlimited(save, big.unlimitedSeconds, now);
    res.unlimited += big.unlimitedSeconds;
  }
}

/** 第 3 天宝箱：按权重出一个技能或一张卡 */
function smallChest(
  save: SaveData,
  eco: EconomyConfig,
  species: Species[],
  rng: Rng,
  w: { skill: number; card: number },
  res: SignInResult,
): void {
  const skillFirst = rng.rangeI(1, w.skill + w.card) <= w.skill;
  if (skillFirst) {
    const id = Skills.grantRandom(save, eco, rng);
    if (id !== '') {
      res.skills.push(id);
      return;
    }
  }
  const rarity = Cards.rollRarity(eco, eco.chest.cardRates, rng);
  card(save, eco, species, rng, rarity, res);
}

/** 发一张该稀有度的卡；收藏还没开放时换成等值金币（同稀有度重复卡的 dupeCoins） */
function card(save: SaveData, eco: EconomyConfig, species: Species[], rng: Rng, rarity: string, res: SignInResult): void {
  if (!Features.isUnlocked(eco, 'album', save.level)) {
    const coins = eco.dupeCoins[rarity as keyof EconomyConfig['dupeCoins']];
    save.coins += coins;
    res.coins += coins;
    return;
  }
  res.cards.push(Cards.give(save, eco, Cards.pick(save, Album.pool(eco, species, save.level), rarity, rng)));
}
