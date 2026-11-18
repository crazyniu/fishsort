// 每日 / 每周计数。日期序号由调用方传入（自 1970-01-01 起的天数），核心层不读时钟。
import { idiv } from '../util';
import type { DailySave, SaveData } from './save';

export const WEEK_DAYS = 7;

export function fresh(day: number): DailySave {
  return {
    day,
    firstWin: false,
    freeCoin: 0,
    wheelFree: 0,
    wheelAd: 0,
    lifeAd: 0,
    replay: 0,
    toolFree: {},
  };
}

/** day 是自 1970-01-01（周四）起的天数，+3 后整除 7 得到以周一为起点的周序号 */
export function weekOf(day: number): number {
  return idiv(day + 3, WEEK_DAYS);
}

/** 跨天清零每日计数，跨周清零本周过关数、任务积分和已领的任务宝箱。所有每日功能进来先调它（每日任务另由 Tasks.sync 换新） */
export function roll(save: SaveData, day: number): void {
  if ((save.daily.day ?? -1) !== day) save.daily = fresh(day);
  const week = save.week;
  const id = weekOf(day);
  if (week.id !== id) {
    week.id = id;
    week.cleared = 0;
    week.points = 0;
    week.taskClaimed = [];
  }
}
