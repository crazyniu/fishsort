// 存档结构与版本迁移，见 docs/04-技术架构.md 第 6 节、docs/meta-api.md。存档就是一个可直接转 JSON 的对象。
import type { EconomyConfig } from '../config';
import { deepCopy, isObject } from '../util';
import * as Album from './album';
import * as Daily from './daily';
import * as DailyChallenge from './dailyChallenge';
import * as Dex from './dex';
import * as HomeBase from './homeBase';
import * as LevelChest from './levelChest';
import * as Lives from './lives';
import * as Skills from './skills';
import * as Wheel from './wheel';
import type { SaveData } from './save';

/** 3：六个海域（家园 5 → 6 个区域、收藏册按海域重分）、每周过关目标代替名次奖励 */
export const VERSION = 3;

export function create(eco: EconomyConfig): SaveData {
  return {
    version: VERSION,
    level: 1,
    coins: 0,
    bestCombo: 0,
    lives: Lives.fresh(eco),
    chest: LevelChest.fresh(),
    wheel: Wheel.fresh(),
    skillsGranted: {},
    tools: { ...eco.toolStart },
    cards: {},
    album: { claimed: [], final: false, frame: false },
    challenge: DailyChallenge.fresh(),
    dex: Dex.fresh(),
    base: HomeBase.fresh(),
    signin: { count: 0, lastDay: -1, doubledDay: -1 },
    week: { id: -1, cleared: 0, claimed: [] },
    daily: Daily.fresh(-1),
    ads: { interstitialAt: -100000.0, interstitialLevel: 0, rewardedAt: -100000.0 },
    seenTips: {},
    fails: { level: 0, count: 0 },
    settings: { sound: true, music: true, vibrate: true },
  };
}

/** 读档后调用：旧版本逐级升级，缺的字段用默认值补齐。会就地修改并返回同一个对象 */
export function migrate(raw: Record<string, unknown>, eco: EconomyConfig): SaveData {
  const save = raw;
  const from = Math.trunc(Number(save.version ?? 0));
  const fresh = create(eco) as unknown as Record<string, unknown>;
  const album = save.album;
  const hadFrame = isObject(album) && 'frame' in album;
  const hadBase = 'base' in save;
  for (const k of Object.keys(fresh)) {
    const fv = fresh[k];
    const sv = save[k];
    if (!(k in save)) {
      save[k] = deepCopy(fv);
    } else if (isObject(fv) && isObject(sv) && k !== 'cards') {
      for (const sub of Object.keys(fv)) if (!(sub in sv)) sv[sub] = deepCopy(fv[sub]);
    }
  }
  const s = save as unknown as SaveData;
  // 头像框是后加的字段：已经领过终极大奖的老存档补上
  if (!hadFrame && s.album.final) s.album.frame = true;
  if (from < 2) migrate1to2(s, save, eco);
  // 鱼票、旧抽卡保底、旧版家园（stars / scene / sceneStep）已经不用了，旧存档里带着的一并清掉。
  // 新家园的星星在 base 里
  for (const dead of ['tickets', 'stars', 'pity', 'scene', 'sceneStep']) delete save[dead];
  if (!hadBase) {
    // 家园上线前的老存档：按已通关数补发星星，建造进度从零开始
    s.base.stars = HomeBase.retroStars(eco, s.level - 1);
  }
  if (from < 3) migrate2to3(s, eco);
  s.version = VERSION;
  return s;
}

/** v1 → v2：金币体系放大 ×5（见 docs/01 第 6 节），鱼票折成金币，补发已到关的技能解锁礼 */
function migrate1to2(s: SaveData, raw: Record<string, unknown>, eco: EconomyConfig): void {
  const m = eco.migration;
  s.coins = Math.trunc(s.coins) * m.coinsMultiplier + Math.trunc(Number(raw.tickets ?? 0)) * m.ticketToCoins;
  // 旧的每日计数结构换新，保留今天是哪天
  s.daily = Daily.fresh(Math.trunc(Number(s.daily.day ?? -1)));
  Skills.syncUnlocks(s, eco);
}

/**
 * v2 → v3：六个海域。
 * - 家园 5 个区域 → 6 个：旧的第 3 区（沉船湾）起往后挪一格，中间插入新的海草森林（未建）。
 * - 收藏册按海域重新分卡：卡还在，旧版「已领册子」只保留按新分法仍然集齐的，其余作废、集齐后可再领。
 * - 排行改为每周过关目标：去掉名次结算字段；本周已有的过关数保留，过关目标从未领开始。
 */
function migrate2to3(s: SaveData, eco: EconomyConfig): void {
  const built = s.base.built;
  if (built.length > 2) built.splice(2, 0, 0);
  s.album.claimed = s.album.claimed.filter((b) => b < Album.books(eco).length && Album.isComplete(s, eco, b));
  const week = s.week as unknown as Record<string, unknown>;
  for (const dead of ['lastId', 'lastCleared', 'paid']) delete week[dead];
  s.week.claimed = [];
}

/** 一次性教学 / 提示有没有看过（键如 skill_blow、TIP_LIVES） */
export function tipSeen(save: SaveData, key: string): boolean {
  return key in (save.seenTips ?? {});
}

export function markTip(save: SaveData, key: string): void {
  if (save.seenTips === undefined) save.seenTips = {};
  save.seenTips[key] = true;
}
