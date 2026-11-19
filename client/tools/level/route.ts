// 规定路线关卡（docs/02 第 0.4 节，2026-11-19）：生成一关能过的，再逐步收紧到目标容错，每一档容错存一份。
// 用法：npx tsx tools/level/route.ts <关卡号> [--slack=0] [--iter=400] [--species=+1] [--queue=0.7] [--seed=1] [--out=目录]
//   --slack   收紧到几格容错为止（不给 = 0：一路收紧，每一档都存）
//   --species / --queue  在难度曲线的基础上改鱼种数（+1 = 多一种）和排队泡比例，做实验用
//   --out     把每一档写成 level_XXXX_s{容错}.json（不给只打印）
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CurveConfig } from '../../assets/scripts/core/config';
import * as LevelCurve from '../../assets/scripts/core/gen/levelCurve';
import { generate } from '../../assets/scripts/core/gen/levelGen';
import { longestRun, tighten } from '../../assets/scripts/core/gen/routeGen';
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
for (const [slack, snap] of [...r.bySlack.entries()].sort((a, b) => b[0] - a[0])) {
  const run = longestRun(snap.lv, snap.rep.route);
  console.log(`  容错 ${slack}：关键步 ${snap.rep.keySteps}（唯一 ${snap.rep.forced}）最少要 ${snap.rep.minBuffer} 格，路线最长连击 ${run}`);
  if (out) writeFileSync(join(out, `level_${String(id).padStart(4, '0')}_s${slack}.json`), snap.lv.toJson() + '\n');
}
console.log(`  试了 ${r.tries} 次交换，${((Date.now() - t0) / 1000).toFixed(0)}s`);
