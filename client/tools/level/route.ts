// 规定路线关卡（docs/02 第 0.4 节，2026-11-19）：生成一关能过的，再逐步收紧到目标容错，每一档容错存一份。
// 用法：npx tsx tools/level/route.ts <关卡号> [--slack=0] [--iter=400] [--species=+1] [--queue=0.7] [--seed=1] [--out=目录] [--lab] [--base=容错]
//   --slack   收紧到几格容错为止（不给 = 0：一路收紧，每一档都存）
//   --species / --queue  在难度曲线的基础上改鱼种数（+1 = 多一种）和排队泡比例，做实验用
//   --out     把每一档写成 level_XXXX_s{容错}.json（不给只打印）
//   --lab     把每一档写进包里的 config/levels_lab/，并更新 index.json（难度调试页从这里挑，docs/01 9.7）
//   --base=N  包里这一关（level_XXXX.json）换成容错 N 的那一档，两个变体（连输 2、4 次换上）用再松 1 格、2 格的
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CurveConfig } from '../../assets/scripts/core/config';
import * as LevelCurve from '../../assets/scripts/core/gen/levelCurve';
import { generate } from '../../assets/scripts/core/gen/levelGen';
import { longestRun, tighten } from '../../assets/scripts/core/gen/routeGen';
import { LevelData } from '../../assets/scripts/core/model/levelData';
import * as Route from '../../assets/scripts/core/solver/route';

const CLIENT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const curve = JSON.parse(readFileSync(join(CLIENT, 'assets/resources/config/level_curve.json'), 'utf8')) as CurveConfig;
const arg = (name: string, def: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def;

const id = Number(process.argv[2]);
const p = { ...LevelCurve.params(curve, id, 0), scramble: 0, attempts: 8 };
const sp = arg('species', '');
if (sp) p.species = sp.startsWith('+') || sp.startsWith('-') ? p.species + Number(sp) : Number(sp);
const q = arg('queue', '');
if (q) p.queue = Number(q);
const seed = Number(arg('seed', '1'));
const t0 = Date.now();
const lv = generate(p, LevelCurve.seedFor(id, 0) + seed * 7919, (x) => Route.solve(x, 100000).taps);
if (!lv) {
  console.log(`第 ${id} 关生成失败`);
  process.exit(1);
}
lv.id = id;
const fish = lv.bubbles.reduce((n, b) => n + b.fish.length, 0);
console.log(`第 ${id} 关 鱼 ${fish} 种 ${p.species} 泡 ${lv.bubbles.length} 层 ${p.layers} 排队 ${lv.bubbles.filter((b) => b.queue).length} 冰 ${lv.bubbles.filter((b) => b.ice.length).length} 锁 ${lv.bubbles.filter((b) => b.chain).length} 暂存槽 ${lv.buffer}`);
const r = tighten(lv, { slack: Number(arg('slack', '0')), iterations: Number(arg('iter', '400')), seed });
const out = arg('out', '');
if (out) mkdirSync(out, { recursive: true });
for (const [slack, snap] of Array.from(r.bySlack.entries()).sort((a, b) => b[0] - a[0])) {
  const run = longestRun(snap.lv, snap.rep.route);
  console.log(`  容错 ${slack}：关键步 ${snap.rep.keySteps}（唯一 ${snap.rep.forced}）最少要 ${snap.rep.minBuffer} 格，路线最长连击 ${run}`);
  if (out) writeFileSync(join(out, `level_${String(id).padStart(4, '0')}_s${slack}.json`), snap.lv.toJson() + '\n');
}
console.log(`  试了 ${r.tries} 次交换，${((Date.now() - t0) / 1000).toFixed(0)}s`);

const pad = (n: number) => String(n).padStart(4, '0');
const LEVELS = join(CLIENT, 'assets/resources/config/levels');
const LAB = join(CLIENT, 'assets/resources/config/levels_lab');
const base = arg('base', '');
const slacks = Array.from(r.bySlack.keys()).sort((a, b) => a - b);
// 交换过鱼以后，生成时的参考解不对了：换成求解器找的那条路线（占暂存槽最少的，按它走就能过；提示道具也按它给）
for (const snap of r.bySlack.values()) snap.lv.ref = snap.rep.route.slice();
/**
 * 容错至少 want 的一份：有正好的或更松的档就用那一档里最紧的；都没有（生成出来就已经比较紧）就拿最松的那档，
 * 暂存槽多给几格补够——多一格正好多一次容错，布局和路线都不变（连输后换上的简单版本用）
 */
const atLeast = (want: number): LevelData => {
  const sl = slacks.find((x) => x >= want);
  if (sl !== undefined) return (r.bySlack.get(sl) as { lv: LevelData }).lv;
  const top = slacks[slacks.length - 1];
  const lv = LevelData.fromDict((r.bySlack.get(top) as { lv: LevelData }).lv.toDict());
  lv.buffer = Math.min(7, lv.buffer + (want - top));
  return lv;
};
if (base !== '') {
  const b = Number(base);
  const main = atLeast(b);
  main.id = id;
  main.variants = [`level_${pad(id)}_e1`, `level_${pad(id)}_e2`];
  writeFileSync(join(LEVELS, `level_${pad(id)}.json`), main.toJson() + '\n');
  for (const e of [1, 2]) {
    const v = atLeast(b + e);
    v.id = id;
    v.variants = [];
    writeFileSync(join(LEVELS, `level_${pad(id)}_e${e}.json`), v.toJson() + '\n');
  }
  console.log(`  包里的第 ${id} 关换成容错 ${b} 的那一档（变体再松 1、2 格）`);
}
if (process.argv.includes('--lab')) {
  mkdirSync(LAB, { recursive: true });
  const indexPath = join(LAB, 'index.json');
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {};
  const versions: Record<string, unknown> = {};
  for (const sl of slacks) {
    const snap = r.bySlack.get(sl) as { lv: LevelData; rep: Route.RouteReport };
    snap.lv.id = id;
    snap.lv.variants = [];
    writeFileSync(join(LAB, `level_${pad(id)}_s${sl}.json`), snap.lv.toJson() + '\n');
    versions[String(sl)] = { keys: snap.rep.keySteps, forced: snap.rep.forced, minBuffer: snap.rep.minBuffer, run: longestRun(snap.lv, snap.rep.route) };
  }
  index[String(id)] = { base: base !== '' ? Number(base) : -1, versions };
  const sorted = Object.fromEntries(Object.keys(index).sort((a, b) => Number(a) - Number(b)).map((k) => [k, index[k]]));
  writeFileSync(indexPath, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`  各档写进 config/levels_lab（${slacks.join('、')}）`);
}
