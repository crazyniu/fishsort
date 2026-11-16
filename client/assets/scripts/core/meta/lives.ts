// 生命，见 docs/01 第 5.1 节。存档字段 save.lives = { count, stamp, lastNow, unlimitedUntil }。
// 所有函数的 now 是 unix 秒；stamp 是「下一条生命」的计时起点。
import type { EconomyConfig } from '../config';
import { idiv } from '../util';
import * as Daily from './daily';
import type { LivesSave, SaveData } from './save';

export function fresh(eco: EconomyConfig): LivesSave {
  return { count: eco.lives.max, stamp: 0, lastNow: 0, unlimitedUntil: 0 };
}

/** 按时间推进恢复。时间倒退时这段不恢复（计时进度保持不变）。每个入口先调它 */
export function refresh(save: SaveData, eco: EconomyConfig, now: number): void {
  const lv = save.lives;
  const cap = eco.lives.max;
  const step = eco.lives.regenSeconds;
  if (lv.count >= cap) {
    lv.count = cap;
    lv.stamp = now;
  } else {
    if (now < lv.lastNow) {
      const elapsed = Math.max(lv.lastNow - lv.stamp, 0);
      lv.stamp = now - elapsed;
    }
    const gained = Math.max(idiv(now - lv.stamp, step), 0);
    if (gained > 0) {
      lv.count = Math.min(lv.count + gained, cap);
      lv.stamp = lv.stamp + gained * step;
    }
    if (lv.count >= cap) lv.stamp = now;
  }
  lv.lastNow = now;
}

export function count(save: SaveData, eco: EconomyConfig, now: number): number {
  refresh(save, eco, now);
  return save.lives.count;
}

export function isUnlimited(save: SaveData, now: number): boolean {
  return now < save.lives.unlimitedUntil;
}

export function unlimitedLeft(save: SaveData, now: number): number {
  return Math.max(save.lives.unlimitedUntil - now, 0);
}

/** 离下一条还有几秒；已满返回 0 */
export function secondsToNext(save: SaveData, eco: EconomyConfig, now: number): number {
  refresh(save, eco, now);
  const lv = save.lives;
  if (lv.count >= eco.lives.max) return 0;
  return eco.lives.regenSeconds - (now - lv.stamp);
}

/** 能不能开始这一关（前几关、无限生命期间、有命） */
export function canStart(save: SaveData, eco: EconomyConfig, levelId: number, now: number): boolean {
  return levelId <= eco.lives.freeUntilLevel || isUnlimited(save, now) || count(save, eco, now) > 0;
}

/** 失败 / 退出 / 重试时扣 1 条。过关不要调。没走过步、前几关、无限生命期间不扣。返回是否真的扣了 */
export function lose(save: SaveData, eco: EconomyConfig, levelId: number, moved: boolean, now: number): boolean {
  refresh(save, eco, now);
  if (!moved || levelId <= eco.lives.freeUntilLevel || isUnlimited(save, now) || save.lives.count <= 0) {
    return false;
  }
  const lv = save.lives;
  if (lv.count >= eco.lives.max) lv.stamp = now; // 从满命开始计时
  lv.count -= 1;
  return true;
}

/** 直接加命（分享、广告奖励等），不超上限。返回实际增加数 */
export function add(save: SaveData, eco: EconomyConfig, n: number, now: number): number {
  refresh(save, eco, now);
  const lv = save.lives;
  const before = lv.count;
  lv.count = Math.min(before + n, eco.lives.max);
  if (lv.count >= eco.lives.max) lv.stamp = now;
  return lv.count - before;
}

/** 无限生命窗口；已有窗口则往后顺延 */
export function grantUnlimited(save: SaveData, seconds: number, now: number): void {
  const lv = save.lives;
  lv.unlimitedUntil = Math.max(lv.unlimitedUntil, now) + seconds;
}

/** 金币买 1 条。已满或金币不够返回 false */
export function buyOne(save: SaveData, eco: EconomyConfig, now: number): boolean {
  refresh(save, eco, now);
  const price = eco.lives.buyOneCoins;
  if (save.lives.count >= eco.lives.max || save.coins < price) return false;
  save.coins -= price;
  add(save, eco, 1, now);
  return true;
}

/** 金币补满。已满或金币不够返回 false */
export function buyRefill(save: SaveData, eco: EconomyConfig, now: number): boolean {
  refresh(save, eco, now);
  const price = eco.lives.refillCoins;
  if (save.lives.count >= eco.lives.max || save.coins < price) return false;
  save.coins -= price;
  add(save, eco, eco.lives.max, now);
  return true;
}

/** 看广告（rv_life）今天还剩几次 */
export function adLeft(save: SaveData, eco: EconomyConfig, day: number): number {
  Daily.roll(save, day);
  return Math.max((eco.lives.adDaily ?? 0) - save.daily.lifeAd, 0);
}

/** 看完广告得 1 条。满命或今天次数用完返回 false（界面上这时不该出广告按钮） */
export function claimAd(save: SaveData, eco: EconomyConfig, day: number, now: number): boolean {
  if (adLeft(save, eco, day) <= 0) return false;
  refresh(save, eco, now);
  if (save.lives.count >= eco.lives.max) return false;
  save.daily.lifeAd += 1;
  add(save, eco, 1, now);
  return true;
}
