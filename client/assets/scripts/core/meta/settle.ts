// 过关结算。把基础金币、连击金币、首胜、重玩限额、进度推进、技能解锁一次算完。
// 宝箱不在这里开：chest_ok 为 true 时界面层再调 LevelChest.open。
import type { EconomyConfig } from '../config';
import { bestBonusFor } from './combo';
import * as Daily from './daily';
import * as Features from './features';
import * as Lives from './lives';
import * as Skills from './skills';
import * as Tasks from './tasks';
import * as Wheel from './wheel';
import type { SaveData } from './save';

export interface WinArgs {
  level: number;
  challenge: boolean;
  day: number;
  now: number;
  combo_coins?: number;
  best_combo?: number;
}

export interface WinResult {
  rewarded: boolean;
  replay: boolean;
  first_win: boolean;
  coins_base: number;
  coins_combo: number;
  coins_best: number;
  coins: number;
  level_up: boolean;
  new_skills: string[];
  new_features: string[];
  wheel_spin: boolean;
  unlimited: number;
  chest_ok: boolean;
}

export function win(save: SaveData, eco: EconomyConfig, args: WinArgs): WinResult {
  Daily.roll(save, args.day);
  const levelId = args.level;
  const daily = save.daily;
  const replay = levelId < save.level;
  let rewarded = true;
  if (replay) {
    rewarded = daily.replay < eco.replay.rewardedPerDay;
    daily.replay += 1;
  }
  const res: WinResult = {
    rewarded,
    replay,
    first_win: false,
    coins_base: 0,
    coins_combo: 0,
    coins_best: 0,
    coins: 0,
    level_up: false,
    new_skills: [],
    new_features: [],
    wheel_spin: false,
    unlimited: 0,
    chest_ok: rewarded,
  };
  if (rewarded) {
    res.coins_base = args.challenge ? eco.challengeCoins : eco.levelCoins;
    res.coins_combo = Math.trunc(args.combo_coins ?? 0);
    res.coins_best = bestBonusFor(Math.trunc(args.best_combo ?? 0), eco.combo);
    res.coins = res.coins_base + res.coins_combo + res.coins_best;
    save.coins += res.coins;
  }
  if (!daily.firstWin) {
    daily.firstWin = true;
    res.first_win = true;
    res.wheel_spin = true;
    Wheel.addSpins(save, eco.wheel.firstWinSpins);
    res.unlimited = eco.lives.firstWinUnlimitedSeconds;
    Lives.grantUnlimited(save, res.unlimited, args.now);
  }
  // 每日任务「过关」：重玩也算（docs/01 5.9）
  Tasks.add(save, eco, args.day, 'win');
  save.fails = { level: 0, count: 0 };
  if (levelId === save.level) {
    // 本周过关数（好友周榜的分数）只算首次通过，重玩旧关不算
    save.week.cleared += 1;
    const old = save.level;
    save.level = levelId + 1;
    res.level_up = true;
    res.new_features = Features.newlyUnlocked(eco, old, levelId + 1);
    res.new_skills = Skills.syncUnlocks(save, eco);
  }
  return res;
}

/** 看完翻倍广告后调用：把本次结算金币再发一份，返回加了多少 */
export function doubleCoins(save: SaveData, eco: EconomyConfig, result: WinResult): number {
  const extra = result.coins * (eco.adCoinMultiplier - 1);
  save.coins += extra;
  return extra;
}
