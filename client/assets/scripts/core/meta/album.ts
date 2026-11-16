// 收藏分册，见 docs/01 第 5.0、5.4 节。60 张卡分成 6 册（一册一个海域），每册按关开放；
// 集齐一册领一次册子大奖，全部集齐领终极大奖。册子与奖励在 economy.json 的 album。
import type { Book, EconomyConfig, Reward, Species } from '../config';
import type { Rng } from '../rng/rng';
import * as Lives from './lives';
import * as Skills from './skills';
import type { Prize, SaveData } from './save';

export function books(eco: EconomyConfig): Book[] {
  return eco.album.books;
}

export function isOpen(eco: EconomyConfig, book: number, level: number): boolean {
  return level >= books(eco)[book].unlock;
}

/** 现在能掉落的卡：只出已开放册子里的 */
export function pool(eco: EconomyConfig, species: Species[], level: number): Species[] {
  const open = new Set<string>();
  for (const b of books(eco)) if (level >= b.unlock) for (const id of b.cards) open.add(id);
  let out = species.filter((sp) => open.has(sp.id));
  // 收藏开放前也可能开出卡（连击、宝箱）：按第一册算
  if (out.length === 0) {
    const first = books(eco)[0].cards;
    out = species.filter((sp) => first.includes(sp.id));
  }
  return out;
}

/** 这一册收了几张 */
export function have(save: SaveData, eco: EconomyConfig, book: number): number {
  let n = 0;
  for (const id of books(eco)[book].cards) if (id in save.cards) n++;
  return n;
}

export function isComplete(save: SaveData, eco: EconomyConfig, book: number): boolean {
  return have(save, eco, book) >= books(eco)[book].cards.length;
}

export function isClaimed(save: SaveData, book: number): boolean {
  return save.album.claimed.includes(book);
}

export function canClaim(save: SaveData, eco: EconomyConfig, book: number): boolean {
  return isOpen(eco, book, save.level) && isComplete(save, eco, book) && !isClaimed(save, book);
}

export function canClaimFinal(save: SaveData, eco: EconomyConfig): boolean {
  if (save.album.final) return false;
  for (let i = 0; i < books(eco).length; i++) if (!isComplete(save, eco, i)) return false;
  return true;
}

/** 册子大奖、终极大奖有几个可以领（页签红点的一部分，另一部分是救援记录 Dex.claimable） */
export function claimable(save: SaveData, eco: EconomyConfig): number {
  let n = canClaimFinal(save, eco) ? 1 : 0;
  for (let i = 0; i < books(eco).length; i++) if (canClaim(save, eco, i)) n++;
  return n;
}

/** 领一册的大奖。返回奖品列表（界面开奖用），不能领返回空数组 */
export function claim(save: SaveData, eco: EconomyConfig, book: number, now: number, rng?: Rng): Prize[] {
  if (!canClaim(save, eco, book)) return [];
  save.album.claimed.push(book);
  return grant(save, books(eco)[book].reward, now, eco, rng);
}

/** 专属头像框解锁了吗（领过终极大奖就有） */
export function hasFrame(save: SaveData): boolean {
  return Boolean(save.album.frame);
}

/** 领终极大奖：奖励之外还解锁专属头像框（奖品列表末尾多一项 frame） */
export function claimFinal(save: SaveData, eco: EconomyConfig, now: number, rng?: Rng): Prize[] {
  if (!canClaimFinal(save, eco)) return [];
  save.album.final = true;
  save.album.frame = true;
  const out = grant(save, eco.album.final, now, eco, rng);
  out.push({ kind: 'frame', amount: 1 });
  return out;
}

/**
 * 发一份奖励并返回奖品列表（每日挑战、家园、每周目标也用）。
 * reward: { coins, tools（每种技能各几个）, skills（随机技能几个，要 eco 和 rng）, unlimited（无限生命秒数） }
 */
export function grant(save: SaveData, reward: Reward, now: number, eco?: EconomyConfig, rng?: Rng): Prize[] {
  const out: Prize[] = [];
  const coins = Math.trunc(reward.coins ?? 0);
  if (coins > 0) {
    save.coins += coins;
    out.push({ kind: 'coin', amount: coins });
  }
  const each = Math.trunc(reward.tools ?? 0);
  if (each > 0) {
    const tools = save.tools;
    for (const id of Object.keys(tools)) {
      tools[id] = tools[id] + each;
      out.push({ kind: 'skill', skill: id, amount: each });
    }
  }
  const random = Math.trunc(reward.skills ?? 0);
  if (random > 0) {
    if (eco === undefined || rng === undefined) throw new Error('Album.grant: 随机技能奖励要传 eco 和 rng');
    for (let i = 0; i < random; i++) {
      const id = Skills.grantRandom(save, eco, rng);
      // 一个技能都没解锁时（理论上到不了这里）不发
      if (id !== '') out.push({ kind: 'skill', skill: id, amount: 1 });
    }
  }
  const secs = Math.trunc(reward.unlimited ?? 0);
  if (secs > 0) {
    Lives.grantUnlimited(save, secs, now);
    // 界面上的无限生命奖品按分钟计
    out.push({ kind: 'inf_life', amount: Math.trunc(secs / 60) });
  }
  return out;
}
