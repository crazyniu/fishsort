// 难度调试（用户 2026-11-19：难度要能自己调、自己试）：按几个旋钮现场生成一关，量出机器人的过关率。
// 游戏里的「难度调试」页（pages/lab.ts）用它；做法和关卡工具 tools/level/jam.ts 一样，只是搜得少一些、能在手机上跑。
// 纯逻辑：随机数全走种子，同样的旋钮和种子生成同一关。
import type { CurveConfig } from '../config';
import { LevelData, Tap } from '../model/levelData';
import * as Careful from '../solver/careful';
import * as LevelCurve from './levelCurve';
import { generate } from './levelGen';

export interface LabKnobs {
  /** 规模按第几关（鱼数、鱼种、层数、掉落都跟着它；障碍只保留下面几样旋钮管的） */
  like: number;
  /** 目标：普通玩家机器人不花道具的过关率（0–100）；0 = 不搜，直接按 share 生成 */
  pass: number;
  /** 多大比例的气泡是排队泡（0–100） */
  queue: number;
  /** 厚冰泡几个、每个连几个气泡（全部破了才解冻） */
  ice: number;
  iceDeps: number;
  /** 锁链泡几个 */
  chain: number;
  /** 暂存槽几格 */
  buffer: number;
  /** 打乱多少鱼（0–100，占全部鱼的比例）；pass > 0 时是搜索的起点 */
  share: number;
}

export interface LabResult {
  lv: LevelData;
  /** 不花道具的过关率（0–1）：普通玩家、随手玩家 */
  normal: number;
  casual: number;
  /** 实际打乱的比例（0–1） */
  share: number;
}

const GAMES = 80;
const ROUNDS = 5;
const SEEDS = 2;
const SHARE_MAX = 0.6;

/** 这一关在难度曲线上的旋钮值（调试页切到某一关时先填上它们） */
export function knobsFor(curve: CurveConfig, id: number): LabKnobs {
  const p = LevelCurve.params(curve, id, 0);
  const t = LevelCurve.jamTargets(curve, id, 0);
  return {
    like: id,
    pass: t ? Math.round(t[0] * 100) : 0,
    queue: Math.round((p.queue ?? 0) * 100),
    ice: p.ice ?? 0,
    iceDeps: Math.max(2, p.iceAll ?? 2),
    chain: p.chain ?? 0,
    buffer: p.buffer ?? 5,
    share: Math.round(((p.scramble ?? 0) / Math.max(1, p.fish)) * 100),
  };
}

/** 找一条不花道具的通关步骤：普通玩家先打，打不过细心玩家再打两局 */
function solve(lv: LevelData): Tap[] {
  for (let g = 0; g < 40; g++) {
    const r = Careful.play(lv, 8000 + g, 'normal');
    if (r.won) return r.taps;
  }
  for (let g = 0; g < 2; g++) {
    const r = Careful.play(lv, 9000 + g, 'careful');
    if (r.won) return r.taps;
  }
  return [];
}

function rate(lv: LevelData, player: Careful.Player, games: number): number {
  let w = 0;
  for (let g = 0; g < games; g++) if (Careful.play(lv, g, player).won) w++;
  return w / games;
}

/** 按旋钮生成第 id 关；生成不出来（怎么都无解）返回 null */
export function make(curve: CurveConfig, id: number, k: LabKnobs, seed: number): LabResult | null {
  const p0 = LevelCurve.params(curve, k.like, 0);
  // 障碍只留旋钮管的几样，别的（限时缸、迷雾、大缸、结伴）先去掉，量出来的就是这几个旋钮的效果
  delete p0.timer;
  delete p0.fog;
  delete p0.big;
  delete p0.pairs;
  p0.queue = k.queue / 100;
  p0.ice = k.ice > 0 ? k.ice : undefined;
  p0.iceAll = k.ice > 0 ? k.iceDeps : undefined;
  p0.chain = k.chain > 0 ? k.chain : undefined;
  p0.buffer = k.buffer;
  p0.attempts = 4;
  if (p0.scrambleFrom === undefined) p0.scrambleFrom = 0.5;
  const gen = (share: number, i: number) => generate({ ...p0, scramble: Math.trunc(p0.fish * share) }, seed * 131 + i * 10007 + 7, solve);
  const done = (lv: LevelData, normal: number, share: number): LabResult => {
    lv.id = id;
    lv.variants = [];
    return { lv, normal, casual: rate(lv, 'casual', GAMES), share };
  };
  let share = Math.min(SHARE_MAX, k.share / 100);
  if (k.pass <= 0) {
    for (let i = 0; i < 6; i++) {
      const lv = gen(share, i);
      if (lv !== null) return done(lv, rate(lv, 'normal', GAMES), share);
    }
    return null;
  }
  const want = k.pass / 100;
  let lo = 0;
  let hi = SHARE_MAX;
  let best: { lv: LevelData; normal: number; share: number } | null = null;
  let bestErr = Infinity;
  for (let round = 0; round < ROUNDS; round++) {
    let sum = 0;
    let made = 0;
    for (let i = 0; i < SEEDS; i++) {
      const lv = gen(share, round * SEEDS + i);
      if (lv === null) continue;
      const n = rate(lv, 'normal', GAMES);
      made++;
      sum += n;
      const err = Math.abs(n - want);
      if (err < bestErr) {
        bestErr = err;
        best = { lv, normal: n, share };
      }
    }
    if (bestErr <= 0.04) break;
    // 太容易就多打乱，太难（或无解）就少打乱
    const easy = made > 0 && sum / made > want;
    if (easy) lo = share;
    else hi = share;
    share = (lo + hi) / 2;
  }
  return best === null ? null : done(best.lv, best.normal, best.share);
}
