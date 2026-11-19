// 规定路线关卡（docs/02 第 0.4 节，2026-11-19 第二版）：生成一关能过的，再逐步收紧——随手点的玩家过关率往下压、
// 想清楚的玩家守在下限之上（两个玩家都只看屏幕上看得到的东西，core/solver/players.ts）。随手点的过关率每 10% 存一档。
// 用法：npx tsx tools/level/route.ts <关卡号> [--target=0.8] [--floor=0.9] [--preview=0] [--iter=800] [--species=+1] [--queue=0.7] [--seed=1] [--lab] [--pkg]
//   --target  这一关随手点的玩家过关率要多少（不给 = level_curve.json 的 route.targets，LevelCurve.routeTarget）
//   --down    一路压到多少为止（不给 = target）。给调试页多存几档更难的用，包里的本体照样取最接近 target 的那档
//   --floor / --preview / --iter  不给用 level_curve.json 的 route
//   --species / --queue  在难度曲线的基础上改鱼种数（+1 = 多一种）和排队泡比例，做实验用
//   --lab     把每一档写进包里的 config/levels_lab/，并更新 index.json（难度调试页从这里挑，docs/01 9.7）
//   --pkg     包里这一关（level_XXXX.json）换成最接近目标的那一档，两个变体（连输 2、4 次换上）用更容易的档
//   --labEntry=文件  和 --lab 一起用：这一关的索引写到这个文件，不直接改 index.json（批量并行时用，tools/level/routeAll.ts）
// 最后一行打印 @@RESULT {…}（批量生成汇总用）
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CurveConfig } from '../../assets/scripts/core/config';
import * as LevelCurve from '../../assets/scripts/core/gen/levelCurve';
import { generate } from '../../assets/scripts/core/gen/levelGen';
import { bucket, longestRun, tighten } from '../../assets/scripts/core/gen/routeGen';
import { LevelData } from '../../assets/scripts/core/model/levelData';
import * as LevelCheck from '../../assets/scripts/core/solver/levelCheck';
import * as Prefill from '../../assets/scripts/core/gen/prefill';
import { Rng } from '../../assets/scripts/core/rng/rng';
import * as Players from '../../assets/scripts/core/solver/players';
import * as Route from '../../assets/scripts/core/solver/route';

const CLIENT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const curve = JSON.parse(readFileSync(join(CLIENT, 'assets/resources/config/level_curve.json'), 'utf8')) as CurveConfig;
const arg = (name: string, def: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def;

const id = Number(process.argv[2]);
/** 生成参数：ease 0 照难度曲线，1、2 是连输变体用的放松参数（少一种鱼、少几条鱼……，level_curve.json 的 ease） */
const paramsFor = (ease: number) => {
  const p = { ...LevelCurve.params(curve, id, ease), scramble: 0, attempts: 8 };
  const sp = arg('species', '');
  if (sp) p.species = sp.startsWith('+') || sp.startsWith('-') ? p.species + Number(sp) : Number(sp);
  const q = arg('queue', '');
  if (q) p.queue = Number(q);
  return p;
};
let p = paramsFor(0);
const seed0 = Number(arg('seed', '1'));
const t0 = Date.now();
const rcMaybe = curve.route;
if (!rcMaybe) {
  console.log('level_curve.json 里没有 route（规定路线的收紧参数）');
  process.exit(1);
}
const rc = rcMaybe;
const preview = Number(arg('preview', String(rc.preview)));
const target = Number(arg('target', String(LevelCurve.routeTarget(curve, id) ?? 0.95)));
// 想清楚的玩家的保底按关定（docs/02 0.3：min(floor.max, 目标 + floor.gap)），--floor 可以手动给
const floor = Number(arg('floor', String(LevelCurve.thinkFloorFor(curve, id))));
// 尺子：量难度用哪个玩家（level_curve.json 的 route.ruler；不给 = 随手点的玩家）
const ruler: Players.Ruler = rc.ruler ? { kind: rc.ruler.kind, budget: rc.ruler.budget, slip: rc.ruler.slip } : { kind: 'casual' };
const rulerGames = rc.ruler?.games ?? rc.casualGames;
const rulerCheck = rc.ruler?.checkGames ?? rc.checkCasual;
const rulerName = ruler.kind === 'think' ? '想几步' : '随手点';
// 起点：想清楚的玩家过得去、随手点的也比目标容易一截（从容易往难里收紧，中间每档都有）。随机生成的偶尔不满足，换下一个种子；
// 20 个种子都比目标难，就换放松的生成参数（ease 1、2）再试；还是比目标难就取最容易的，收紧时反过来往容易里放松
let lv: LevelData | null = null;
let easiest = -1;
let seed = seed0;
let easeUsed = 0;
const want = Math.min(0.95, target + 0.2);
for (let ease = 0; ease <= 2 && easiest < want; ease++) {
  const pe = paramsFor(ease);
  for (let sd = seed0; sd < seed0 + 20; sd++) {
    const x = generate(pe, LevelCurve.seedFor(id, 0) + sd * 7919 + ease * 104729, (y) => Route.solve(y, 100000).taps);
    // 难关开局占格（docs/01 9.3）：先从气泡里拿出几条后面才要的鱼放进暂存槽，再量、再收紧
    const pf = LevelCurve.prefillFor(curve, id);
    if (x && pf > 0 && curve.prefill) Prefill.apply(x, pf, curve.prefill.after, new Rng(id * 131 + sd * 17 + ease));
    if (!x || Players.rate(x, 'think', rc.thinkGames, { preview }, 0, floor).win < floor) continue;
    const c = Players.rulerRate(x, ruler, rulerGames, preview).win;
    if (c > easiest) {
      easiest = c;
      lv = x;
      seed = sd;
      easeUsed = ease;
      p = pe;
    }
    if (c >= want) break;
  }
}
if (easeUsed > 0) console.log(`  生成参数按放松 ${easeUsed} 档（难度曲线的参数对这一关偏难）`);
if (!lv) {
  console.log(`第 ${id} 关生成失败（20 个种子都没有想清楚就过得去的）`);
  process.exit(1);
}
if (easiest < target) console.log(`  注意：生成出来最容易的也只有 ${Math.round(easiest * 100)}%，比目标难，收紧时反过来放松`);
lv.id = id;
const fish = lv.bubbles.reduce((n, b) => n + b.fish.length, 0);
console.log(`第 ${id} 关（种子 ${seed}）鱼 ${fish} 种 ${p.species} 泡 ${lv.bubbles.length} 层 ${p.layers} 排队 ${lv.bubbles.filter((b) => b.queue).length} 冰 ${lv.bubbles.filter((b) => b.ice.length).length} 锁 ${lv.bubbles.filter((b) => b.chain).length} 暂存槽 ${lv.buffer}`);
const opts = {
  target: Math.min(target, Number(arg('down', String(target)))),
  ruler,
  rulerGames,
  thinkFloor: floor,
  preview,
  iterations: Number(arg('iter', String(rc.iterations))),
  seed,
  casualGames: rc.casualGames,
  thinkGames: rc.thinkGames,
};
// 收紧时一直用同一组种子量，挑出来的交换会偏向「刚好坑到这几局」：换一组种子多打几局复量，调试页和挑本体都用复量的数。
// 复量下来离目标还差 5 个点以上、而且是相邻两档之间跳过了目标，换一个收紧的随机种子从头再收一次，最多 3 次，所有档放在一起挑
interface Ver {
  pct: number;
  lv: LevelData;
  /** 尺子量的过关率（复量）：这一档的难度 */
  casual: number;
  /** 随手点的玩家（复量，调试页上参考） */
  rand: number;
  think: number;
  run: number;
}
/**
 * 参考解要过结构校验（LevelCheck.errors：回放能赢、冰封泡落下时依赖泡还没破……）。想清楚的玩家赢下来的第一条不行，
 * 就换种子再打几局、找一条行的；都不行返回 null（这一档不要）
 */
const validRoute = (lv: LevelData, first: readonly [number, number][]): [number, number][] | null => {
  const ok = (r: readonly [number, number][]) => {
    const c = LevelData.fromDict(lv.toDict());
    c.ref = r.map((t) => [t[0], t[1]] as [number, number]);
    return LevelCheck.errors(c).length === 0;
  };
  if (ok(first)) return first.slice() as [number, number][];
  for (let g = 0; g < 30; g++) {
    const p = Players.play(lv, 'think', 5000 + g, { preview });
    if (p.won && ok(p.taps)) return p.taps;
  }
  return null;
};
const all: Ver[] = [];
let tries = 0;
for (let attempt = 0; attempt < 3; attempt++) {
  // 第一轮从生成出来的关收；之后：所有档都还比目标容易（同一组种子量出来到了、复量又回弹），就从最接近目标的那档接着收，
  // 换一组种子量；目标两边都有档（中间跳过了），从头换个随机种子重收
  const above = all.filter((v) => v.casual > target).sort((a, b) => a.casual - b.casual);
  const from = attempt > 0 && above.length > 0 && !all.some((v) => v.casual < target) ? above[0].lv : lv;
  const r = tighten(from, { ...opts, seed: opts.seed + attempt * 7777, seedBase: attempt * 10007 });
  tries += r.tries;
  for (const snap of Array.from(r.byPct.values())) {
    const casual = Players.rulerRate(snap.lv, ruler, rulerCheck, preview, 1000).win;
    const rand = ruler.kind === 'casual' ? casual : Players.rate(snap.lv, 'casual', rc.checkCasual, { preview }, 1000).win;
    const think = Players.rate(snap.lv, 'think', rc.checkThink, { preview }, 1000).win;
    // 参考解换成想清楚的玩家赢下来的那条（看得见的信息走得出来；交换过鱼以后生成时的参考解也不对了）
    const route = validRoute(snap.lv, snap.m.route);
    if (route) snap.lv.ref = route;
    const run = route ? longestRun(snap.lv, route) : 0;
    const tag = think < floor - 0.05 ? '（想清楚的复量不够，不要）' : route === null ? '（找不到过结构校验的参考解，不要）' : '';
    console.log(`  [${attempt + 1}] ${rulerName} ${Math.round(casual * 100)}%  随手点 ${Math.round(rand * 100)}%  想清楚 ${Math.round(think * 100)}%  路线最长连击 ${run}${tag}`);
    if (!tag) all.push({ pct: bucket(casual), lv: snap.lv, casual, rand, think, run });
  }
  // 有一档离目标 5 个点以内就行；所有档都比目标难（放不上来）再收也一样，不重来；
  // 跳过了目标、或者都还比目标容易（复量回弹），再收一轮
  if (all.some((v) => Math.abs(v.casual - target) <= 0.05)) break;
  if (!all.some((v) => v.casual > target)) break;
  // 这一轮一档都没比上一轮更接近（压不动了），也停
  if (attempt > 0 && r.byPct.size <= 1) break;
}
console.log(`  目标：${rulerName} ${Math.round(target * 100)}%，想清楚的不低于 ${Math.round(opts.thinkFloor * 100)}%，预告 ${opts.preview} 缸；试了 ${tries} 次交换，${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (all.length === 0) {
  console.log('  没有一档想清楚的玩家过得去，换个种子');
  process.exit(1);
}
/** 最接近 want 的一档；above：只在比 above 更容易的档里挑 */
const nearest = (want: number, above = -1): Ver | null => {
  let best: Ver | null = null;
  for (const v of all) {
    if (v.casual <= above) continue;
    if (best === null || Math.abs(v.casual - want) < Math.abs(best.casual - want)) best = v;
  }
  return best;
};
const main = nearest(target) as Ver;
// 调试页每 10% 一档：同一档留想清楚的更稳的；包里那一档一定留
const vers: Ver[] = [];
for (const v of all) {
  const old = vers.findIndex((x) => x.pct === v.pct);
  if (old >= 0 && (vers[old] === main || (v !== main && vers[old].think >= v.think))) continue;
  if (old >= 0) vers.splice(old, 1);
  vers.push(v);
}
vers.sort((a, b) => b.pct - a.pct);
console.log(`  分档：${vers.map((v) => `${v.pct}（${Math.round(v.casual * 100)}%）`).join(' ')}`);
if (vers.length === 0) process.exit(1);

const pad = (n: number) => String(n).padStart(4, '0');
const LEVELS = join(CLIENT, 'assets/resources/config/levels');
const LAB = join(CLIENT, 'assets/resources/config/levels_lab');
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
  console.log(`  包里的第 ${id} 关换成档 ${main.pct}（${rulerName} ${Math.round(main.casual * 100)}%）`);
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
    versions[String(v.pct)] = { natural: Math.round(v.casual * 100), casual: Math.round(v.rand * 100), think: Math.round(v.think * 100), run: v.run };
  }
  const entry = { base: main.pct, target: Math.round(target * 100), versions };
  // 批量生成（routeAll.ts）时几关同时跑，各写各的一小份，跑完再合进 index.json（不然同时改一个文件会互相盖掉）
  const entryOut = arg('labEntry', '');
  if (entryOut) writeFileSync(entryOut, JSON.stringify({ [String(id)]: entry }) + '\n');
  else {
    index[String(id)] = entry;
    const sorted = Object.fromEntries(Object.keys(index).sort((a, b) => Number(a) - Number(b)).map((k) => [k, index[k]]));
    writeFileSync(indexPath, JSON.stringify(sorted, null, 1) + '\n');
  }
  console.log(`  各档写进 config/levels_lab（${vers.map((v) => v.pct).join('、')}）`);
}
console.log(
  '@@RESULT ' +
    JSON.stringify({
      id,
      kind: LevelCurve.isBoss(curve, id) ? 'boss' : LevelCurve.isChallenge(curve, id) ? 'hard' : 'normal',
      target: Math.round(target * 1000) / 10,
      casual: Math.round(main.casual * 1000) / 10,
      rand: Math.round(main.rand * 1000) / 10,
      think: Math.round(main.think * 100),
      ease: easeUsed,
      versions: vers.map((v) => Math.round(v.casual * 100)),
      seconds: Math.round((Date.now() - t0) / 1000),
    }),
);
