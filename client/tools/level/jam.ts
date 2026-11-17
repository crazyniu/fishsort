// 排队泡关卡的生成和验收（docs/02 第 0 节，2026-11-18）。gen.ts / verify.ts / probe.ts 共用。
//
// 难度 = 「普通玩家机器人花不超过 k 样（技能或开缸）就过关的比例」，k = 0, 1, 2…（core/solver/careful.ts）。
// 用户试玩校准过：细心玩家机器人比真人强得多（第 140 关它不花 67%，用户不花根本过不去），普通玩家机器人和用户对得上。
// 生成：按难度曲线的参数生成候选（排队泡 + 只打乱后面一段），细心玩家机器人找一条不花道具的参考解（关卡必须可解），
// 再量普通玩家机器人；离目标远就调打乱比例再生成，取最接近的。
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CurveConfig, EconomyConfig, JamKind } from '../../assets/scripts/core/config';
import * as LevelCurve from '../../assets/scripts/core/gen/levelCurve';
import { generate } from '../../assets/scripts/core/gen/levelGen';
import { LevelData, Tap } from '../../assets/scripts/core/model/levelData';
import * as Careful from '../../assets/scripts/core/solver/careful';

const CLIENT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const curve = JSON.parse(readFileSync(join(CLIENT, 'assets/resources/config/level_curve.json'), 'utf8')) as CurveConfig;
const eco = JSON.parse(readFileSync(join(CLIENT, 'assets/resources/config/economy.json'), 'utf8')) as EconomyConfig;

/** 量普通玩家机器人打几局（它不推演，一局几毫秒） */
export const NORMAL_GAMES = 200;
/** 量随手玩家打几局 */
export const CASUAL_GAMES = 200;
/** 找参考解时普通玩家先打几局 */
export const QUICK_GAMES = 60;
/** 普通玩家打不过时细心玩家再打几局 */
export const SOLVE_GAMES = 4;
/** 量细心玩家（只进报告）打几局 */
export const CAREFUL_GAMES = 8;
/** 每一轮试几个种子 */
const SEEDS = 3;
/** 最多调几轮打乱比例 */
const ROUNDS = 7;
/** 打乱比例的上下限 */
const SHARE_MIN = 0;
const SHARE_MAX = 0.6;

/** 这一关一局最多能花的道具：洗牌、吹泡、渔网按每关上限（economy.json 的 toolMaxPerLevel / toolMaxLate），开缸 2 次 */
export function capsFor(id: number): Careful.ItemCaps {
  const late = eco.toolMaxLate;
  const n = late && id >= late.from ? late.max : eco.toolMaxPerLevel;
  return { shuffle: n, bowl: 2, blow: n, net: n };
}

/**
 * 找一条不花道具的通关步骤（关卡必须可解），找不到返回空数组。先让普通玩家打（快），打不过再让细心玩家打
 */
export function solveCareful(lv: LevelData): Tap[] {
  for (let g = 0; g < QUICK_GAMES; g++) {
    const r = Careful.play(lv, 8000 + g, 'normal');
    if (r.won) return r.taps;
  }
  for (let g = 0; g < SOLVE_GAMES; g++) {
    const r = Careful.play(lv, 9000 + g, 'careful');
    if (r.won) return r.taps;
  }
  return [];
}

export interface Measure {
  /** 普通玩家花不超过 k 样过关的比例，k = 0…6 */
  normal: number[];
  casual: number[];
}

const KS = [0, 1, 2, 3, 4, 5, 6];

/** casual = false 时不量随手玩家（生成时只拿普通玩家比目标，挑中了再补量随手玩家进报告） */
export function measure(lv: LevelData, id: number, seedBase = 0, casual = true): Measure {
  const caps = capsFor(id);
  const n = Careful.itemsNeeded(lv, NORMAL_GAMES, 'normal', caps, seedBase);
  const c = casual ? Careful.itemsNeeded(lv, CASUAL_GAMES, 'casual', caps, seedBase) : [];
  return { normal: KS.map((k) => Careful.within(n, k)), casual: KS.map((k) => Careful.within(c, k)) };
}

/** 细心玩家不花道具的过关比例（慢，只进报告） */
export function carefulRate(lv: LevelData, games = CAREFUL_GAMES): number {
  let w = 0;
  for (let g = 0; g < games; g++) if (Careful.play(lv, 7000 + g, 'careful').won) w++;
  return w / games;
}

/**
 * 离目标多远：正 = 偏易（该多打乱），负 = 偏难。miss 是超出容差的部分（0 = 每一档都在容差里），
 * err 用来在候选里挑最近的
 */
export function gap(m: Measure, target: readonly number[]): { signed: number; miss: number; err: number } {
  const tol = curve.jam?.tol ?? 0.1;
  let signed = 0;
  let miss = 0;
  let err = 0;
  target.forEach((t, k) => {
    const d = m.normal[k] - t;
    // 花了道具以后比目标更容易过，只要不离谱（多 UP_TOL 以内）就不算没达标：花钱有用是好事，要卡住的是「不花」那一档
    const over = k > 0 ? Math.max(0, d - UP_TOL) : d;
    const e = d > 0 ? over : d;
    signed += e;
    err += e * e;
    miss = Math.max(miss, Math.abs(e) - tol);
  });
  return { signed: signed / target.length, miss: Math.max(0, miss), err };
}

export interface JamPick {
  lv: LevelData;
  m: Measure;
  share: number;
  miss: number;
}

/** 上一关同一档找到的打乱比例，下一关从这里起步（曲线给的是起点，实际要多少看关卡） */
const lastShare = new Map<string, number>();

/**
 * 生成一关（ease = 0 本体，1、2 变体）。target 为 null（普通关的变体）时只要求比 easierThan 更容易：
 * 普通玩家不花道具的过关比例不低于它
 */
export function pick(id: number, ease: number, target: number[] | null, easierThan = 0, log = false): JamPick | null {
  const kind = LevelCurve.jamKind(curve, id) as JamKind;
  const p0 = LevelCurve.params(curve, id, ease);
  const key = `${kind}:${ease}`;
  let share = lastShare.get(key) ?? (p0.scramble ?? 0) / p0.fish;
  let lo = SHARE_MIN;
  let hi = SHARE_MAX;
  let best: JamPick | null = null;
  let bestErr = Infinity;
  let queueMul = 1;
  for (let round = 0; round < ROUNDS; round++) {
    let signedSum = 0;
    let made = 0;
    for (let i = 0; i < SEEDS; i++) {
      const p = { ...p0, scramble: Math.trunc(p0.fish * share), queue: (p0.queue ?? 0) * queueMul, attempts: 4 };
      const lv = generate(p, LevelCurve.seedFor(id, ease) + round * 7919 + i * 10007, solveCareful);
      if (lv === null) continue;
      const m = measure(lv, id, 0, false);
      made++;
      let err: number;
      let miss: number;
      let signed: number;
      if (target !== null) ({ err, miss, signed } = gap(m, target));
      else {
        // 只要更容易：不花道具的过关比例够了就行，越高越好
        const want = Math.max(easierThan, 0.9);
        signed = m.normal[0] - want;
        miss = Math.max(0, -signed);
        err = miss * miss - m.normal[0] * 1e-3;
      }
      signedSum += signed;
      if (log) console.log(`  第 ${id} 关 e${ease} 打乱 ${(share * 100).toFixed(1)}% 排队 ×${queueMul.toFixed(2)} 种子 ${i}：普通 [${m.normal.map((x) => Math.round(x * 100)).join(' ')}]  差 ${signed.toFixed(2)}`);
      if (err < bestErr) {
        bestErr = err;
        best = { lv, m, share, miss };
      }
      if (miss === 0) break;
    }
    if (best !== null && best.miss === 0) break;
    // 一个都没生成出来（细心玩家也找不到解）：太难，少打乱
    const signed = made > 0 ? signedSum / made : -1;
    // 打乱已经到底还是偏难（后面的关排队泡多，普通关不打乱也可能偏难）：再少一些排队泡
    if (signed < 0 && share < 0.01) queueMul *= 0.75;
    if (signed > 0) lo = share;
    else hi = share;
    share = hi - lo < 0.01 ? (signed > 0 ? Math.min(SHARE_MAX, share * 1.5 + 0.02) : share * 0.5) : (lo + hi) / 2;
    if (signed > 0 && hi >= SHARE_MAX && share > SHARE_MAX - 0.01) share = SHARE_MAX;
  }
  if (best !== null) {
    lastShare.set(key, best.share);
    best.m = measure(best.lv, id);
  }
  return best;
}

/** 花 1 样以上的那几档，比目标高多少以内不算偏易 */
const UP_TOL = 0.2;

/** 第 id 关的文件名 */
export const fileName = (id: number, ease = 0) => `level_${String(id).padStart(4, '0')}${ease > 0 ? `_e${ease}` : ''}`;

/** 报告里一行：普通玩家 / 随手玩家花 0–6 样的过关比例 */
export function row(m: Measure): string {
  const f = (a: number[]) => a.map((x) => String(Math.round(x * 100)).padStart(3)).join(' ');
  return `普通 [${f(m.normal)}]  随手 [${f(m.casual)}]`;
}

