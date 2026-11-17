// 配置表的类型。数值只在 assets/resources/config/*.json 里，代码不写死（CLAUDE.md 硬性约束 5）。

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legend';
export type SkillId = 'shuffle' | 'blow' | 'net' | 'current';

export interface Species {
  id: string;
  name: string;
  rarity: Rarity;
  /** 局内出场的 16 种 */
  inLevel?: boolean;
  /** 身体的主色（从图上量的，去掉描边和高光后的中位色）。选一关的生物时按它算两种之间看着差多少 */
  rgb?: [number, number, number];
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

/** 一项每日任务。mode 为 max 时进度取单次最大值（最高连击），否则累加 */
export interface TaskDef {
  id: string;
  goal: number;
  points: number;
  /** 这项功能开放后才会抽到 */
  feature?: string;
  /** 平台有这项能力才留在池子里（启动时由服务层筛掉） */
  cap?: string;
  mode?: 'max';
}

/** 任务宝箱里的收藏卡：rates 不写就用过关宝箱的概率；minRarity 是最低稀有度 */
export interface TaskCard {
  rates?: Partial<Record<Rarity, number>>;
  minRarity?: Rarity;
  preferUnowned?: boolean;
}

/** 积分进度条上的一档宝箱 */
export interface TaskTier {
  points: number;
  reward?: Reward;
  card?: TaskCard;
}

export interface TasksConfig {
  /** 每天必有的任务 id */
  fixed: string[];
  /** 另外再随机抽几个 */
  random: number;
  /** 每日积分封顶 */
  dayMax: number;
  pool: TaskDef[];
  dayTiers: TaskTier[];
  weekTiers: TaskTier[];
}

export interface EconomyConfig {
  levelCoins: number;
  challengeCoins: number;
  adCoinMultiplier: number;
  toolStart: Record<string, number>;
  toolPrice: Record<string, number>;
  toolMaxPerLevel: number;
  /** 限时关起每关每种技能能多用几次（docs/01 5.2，2026-11-17）：from 关起上限改成 max；没有就一直是 toolMaxPerLevel */
  toolMaxLate?: { from: number; max: number };
  bowlSlotCoinPrice: number;
  freeBowlSlotAfterFails: number;
  dupeCoins: Record<Rarity, number>;
  freeCoin: { amount: number; daily: number };
  easeAfterFails: number[];
  combo: ComboConfig;
  /** 机制说明的文案键：layer / drop / chain / timer / fog / ice / big / pairs → 文案键；哪一关弹跟着 level_curve.json 走 */
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
  tasks?: TasksConfig;
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
  /**
   * 同一关里两种生物的颜色至少差多少（Lab 色差），按关卡号分段：[[起始关, 色差], …]。
   * 前面要求差得很开、一眼分清；越往后允许越接近，靠颜色相近增加难度
   */
  colorGap?: [number, number][];
  unlock: Record<'chain' | 'timer' | 'fog' | 'ice' | 'big' | 'pairs', number>;
  counts: Record<'chain' | 'timer' | 'fog' | 'ice' | 'big' | 'pairs', number>;
  /** 迷雾泡的计数范围 [最少, 最多]：在场后再破几个别的气泡才显形 */
  fogCount: [number, number];
  maxMechanics: number;
  /** 每个周期（挑战关后一关算第 1 关）各关的障碍种数，docs/02 第 2.4 节 */
  rhythm: number[];
  /** 新机制解锁后的 levels 关里有 share 关带它，之后和别的平等轮换 */
  fresh: { levels: number; share: number };
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
    /** 挑战关比普通关低多少：[第一个挑战关, challengeDropUntil 那一关起] 之间线性变化 */
    challengeDrop: [number, number];
    challengeDropUntil: number;
    /** 第 last 关以后的目标：从 end 线性降到 tail.end（第 tail.to 关）；没有就不往后延 */
    tail?: { to: number; end: number };
    challengeFloor: number;
    /** 第 3 缸胜率的区间：下限 2 缸 + plus（2 缸 ≥ easyFrom 时只要不低于 2 缸）；capFrom 关起上限 min(2 缸 + capPlus, cap) */
    bowl3: { plus: number; easyFrom: number; capFrom: number; capPlus: number; cap: number };
    /** 真人校准用的按段平移（分层关 / 掉落关），默认 0 */
    segmentOffset: { layered: number; drop: number };
  };
  /** 机器人计时：每点一次、每满一缸各算几秒（限时缸会超时） */
  bot: { tapSec: number; bowlSec: number };
  /**
   * 限时关（docs/01 第 4 节）：challengeFrom 关起的挑战关整关限时，普通关不限时（2026-11-17 定：每关都限时考的是手速，只留给挑战关）。
   * 时间 = （鱼数 × bot.tapSec + 缸数 × bot.bowlSec）× 系数，按 step 秒取整；系数从 challengeFrom 关的 factor[0] 线性降到 total 关的 factor[1]。
   * 没有这一项就都不限时
   */
  clock?: { challengeFrom: number; factor: [number, number]; step: number; min: number };
  /** 暂存槽几格：[从第几关起, 几格] 的表，没配就是 5 格（docs/02 第 2 节） */
  buffer?: [number, number][];
  /** 限时缸的秒数 = 参考解步数 × bot.tapSec × loose + 途中满缸数 × bot.bowlSec，夹在 [min, max]、取整到 step；参考解里超过 maxSteps 步的缸不限时 */
  timer: { loose: number; min: number; max: number; step: number; maxSteps: number };
  gen: Record<string, number>;
}

/** 界面数值（动画时长、场地、主页装饰），assets/resources/config/game_ui.json */
export interface GameUiConfig {
  fly: { seconds: number; tapPop: number; stagger: number; bufferSeconds: number };
  /** unlockDropAt：开新缸位时缸多久后开始落下（不等满缸送走的演出） */
  bowlDone: { shake: number; swell: number; dropAt: number; dropSeconds: number; unlockDropAt: number };
  praise: { keys: string[]; streakSeconds: number };
  intro: { startDelay: number; batchSize: number; batchGap: number };
  /** 掉落关：气泡破了之后隔多久放下一个 */
  drop: { delay: number };
  /**
   * 气泡堆的重力（game/pile.ts）：重力加速度、速度阻尼、每帧小步数与迭代次数、多慢算停稳、停稳多久后不再算、
   * 多快算一次落地、原本叠着的气泡分开的速度、遮挡的一对最近能靠到设计距离的多少、开局气泡一个接一个放下的间隔、
   * 堆的高度最多占场地高度的多少（放不下就把气泡缩小）
   */
  pile: { gravity: number; damping: number; substeps: number; iterations: number; sleepSpeed: number; sleepTime: number; landSpeed: number; separate: number; linkMin: number; stagger: number; maxHeight: number };
  hint: { tutorialLevels: number; tutorialSeconds: number; seconds: number };
  /** 收尾自动入缸：最后一步之后等多久开始、每条鱼隔多久（秒） */
  autoFinish: { delay: number; interval: number; maxLeft: number };
  /** 限时关的倒计时：剩几秒以内变色、跳动 */
  clock: { warn: number };
  buffer: { warnFree: number; skillNudgeFree: number; rescueSkills: string[] };
  current: { lead: number; stagger: number };
  tips: Record<string, string>;
  tutorial: { delay: number; blowMinBuffer: number; tipGap: number };
  unlockGuide: { delay: number; lockSeconds: number; sparks: number };
  win: Record<string, number | string>;
  /** 场地：…maxRadius 是气泡半径的上限（气泡少的关卡放大到它为止） */
  field: { fill: number; maxScale: number; gap: number; relaxSteps: number; fishMin: number; fishMax: number; layerBoost?: number; radiusSpread?: number; maxRadius: number };
  badgeCap: number;
  homeDeco: { school: [string, number, number, number][] };
}
