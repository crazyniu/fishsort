// 生成关卡文件。用法：./run.sh level-gen [起始关] [结束关]。
// 每关逐个种子在难度旋钮上二分、微调总鱼数，挑胜率最接近目标且满足单调约束的那个，
// 规则见 docs/02-关卡设计.md 第 2.1、4 节。一关的结果只取决于关卡号和上一关的胜率，
// 不依赖从哪一关开始跑，所以可以按关号分段并行生成。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CurveConfig } from '../../assets/scripts/core/config';
import * as LevelCurve from '../../assets/scripts/core/gen/levelCurve';
import { generate } from '../../assets/scripts/core/gen/levelGen';
import { LevelData } from '../../assets/scripts/core/model/levelData';
import * as Bots from '../../assets/scripts/core/solver/bots';
import { clampf, idiv } from '../../assets/scripts/core/util';

const CLIENT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const DIR = join(CLIENT, 'assets/resources/config/levels');
const EASE_VARIANTS = 2;

const curve = JSON.parse(readFileSync(join(CLIENT, 'assets/resources/config/level_curve.json'), 'utf8')) as CurveConfig;
const gen = curve.gen;
const runs = gen.runs;
/** 上一个普通关 / 挑战关的实测 2 缸胜率，-1 = 还没有 */
const last = new Map<boolean, number>([
  [false, -1],
  [true, -1],
]);
const warnings: string[] = [];
/** FISHSORT_GEN_TRACE=1 时打印每次试探，调搜索用 */
const trace = process.env.FISHSORT_GEN_TRACE === '1';

interface Pick {
  lv: LevelData;
  g2: number;
  g3: number;
  d: number;
}

const name = (id: number, ease = 0) => `level_${String(id).padStart(4, '0')}${ease > 0 ? `_e${ease}` : ''}`;
const f1 = (x: number) => x.toFixed(1);

function main(): number {
  const from = Number(process.argv[2] ?? 1);
  const to = Number(process.argv[3] ?? curve.total);
  mkdirSync(DIR, { recursive: true });
  loadPrevious(from);
  let failed = 0;
  for (let id = from; id <= to; id++) {
    const made = makeLevel(id);
    if (made === null) {
      console.error(`生成失败: 第 ${id} 关`);
      failed++;
      continue;
    }
    for (const [n, lv] of made) writeFileSync(join(DIR, `${n}.json`), lv.toJson() + '\n');
  }
  for (const w of warnings) console.log(w);
  console.log(`已生成第 ${from}–${to} 关，失败 ${failed} 个，未达标 ${warnings.length} 个`);
  return failed > 0 ? 1 : 0;
}

/** 从某一关往前找最近的普通关和挑战关，量出它们的胜率作为单调约束的起点 */
function loadPrevious(from: number): void {
  for (const kind of [false, true]) {
    for (let id = from - 1; id > 0; id--) {
      if (LevelCurve.isChallenge(curve, id) !== kind) continue;
      const path = join(DIR, `${name(id)}.json`);
      if (existsSync(path)) last.set(kind, Bots.rate(LevelData.fromJson(readFileSync(path, 'utf8')) as LevelData, 'greedy', 2, runs));
      break;
    }
  }
}

/** 返回 [文件名, 关卡]，含本体和两个更易变体；失败返回 null */
function makeLevel(id: number): [string, LevelData][] | null {
  const challenge = LevelCurve.isChallenge(curve, id);
  const base = pickBase(id, challenge);
  if (base === null) return null;
  const names: string[] = [];
  const variants: LevelData[] = [];
  const rates: number[] = [];
  let prevRate = base.g2;
  for (let ease = 1; ease <= EASE_VARIANTS; ease++) {
    const v = pickVariant(id, ease, prevRate, base.d);
    if (v === null) return null;
    prevRate = v.g2;
    variants.push(v.lv);
    rates.push(v.g2);
    names.push(name(id, ease));
  }
  const lv = base.lv;
  lv.id = id;
  lv.variants = names;
  const out: [string, LevelData][] = [[name(id), lv]];
  variants.forEach((v, i) => {
    v.id = id;
    out.push([names[i], v]);
  });
  last.set(challenge, base.g2);
  console.log(
    `第 ${String(id).padStart(3)} 关${challenge ? '*' : ' '}  目标 ${f1(LevelCurve.targetRate(curve, id, challenge))}  2缸 ${String(base.g2).padStart(3)}  3缸 ${String(base.g3).padStart(3)}  变体 [${rates.join(', ')}]`,
  );
  return out;
}

/** d 是难度旋钮：0–1 对应打乱 0–50% 的鱼，超过 1 的部分每 0.125 把场上容量再减 1 */
function candidate(id: number, ease: number, i: number, d: number): LevelData | null {
  const p = LevelCurve.params(curve, id, ease);
  const nudge = gen.fishNudge;
  if (ease === 0 && id > 2) p.fish = idiv(Math.max(9, p.fish + [0, -nudge, nudge][i % 3]), 3) * 3;
  p.scramble = Math.trunc(p.fish * 0.5 * clampf(d, 0.0, 1.0));
  if ((p.cap ?? 0) > 0 && d > 1.0) p.cap = Math.max(gen.capMin, (p.cap as number) - Math.trunc((d - 1.0) * 8.0));
  return generate(p, LevelCurve.seedFor(id, ease) + i * 10007);
}

function pickBase(id: number, challenge: boolean): Pick | null {
  if (id <= curve.targets.tutorialUntil) {
    const lv0 = candidate(id, 0, 0, 0.0);
    if (lv0 === null) return null;
    return { lv: lv0, g2: Bots.rate(lv0, 'greedy', 2, runs), g3: 100, d: 0.0 };
  }
  const target = LevelCurve.targetRate(curve, id, challenge);
  const span = LevelCurve.target(curve, id, challenge);
  const lo = span[0];
  const prev = last.get(challenge) as number;
  let hi = prev < 0 ? span[1] : Math.min(span[1], prev + gen.monotoneMargin);
  // 上一关已经偏难到区间下限以下时，单调和容差不能同时满足：贴着下限出，
  // 不让一关的偏差顺着单调约束传给后面所有关
  hi = Math.max(hi, lo + 3);
  // 搜索瞄准的胜率：目标值，但离上下限各留 1–2 个点
  const aim = clampf(target, lo + 1.0, hi - 2.0);
  const close = gen.close;
  let best: Pick | null = null;
  let bestPen = Infinity;
  // 胜率对旋钮很陡且不单调：第一个种子在整个旋钮范围上二分，找出胜率从 100 掉到 0 的过渡带；
  // 之后的种子只在当前最优候选的旋钮 ± band 内二分，在过渡带里密集取样
  let center = -1.0;
  for (let i = 0; i < gen.seeds; i++) {
    let dLo = 0.0;
    let dHi = gen.knobMax;
    let probes = gen.probes;
    if (center >= 0.0) {
      dLo = Math.max(0.0, center - gen.band);
      dHi = Math.min(dHi, center + gen.band);
      probes = gen.probesFine;
    }
    for (let step = 0; step < probes; step++) {
      const d = (dLo + dHi) * 0.5;
      const lv = candidate(id, 0, i, d);
      if (lv === null) {
        // 打乱后机器人找不到通关步骤：太难
        dHi = d;
        continue;
      }
      const g2 = Bots.rate(lv, 'greedy', 2, runs);
      if (trace) console.log(`  第 ${id} 关 种子 ${i} 旋钮 ${d.toFixed(4)} → 2缸 ${g2}（瞄准 ${f1(aim)}）`);
      if (g2 > aim) dLo = d;
      else dHi = d;
      if (penalty(g2, lo, hi, aim, 100) >= bestPen) continue;
      // 3 缸胜率只对暂时最优的候选量，省时间
      const g3 = Bots.rate(lv, 'greedy', 3, runs);
      const pen = penalty(g2, lo, hi, aim, g3);
      if (pen < bestPen) {
        bestPen = pen;
        best = { lv, g2, g3, d };
      }
      if (bestPen <= close * 0.05) break;
    }
    if (bestPen <= close * 0.05) break;
    // 还没有候选时，用二分停下的位置当过渡带中心
    center = best !== null ? best.d : (dLo + dHi) * 0.5;
  }
  if (best === null) return null;
  if (bestPen >= 1.0) {
    warnings.push(
      `警告: 第 ${id} 关未达标（目标 ${f1(target)} 容差 [${span.join(', ')}]，上一${challenge ? '挑战' : '普通'}关 ${prev}）：2缸 ${best.g2}，3缸 ${best.g3}`,
    );
  }
  return best;
}

/** 越小越好：出容差或破单调每点 3 分，3 缸比 2 缸难每点 2 分，离瞄准值每点 0.05 分 */
function penalty(g2: number, lo: number, hi: number, aim: number, g3: number): number {
  let pen = (Math.max(0, lo - g2) + Math.max(0, g2 - hi)) * 3.0;
  pen += Math.max(0, g2 - gen.bot3Margin - g3) * 2.0;
  return pen + Math.abs(g2 - aim) * 0.05;
}

/** 更易变体：胜率要比上一档高出 variantMargin（封顶 100） */
function pickVariant(id: number, ease: number, prevRate: number, d: number): { lv: LevelData; g2: number } | null {
  let need = Math.min(100, prevRate + gen.variantMargin);
  if (id <= curve.targets.tutorialUntil) need = prevRate;
  let best: { lv: LevelData; g2: number } | null = null;
  for (let i = 0; i < gen.variantSeeds; i++) {
    const lv = candidate(id, ease, i, Math.max(0.0, d - 0.3 * ease - 0.05 * i));
    if (lv === null) continue;
    const g2 = Bots.rate(lv, 'greedy', 2, runs);
    if (best === null || g2 > best.g2) best = { lv, g2 };
    if (g2 >= need) break;
  }
  if (best !== null && best.g2 < need) warnings.push(`警告: 第 ${id} 关变体 e${ease} 不够易：需要 ${need}，实测 ${best.g2}`);
  return best;
}

process.exit(main());
