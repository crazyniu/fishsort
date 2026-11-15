// 配置表的类型。数值只在 assets/resources/config/*.json 里，代码不写死（CLAUDE.md 硬性约束 5）。

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legend';
export type SkillId = 'shuffle' | 'blow' | 'net' | 'current';

export interface Species {
  id: string;
  name: string;
  rarity: Rarity;
  /** 局内出场的 16 种 */
  inLevel?: boolean;
  [k: string]: unknown;
}

/** 一份奖励：金币、每种技能各几个、随机技能几个、无限生命秒数 */
export interface Reward {
  coins?: number;
  tools?: number;
  skills?: number;
  unlimited?: number;
}

export interface Sea {
  id: string;
  /** 用这片海域背景的第一关 */
  levelFrom: number;
}

export interface Book {
  id: number;
  sea?: string;
  unlock: number;
  cards: string[];
  reward: Reward;
}

export interface Area {
  id: string;
  unlock: number;
  /** 每步 [星星, 金币] */
  steps: [number, number][];
  reward: Reward;
}

export interface ComboTier {
  at: number;
  coins: number;
  key: string;
}

export interface ComboConfig {
  windowSeconds: number;
  startAt: number;
  maxCoinsPerLevel: number;
  tiers: ComboTier[];
  cardChance: Record<string, number>;
  bestBonus: { minCombo: number; coinsPerCombo: number; max: number };
}

export interface WheelPrize {
  id: string;
  kind: 'coins' | 'skill' | 'unlimited' | 'card';
  amount?: number;
  rarity?: Rarity;
  weight: number;
}

export interface SignInDay {
  coins?: number;
  wheel?: number;
  skill?: number;
  chest?: { skill: number; card: number };
  bigChest?: { minRarity: Rarity; coins: number; unlimitedSeconds: number };
}

export interface WeeklyGoalTier {
  clears: number;
  reward: Reward;
}

export interface EconomyConfig {
  levelCoins: number;
  challengeCoins: number;
  adCoinMultiplier: number;
  toolStart: Record<string, number>;
  toolPrice: Record<string, number>;
  toolMaxPerLevel: number;
  bowlSlotCoinPrice: number;
  freeBowlSlotAfterFails: number;
  dupeCoins: Record<Rarity, number>;
  freeCoin: { amount: number; daily: number };
  easeAfterFails: number[];
  combo: ComboConfig;
  mechanicIntro: Record<string, string>;
  rarities: Rarity[];
  lives: {
    max: number;
    regenSeconds: number;
    freeUntilLevel: number;
    buyOneCoins: number;
    refillCoins: number;
    firstWinUnlimitedSeconds: number;
    /** 看广告得命，每天几次 */
    adDaily?: number;
  };
  skills: { order: SkillId[]; grantOnUnlock: number; freePerDay: number };
  seas?: Sea[];
  album: { books: Book[]; final: Reward };
  dex: { tiers: number[]; coins: number[] };
  dailyChallenge: {
    levelStep: number;
    retryCoins: number;
    reward: Reward;
    streakDays: number;
    streakReward: Reward;
  };
  weeklyGoal?: { tiers: WeeklyGoalTier[] };
  homeBase: { stars: { level: number; challenge: number; challengeEvery: number }; areas: Area[] };
  features: Record<string, number>;
  chest: {
    normal: { coins: number; skill: number; card: number; coinMin: number; coinMax: number };
    challengeRareBoost: number;
    cardRates: Partial<Record<Rarity, number>>;
    pityAfter: number;
  };
  wheel: {
    freePerDay: number;
    firstWinSpins: number;
    shareSpins: number;
    adPerDay: number;
    coinCost: number;
    tenCost: number;
    tenCount: number;
    tenMinRarity: Rarity;
    pityAfter: number;
    pityMinRarity: Rarity;
    unlimitedSeconds: number;
    prizes: WheelPrize[];
  };
  signInDays: SignInDay[];
  share: Record<string, { daily: number; reward: { coins?: number; life?: number; wheel?: number; skill?: number } }>;
  replay: { rewardedPerDay: number };
}

export interface AdsConfig {
  placements: Record<string, { type: 'rewarded' | 'interstitial' | 'banner' }>;
  interstitial: {
    minLevel: number;
    minSeconds: number;
    minLevelsBetween: number;
    skipAfterRewardedSeconds: number;
  };
}

export interface CurveSegment {
  from: number;
  to: number;
  species: [number, number];
  fish: [number, number];
  cap: [number, number];
  layers: number;
  per: [number, number];
  slack: [number, number];
}

export interface CurveConfig {
  total: number;
  cycle: number;
  fixed?: Record<string, { species: number; fish: number; layers: number; slack: number; per_min?: number; per_max?: number }>;
  segments: CurveSegment[];
  unlock: Record<'chain' | 'timer' | 'fog' | 'ice' | 'big' | 'pairs', number>;
  counts: Record<'chain' | 'timer' | 'fog' | 'ice' | 'big' | 'pairs', number>;
  maxMechanics: number;
  challenge: {
    speciesPlus: [number, number];
    speciesPlusFrom: number;
    fishMul: number;
    fishMax: number;
    capMinus: number;
    capMin: number;
    layersMax: number;
    slackPlus: number;
  };
  ease: { species: number; fish: number; cap: number; slack: number };
  targets: {
    start: number;
    end: number;
    first: number;
    last: number;
    tol: number;
    easyFrom: number;
    tutorialUntil: number;
    challengeDrop: number;
    challengeFloor: number;
  };
  gen: Record<string, number>;
}
