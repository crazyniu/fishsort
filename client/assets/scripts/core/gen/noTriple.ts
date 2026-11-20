// 同一个气泡里同种鱼最多两条（docs/02 第 2 节，用户 2026-11-20：「有的气泡里面有三个完全一样的鱼，不应该出现这种情况」）。
// 一个泡里就凑得齐一缸，等于白送；生成、收紧换鱼、修旧关卡都守这一条。纯逻辑，同样的种子出同样的结果。
import { LevelData } from '../model/levelData';
import { Rng } from '../rng/rng';

/** 一个气泡里同种鱼最多几条 */
export const MAX_SAME = 2;

/** 这个气泡第 k 条鱼是不是结伴鱼（结伴的两条要一起走，不动） */
const paired = (pairs: readonly (readonly number[])[], k: number) => pairs.some((p) => p.includes(k));

const count = (fish: readonly number[], s: number) => fish.reduce((n, f) => n + (f === s ? 1 : 0), 0);

/** 有几个气泡犯规（同种鱼超过 MAX_SAME 条） */
export function violations(lv: LevelData): number {
  let n = 0;
  for (const b of lv.bubbles) {
    const seen = new Map<number, number>();
    for (const f of b.fish) seen.set(f, (seen.get(f) ?? 0) + 1);
    if (Array.from(seen.values()).some((c) => c > MAX_SAME)) n++;
  }
  return n;
}

/** 把 b1 的第 k1 条和 b2 的第 k2 条对换以后，这两个泡还守不守规矩（换之前问） */
export function swapOk(lv: LevelData, b1: number, k1: number, b2: number, k2: number): boolean {
  const f1 = lv.bubbles[b1].fish[k1];
  const f2 = lv.bubbles[b2].fish[k2];
  if (b1 === b2 || f1 === f2) return true;
  // b1 少一条 f1、多一条 f2；b2 反过来
  return count(lv.bubbles[b1].fish, f2) + 1 <= MAX_SAME && count(lv.bubbles[b2].fish, f1) + 1 <= MAX_SAME;
}

/**
 * 修好犯规的泡：多出来的那条和别的泡里一条不同种的对换（结伴鱼不动），换完两个泡都守规矩。
 * 能换的随机挑一个（rng）。改的是 lv 本身；返回还修不好的泡数（0 = 全修好了）。
 */
export function fix(lv: LevelData, rng: Rng): number {
  for (let guard = 0; guard < 1000; guard++) {
    let bad = -1;
    let sp = -1;
    for (let bi = 0; bi < lv.bubbles.length && bad < 0; bi++) {
      const fish = lv.bubbles[bi].fish;
      for (const f of fish)
        if (count(fish, f) > MAX_SAME) {
          bad = bi;
          sp = f;
          break;
        }
    }
    if (bad < 0) return 0;
    const b = lv.bubbles[bad];
    const mine = b.fish.map((_, k) => k).filter((k) => b.fish[k] === sp && !paired(b.pairs, k));
    const moves: [number, number, number][] = [];
    for (const k1 of mine)
      lv.bubbles.forEach((o, bi) => {
        if (bi === bad) return;
        o.fish.forEach((f, k2) => {
          if (f !== sp && !paired(o.pairs, k2) && swapOk(lv, bad, k1, bi, k2)) moves.push([k1, bi, k2]);
        });
      });
    if (moves.length === 0) return violations(lv);
    const [k1, b2, k2] = rng.pick(moves);
    const o = lv.bubbles[b2];
    [b.fish[k1], o.fish[k2]] = [o.fish[k2], b.fish[k1]];
  }
  return violations(lv);
}
