// 存档结构，见 docs/meta-api.md。存档就是一个可直接转 JSON 的对象。

export interface LivesSave {
  count: number;
  stamp: number;
  lastNow: number;
  unlimitedUntil: number;
}

export interface DailySave {
  day: number;
  firstWin: boolean;
  freeCoin: number;
  wheelFree: number;
  wheelAd: number;
  /** 看广告得命的次数 */
  lifeAd: number;
  replay: number;
  toolFree: Record<string, boolean>;
  share: Record<string, number>;
}

export interface WeekSave {
  id: number;
  /** 本周首次通过的关卡数（好友周榜的分数） */
  cleared: number;
  /** 本周任务积分 */
  points: number;
  /** 本周已领的任务宝箱档（下标） */
  taskClaimed: number[];
}

/** 每日任务，见 docs/01 第 5.9 节 */
export interface TasksSave {
  day: number;
  /** 今天的任务 id */
  ids: string[];
  /** 每项的进度 */
  prog: Record<string, number>;
  /** 今天已领的每日宝箱档（下标） */
  claimed: number[];
}

export interface SaveData {
  version: number;
  level: number;
  coins: number;
  bestCombo: number;
  lives: LivesSave;
  chest: { dry: number; lastLevel: number; adTaken: boolean };
  wheel: { extra: number; dry: number; total: number };
  skillsGranted: Record<string, boolean>;
  tools: Record<string, number>;
  cards: Record<string, number>;
  album: { claimed: number[]; final: boolean; frame: boolean };
  challenge: { wonDay: number; streak: number; tryDay: number; tries: number };
  dex: { seen: Record<string, number>; claimed: Record<string, number> };
  base: { stars: number; built: number[] };
  signin: { count: number; lastDay: number; doubledDay: number };
  week: WeekSave;
  tasks: TasksSave;
  daily: DailySave;
  ads: { interstitialAt: number; interstitialLevel: number; rewardedAt: number };
  seenTips: Record<string, boolean>;
  fails: { level: number; count: number };
  settings: { sound: boolean; music: boolean; vibrate: boolean; lang?: string };
  /** 头像换成的收藏生物 id；没有 = 用平台头像（docs/01 5.9） */
  avatar?: string;
}

/** 一件奖品（开奖弹窗用） */
export interface Prize {
  kind: 'coin' | 'skill' | 'inf_life' | 'frame' | 'card';
  amount?: number;
  skill?: string;
  combo?: boolean;
  card_id?: string;
  rarity?: string;
  is_new?: boolean;
  dupe_coins?: number;
}

/** 入账一张卡的结果 */
export interface CardResult {
  id: string;
  rarity: string;
  is_new: boolean;
  coins: number;
}
