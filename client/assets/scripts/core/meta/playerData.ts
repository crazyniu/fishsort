// 存档结构，见 docs/04-技术架构.md 第 6 节、docs/meta-api.md。存档就是一个可直接转 JSON 的对象。
import type { EconomyConfig } from '../config';
import { deepCopy, isObject } from '../util';
import * as Daily from './daily';
import * as DailyChallenge from './dailyChallenge';
import * as Dex from './dex';
import * as LevelChest from './levelChest';
import * as Lives from './lives';
import * as Tasks from './tasks';
import * as Wheel from './wheel';
import type { SaveData } from './save';

/**
 * 存档结构版本。Cocos 版从 1 开始；现在是测试开发版，不导入任何旧存档（docs/09 第 8 节，用户 2026-11-15 定）。
 * 正式上线后结构再变时才写迁移函数。
 */
export const VERSION = 1;

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
    signin: { count: 0, lastDay: -1, doubledDay: -1 },
    week: { id: -1, cleared: 0, points: 0, taskClaimed: [] },
    tasks: Tasks.fresh(),
    daily: Daily.fresh(-1),
    ads: { interstitialAt: -100000.0, interstitialLevel: 0, rewardedAt: -100000.0 },
    seenTips: {},
    fails: { level: 0, count: 0 },
    settings: { sound: true, music: true, vibrate: true },
  };
}

/**
 * 读档：不是对象、版本不对（包括旧版本）就开新档；版本对就把缺的字段补成默认值（开发中加了字段的存档照样能读）。
 * 不做任何数据换算。会就地修改并返回同一个对象。
 */
export function load(raw: unknown, eco: EconomyConfig): SaveData {
  if (!isObject(raw) || raw.version !== VERSION) return create(eco);
  const fresh = create(eco) as unknown as Record<string, unknown>;
  for (const k of Object.keys(fresh)) {
    const fv = fresh[k];
    const sv = raw[k];
    if (!(k in raw) || (isObject(fv) && !isObject(sv)) || (Array.isArray(fv) && !Array.isArray(sv))) {
      raw[k] = deepCopy(fv);
    } else if (isObject(fv) && isObject(sv) && k !== 'cards') {
      for (const sub of Object.keys(fv)) if (!(sub in sv)) sv[sub] = deepCopy(fv[sub]);
    }
  }
  return raw as unknown as SaveData;
}

/** 一次性教学 / 提示有没有看过（键如 skill_blow、TIP_LIVES） */
export function tipSeen(save: SaveData, key: string): boolean {
  return key in (save.seenTips ?? {});
}

export function markTip(save: SaveData, key: string): void {
  if (save.seenTips === undefined) save.seenTips = {};
  save.seenTips[key] = true;
}

/** 头像换成收藏里的生物：只能选已经拥有的卡；传空串恢复平台头像。成功返回 true（docs/01 5.9） */
export function setAvatar(save: SaveData, cardId: string): boolean {
  if (cardId === '') {
    delete save.avatar;
    return true;
  }
  if (!(save.cards[cardId] > 0)) return false;
  save.avatar = cardId;
  return true;
}

/** 当前头像用的生物 id；空串 = 平台头像 */
export function avatarOf(save: SaveData): string {
  const id = save.avatar ?? '';
  return id && save.cards[id] > 0 ? id : '';
}

