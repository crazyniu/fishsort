// 分享奖励的每日计数，见 docs/01 第 5.8 节。kind: wheel / life / card / help。
// 存档 save.daily.share[kind]。开发阶段分享即成功，接平台后由 Platform 返回成功再调 claim。
import type { EconomyConfig } from '../config';
import type { Rng } from '../rng/rng';
import * as Daily from './daily';
import * as Lives from './lives';
import * as Skills from './skills';
import type { SaveData } from './save';

export interface ShareResult {
  kind: string;
  coins: number;
  life: number;
  wheel: number;
  skill: string;
}

export function remaining(save: SaveData, eco: EconomyConfig, kind: string, day: number): number {
  Daily.roll(save, day);
  const used = save.daily.share[kind] ?? 0;
  return Math.max(eco.share[kind].daily - used, 0);
}

/** 领分享奖励。次数用完返回 null */
export function claim(save: SaveData, eco: EconomyConfig, kind: string, day: number, now: number, rng: Rng): ShareResult | null {
  if (remaining(save, eco, kind, day) <= 0) return null;
  save.daily.share[kind] = (save.daily.share[kind] ?? 0) + 1;
  const rw = eco.share[kind].reward;
  const res: ShareResult = { kind, coins: 0, life: 0, wheel: 0, skill: '' };
  if (rw.coins !== undefined) {
    save.coins += rw.coins;
    res.coins = rw.coins;
  }
  if (rw.life !== undefined) res.life = Lives.add(save, eco, rw.life, now);
  if (rw.wheel !== undefined) {
    save.wheel.extra += rw.wheel;
    res.wheel = rw.wheel;
  }
  if (rw.skill !== undefined) res.skill = Skills.grantRandom(save, eco, rng);
  return res;
}
