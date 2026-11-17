// 生成关卡文件。用法：./run.sh level-gen [起始关] [结束关]。
// 每关逐个种子在难度旋钮上二分、微调总鱼数。搜索用 40 局机器人（快），胜率靠近瞄准值的候选再用另一组
// 400 局复测，容差、单调、第 3 缸区间都按复测结果判，挑复测最好的那个（docs/02-关卡设计.md 第 2.1、4 节）。
// 一关的结果只取决于关卡号和上一关的复测胜率，不依赖从哪一关开始跑，所以可以按关号分段并行生成。
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
const vRuns = gen.verifyRuns;
const vBase = gen.verifySeedBase;
/** 搜索阶段的胜率（40 局，种子从 0 起） */
const quick = (lv: LevelData, slots: number) => Bots.rate(lv, 'greedy', slots, runs, 0, curve.bot);
/** 验收的胜率（另一组 400 局），关卡文件最终按它判 */
const verified = (lv: LevelData, slots: number) => Bots.rate(lv, 'greedy', slots, vRuns, vBase, curve.bot);
/** 上一个普通关 / 挑战关复测的 2 缸胜率，-1 = 还没有 */
const last = new Map<boolean, number>([
  [false, -1],
  [true, -1],
]);
const warnings: string[] = [];
/** 第 3 缸不在区间的关（只提示，docs/02 第 2.1 节） */
const warnings3: string[] = [];
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
  for (const w of warnings3) console.log(w);
  console.log(`已生成第 ${from}–${to} 关，失败 ${failed} 个，未达标 ${warnings.length} 个，第 3 缸不在区间 ${warnings3.length} 个`);
  return failed > 0 ? 1 : 0;
}

/** 从某一关往前找最近的普通关和挑战关，量出它们的胜率作为单调约束的起点 */
function loadPrevious(from: number): void {
  for (const kind of [false, true]) {
    for (let id = from - 1; id > 0; id--) {
      if (LevelCurve.isChallenge(curve, id) !== kind) continue;
      const path = join(DIR, `${name(id)}.json`);
      if (existsSync(path)) last.set(kind, verified(LevelData.fromJson(readFileSync(path, 'utf8')) as LevelData, 2));
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

/**
 * d 是难度旋钮：0–1 对应打乱 0–50% 的鱼；超过 1 的部分每 0.125 把场上容量再减 1（最少 gen.capMin），
 * 同时把平均一个气泡几条鱼从 3 条往下调到 gen.perAvgMin（d 到 knobMax 时）——在场的气泡数不少，看得见、点得到的鱼少了
 * （2026-11-17：只靠缩容凑难度，场上只剩 9–11 个气泡，长屏上面是空的）
 */
function candidate(id: number, ease: number, i: number, d: number): LevelData | null {
  const p = LevelCurve.params(curve, id, ease);
  const nudge = gen.fishNudge;
  if (ease === 0 && id > 2) p.fish = idiv(Math.max(9, p.fish + [0, -nudge, nudge][i % 3]), 3) * 3;
  p.scramble = Math.trunc(p.fish * 0.5 * clampf(d, 0.0, 1.0));
  if ((p.cap ?? 0) > 0 && d > 1.0) {
    p.cap = Math.max(gen.capMin, (p.cap as number) - Math.trunc((d - 1.0) * 8.0));
    const k = clampf((d - 1.0) / (gen.knobMax - 1.0), 0.0, 1.0);
    p.per_avg = 3.0 - (3.0 - gen.perAvgMin) * k;
    if (p.per_avg < 2.6) p.per_min = 1;
  }
  return generate(p, LevelCurve.seedFor(id, ease) + i * 10007);
}

function pickBase(id: number, challenge: boolean): Pick | null {
  if (id <= curve.targets.tutorialUntil) {
    const lv0 = candidate(id, 0, 0, 0.0);
    if (lv0 === null) return null;
    return { lv: lv0, g2: verified(lv0, 2), g3: 100, d: 0.0 };
  }
  const target = LevelCurve.targetRate(curve, id, challenge);
  const span = LevelCurve.target(curve, id, challenge);
  const lo = span[0];
  const prev = last.get(challenge) as number;
  let hi = prev < 0 ? span[1] : Math.min(span[1], prev + gen.monotoneMargin);
  // 上一关已经偏难到区间下限以下时，单调和容差不能同时满足：贴着下限出，
  // 不让一关的偏差顺着单调约束传给后面所有关
  hi = Math.max(hi, lo + 3);
  // 搜索瞄准的胜率：目标值，但离上下限各留 1–2 个点。
  // 新机制的解锁关取区间上限（贴着上一普通关），不往难里调（docs/02 第 2.2 节）
  const fresh = LevelCurve.unlockedAt(curve, id) !== '';
  const aim = clampf(fresh ? hi : target, lo + 1.0, hi - 2.0);
  const close = gen.close;
  let best: Pick | null = null;
  let bestPen = Infinity;
  /** 搜索阶段离瞄准值多近的候选才值得花 400 局复测 */
  const near = gen.tol40 ?? 12;
  // 胜率对旋钮很陡且不单调：第一个种子在整个旋钮范围上二分，找出胜率从 100 掉到 0 的过渡带；
  // 之后的种子只在当前最优候选的旋钮 ± band 内二分，在过渡带里密集取样
  let center = -1.0;
  let fallback: { lv: LevelData; g2: number; d: number } | null = null;
  // 两种提前收工：
  // - 打乱和缩容都用到头了机器人还是稳赢（掉落关前段，场上气泡多、鱼种少）：试过 giveUpSeeds 个种子没见过一个够难的就不再找
  // - 2 缸已经达标、只差第 3 缸不在区间：再多找 bowl3Seeds 个种子，找不到就用现有的（第 3 缸只警告）
  let sawHard = false;
  let goodAt = -1;
  // 找完 seeds 个种子 2 缸还没落进区间的（过渡带太窄，候选不是太易就是太难），再多给 seedsMore 个种子
  for (let i = 0; i < gen.seeds + gen.seedsMore; i++) {
    if (i >= gen.seeds && bestPen < 100.0) break;
    if (!sawHard && i >= gen.giveUpSeeds) break;
    if (goodAt >= 0 && i > goodAt + gen.bowl3Seeds) break;
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
      const q2 = quick(lv, 2);
      if (trace) console.log(`  第 ${id} 关 种子 ${i} 旋钮 ${d.toFixed(4)} → 2缸 ${q2}（瞄准 ${f1(aim)}）`);
      if (q2 > aim) dLo = d;
      else dHi = d;
      if (q2 <= aim + near) sawHard = true;
      // 一样近的取旋钮更大的（都偏易时往难的一头靠）
      const gap = Math.abs(q2 - aim) - (fallback === null ? Infinity : Math.abs(fallback.g2 - aim));
      if (gap < 0 || (gap === 0 && d > (fallback as { d: number }).d)) fallback = { lv, g2: q2, d };
      if (Math.abs(q2 - aim) > near) continue;
      const g2 = verified(lv, 2);
      if (penalty(id, g2, lo, hi, aim, -1) >= bestPen) continue;
      const g3 = verified(lv, 3);
      const pen = penalty(id, g2, lo, hi, aim, g3);
      if (trace) console.log(`    复测 2缸 ${g2} 3缸 ${g3} 罚分 ${pen.toFixed(2)}`);
      if (pen < bestPen) {
        bestPen = pen;
        best = { lv, g2, g3, d };
        if (goodAt < 0 && penalty(id, g2, lo, hi, aim, -1) <= close * 0.05) goodAt = i;
      }
      if (bestPen <= close * 0.05) break;
    }
    if (bestPen <= close * 0.05) break;
    // 还没有候选时：见过够难的就用最接近的那个当过渡带中心；一直偏易就贴着旋钮上限找
    center = best !== null ? best.d : !sawHard ? gen.knobMax : fallback !== null ? fallback.d : (dLo + dHi) * 0.5;
  }
  if (best === null && fallback !== null) {
    // 没有一个候选靠近瞄准值：拿搜索阶段最近的那个出，照样报警告
    best = { lv: fallback.lv, g2: verified(fallback.lv, 2), g3: verified(fallback.lv, 3), d: fallback.d };
    bestPen = penalty(id, best.g2, lo, hi, aim, best.g3);
  }
  if (best === null) return null;
  const s3 = LevelCurve.bowl3Span(curve, id, best.g2);
  if (bestPen >= 100.0) {
    warnings.push(
      `警告: 第 ${id} 关未达标（目标 ${f1(target)} 容差 [${span.join(', ')}]，上一${challenge ? '挑战' : '普通'}关 ${prev}）：2缸 ${best.g2}，3缸 ${best.g3}`,
    );
  } else if (LevelCurve.miss(s3, best.g3) > 0) {
    warnings3.push(`提示: 第 ${id} 关第 3 缸不在区间 [${s3.join(', ')}]：2缸 ${best.g2}，3缸 ${best.g3}`);
  }
  return best;
}

/**
 * 越小越好，都按复测胜率算：出容差或破单调每点 100 分（先满足 2 缸目标）；第 3 缸出区间每点 1 分
 * （g3 传 -1 = 还没量，不计）；离瞄准值每点 0.05 分
 */
function penalty(id: number, g2: number, lo: number, hi: number, aim: number, g3: number): number {
  let pen = (Math.max(0, lo - g2) + Math.max(0, g2 - hi)) * 100.0;
  if (g3 >= 0) pen += LevelCurve.miss(LevelCurve.bowl3Span(curve, id, g2), g3);
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
    const g2 = verified(lv, 2);
    if (best === null || g2 > best.g2) best = { lv, g2 };
    if (g2 >= need) break;
  }
  if (best !== null && best.g2 < need) warnings.push(`警告: 第 ${id} 关变体 e${ease} 不够易：需要 ${need}，实测 ${best.g2}`);
  return best;
}

process.exit(main());
