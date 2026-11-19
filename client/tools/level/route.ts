// 规定路线关卡（docs/02 第 0.4 节，2026-11-19 第二版）：生成一关能过的，再逐步收紧——随手点的玩家过关率往下压、
// 想清楚的玩家守在下限之上（两个玩家都只看屏幕上看得到的东西，core/solver/players.ts）。随手点的过关率每 10% 存一档。
// 用法：npx tsx tools/level/route.ts <关卡号> [--target=0.8] [--floor=0.9] [--preview=0] [--iter=800] [--species=+1] [--queue=0.7] [--seed=1] [--lab] [--pkg]
//   --target  这一关随手点的玩家过关率要多少（不给 = level_curve.json 的 jam.targets 里这一关的「不花」那一档）
//   --down    一路压到多少为止（不给 = target）。给调试页多存几档更难的用，包里的本体照样取最接近 target 的那档
//   --floor / --preview / --iter  不给用 level_curve.json 的 route
//   --species / --queue  在难度曲线的基础上改鱼种数（+1 = 多一种）和排队泡比例，做实验用
//   --lab     把每一档写进包里的 config/levels_lab/，并更新 index.json（难度调试页从这里挑，docs/01 9.7）
//   --pkg     包里这一关（level_XXXX.json）换成最接近目标的那一档，两个变体（连输 2、4 次换上）用更容易的档
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CurveConfig } from '../../assets/scripts/core/config';
import * as LevelCurve from '../../assets/scripts/core/gen/levelCurve';
import { generate } from '../../assets/scripts/core/gen/levelGen';
import { bucket, longestRun, tighten } from '../../assets/scripts/core/gen/routeGen';
import { LevelData } from '../../assets/scripts/core/model/levelData';
import * as Players from '../../assets/scripts/core/solver/players';
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
const seed0 = Number(arg('seed', '1'));
const t0 = Date.now();
const rc = curve.route ?? { preview: 0, thinkFloor: 0.9, iterations: 800, casualGames: 120, thinkGames: 20, checkCasual: 300, checkThink: 40 };
const floor = Number(arg('floor', String(rc.thinkFloor)));
const preview = Number(arg('preview', String(rc.preview)));
const target = Number(arg('target', String(LevelCurve.jamTargets(curve, id, 0)?.[0] ?? 0.8)));
// 起点：想清楚的玩家过得去、随手点的也比目标容易一截（收紧只会往难里走）。随机生成的偶尔两样都不满足，换下一个种子；
// 20 个种子都比目标难，就用其中最容易的（这一关的生成参数比目标难，要回头调难度曲线）
let lv: LevelData | null = null;
let easiest = -1;
let seed = seed0;
for (let sd = seed0; sd < seed0 + 20; sd++) {
  const x = generate(p, LevelCurve.seedFor(id, 0) + sd * 7919, (y) => Route.solve(y, 100000).taps);
  if (!x || Players.rate(x, 'think', rc.thinkGames, { preview }, 0, floor).win < floor) continue;
  const c = Players.rate(x, 'casual', rc.casualGames, { preview }).win;
  if (c > easiest) {
    easiest = c;
    lv = x;
    seed = sd;
  }
  if (c >= Math.min(0.95, target + 0.2)) break;
}
if (!lv) {
  console.log(`第 ${id} 关生成失败（20 个种子都没有想清楚就过得去的）`);
  process.exit(1);
}
if (easiest < target) console.log(`  注意：生成出来最容易的也只有 ${Math.round(easiest * 100)}%，比目标难（难度曲线的生成参数要调）`);
lv.id = id;
const fish = lv.bubbles.reduce((n, b) => n + b.fish.length, 0);
console.log(`第 ${id} 关（种子 ${seed}）鱼 ${fish} 种 ${p.species} 泡 ${lv.bubbles.length} 层 ${p.layers} 排队 ${lv.bubbles.filter((b) => b.queue).length} 冰 ${lv.bubbles.filter((b) => b.ice.length).length} 锁 ${lv.bubbles.filter((b) => b.chain).length} 暂存槽 ${lv.buffer}`);
const opts = {
  casual: Math.min(target, Number(arg('down', String(target)))),
  thinkFloor: floor,
  preview,
  iterations: Number(arg('iter', String(rc.iterations))),
  seed,
  casualGames: rc.casualGames,
  thinkGames: rc.thinkGames,
};
const r = tighten(lv, opts);
console.log(`  目标：随手点 ${Math.round(target * 100)}%，想清楚的不低于 ${Math.round(opts.thinkFloor * 100)}%，预告 ${opts.preview} 缸；试了 ${r.tries} 次交换，${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (r.byPct.size === 0) {
  console.log('  生成出来的关想清楚的玩家都过不了，换个种子');
  process.exit(1);
}
// 收紧时一直用同一组种子量，挑出来的交换会偏向「刚好坑到这几局」：换一组种子多打几局复量，调试页和挑本体都用复量的数
interface Ver {
  pct: number;
  lv: LevelData;
  casual: number;
  think: number;
  run: number;
}
const vers: Ver[] = [];
for (const snap of Array.from(r.byPct.values())) {
  const casual = Players.rate(snap.lv, 'casual', rc.checkCasual, { preview }, 1000).win;
  const think = Players.rate(snap.lv, 'think', rc.checkThink, { preview }, 1000).win;
  // 参考解换成想清楚的玩家赢下来的那条（看得见的信息走得出来；交换过鱼以后生成时的参考解也不对了）
  snap.lv.ref = snap.m.route.slice();
  const run = longestRun(snap.lv, snap.m.route);
  const pct = bucket(casual);
  const tag = think < floor - 0.05 ? '（想清楚的复量不够，不要）' : '';
  console.log(`  随手点 ${Math.round(casual * 100)}%  想清楚 ${Math.round(think * 100)}%  路线最长连击 ${run}${tag}`);
  if (tag) continue;
  // 按复量的数重新分档；同一档留想清楚的更稳的
  const old = vers.findIndex((v) => v.pct === pct);
  if (old >= 0 && vers[old].think >= think) continue;
  if (old >= 0) vers.splice(old, 1);
  vers.push({ pct, lv: snap.lv, casual, think, run });
}
vers.sort((a, b) => b.pct - a.pct);
console.log(`  分档：${vers.map((v) => `${v.pct}（${Math.round(v.casual * 100)}%）`).join(' ')}`);
if (vers.length === 0) process.exit(1);

const pad = (n: number) => String(n).padStart(4, '0');
const LEVELS = join(CLIENT, 'assets/resources/config/levels');
const LAB = join(CLIENT, 'assets/resources/config/levels_lab');
/** 复量后最接近 want 的一档；above：只在比 above 更容易的档里挑 */
const nearest = (want: number, above = -1): Ver | null => {
  let best: Ver | null = null;
  for (const v of vers) {
    if (v.casual <= above) continue;
    if (best === null || Math.abs(v.casual - want) < Math.abs(best.casual - want)) best = v;
  }
  return best;
};
const main = nearest(target) as Ver;
if (process.argv.includes('--pkg')) {
  const out = LevelData.fromDict(main.lv.toDict());
  out.id = id;
  out.variants = [`level_${pad(id)}_e1`, `level_${pad(id)}_e2`];
  writeFileSync(join(LEVELS, `level_${pad(id)}.json`), out.toJson() + '\n');
  // 变体：更容易的档（随手点的过关率高 15、30 个点左右）；没有更容易的档就在最容易的那档上多给暂存槽
  let prev = main;
  for (const e of [1, 2]) {
    const v = nearest(target + 0.15 * e, prev.casual);
    let lvE: LevelData;
    if (v !== null) {
      lvE = LevelData.fromDict(v.lv.toDict());
      prev = v;
    } else {
      lvE = LevelData.fromDict(prev.lv.toDict());
      lvE.buffer = Math.min(7, lvE.buffer + 1);
    }
    lvE.id = id;
    lvE.variants = [];
    writeFileSync(join(LEVELS, `level_${pad(id)}_e${e}.json`), lvE.toJson() + '\n');
  }
  console.log(`  包里的第 ${id} 关换成档 ${main.pct}（随手点 ${Math.round(main.casual * 100)}%）`);
}
if (process.argv.includes('--lab')) {
  mkdirSync(LAB, { recursive: true });
  const indexPath = join(LAB, 'index.json');
  const index = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {};
  // 这一关旧的各档文件删掉（档的名字变了的话不留垃圾）
  for (const f of readdirSync(LAB)) if (f.startsWith(`level_${pad(id)}_`)) unlinkSync(join(LAB, f));
  const versions: Record<string, unknown> = {};
  for (const v of vers) {
    const out = LevelData.fromDict(v.lv.toDict());
    out.id = id;
    out.variants = [];
    writeFileSync(join(LAB, `level_${pad(id)}_p${v.pct}.json`), out.toJson() + '\n');
    versions[String(v.pct)] = { natural: Math.round(v.casual * 100), think: Math.round(v.think * 100), run: v.run };
  }
  index[String(id)] = { base: main.pct, target: Math.round(target * 100), versions };
  const sorted = Object.fromEntries(Object.keys(index).sort((a, b) => Number(a) - Number(b)).map((k) => [k, index[k]]));
  writeFileSync(indexPath, JSON.stringify(sorted, null, 1) + '\n');
  console.log(`  各档写进 config/levels_lab（${vers.map((v) => v.pct).join('、')}）`);
}
