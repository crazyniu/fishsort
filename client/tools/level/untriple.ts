// 修旧关卡里「一个气泡装了三条同种鱼」（core/gen/noTriple.ts，用户 2026-11-20）：多出来的那条和别的泡里一条换开，
// 换完重新量难度，几种换法里挑尺子量的过关率和原来最接近、想清楚的玩家照样过得了保底、参考解过得了结构校验的那种。不用整关重新生成。
// 用法：npx tsx tools/level/untriple.ts <关卡号>…   修这几关的包里本体、两个变体、调试页各档、每日挑战关（犯规的才动）
//       npx tsx tools/level/untriple.ts --daily-only <关卡号>…   只修这几关的每日挑战关
//       npx tsx tools/level/untriple.ts --merge     把各关改过的调试页读数合进 levels_lab/index.json（几关并行时各写各的一小份）
// 同样的关卡同样的结果（换法的随机数按关卡号和第几种换法定）。
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CurveConfig } from '../../assets/scripts/core/config';
import * as LevelCurve from '../../assets/scripts/core/gen/levelCurve';
import * as NoTriple from '../../assets/scripts/core/gen/noTriple';
import { longestRun } from '../../assets/scripts/core/gen/routeGen';
import { LevelData } from '../../assets/scripts/core/model/levelData';
import { Rng } from '../../assets/scripts/core/rng/rng';
import * as LevelCheck from '../../assets/scripts/core/solver/levelCheck';
import * as Players from '../../assets/scripts/core/solver/players';

const CLIENT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const CFG = join(CLIENT, 'assets/resources/config');
const LEVELS = join(CFG, 'levels');
const LAB = join(CFG, 'levels_lab');
const DAILY = join(CFG, 'levels_daily');
const OUT = join(CLIENT, 'tools/level/route_logs/untriple');
const curve = JSON.parse(readFileSync(join(CFG, 'level_curve.json'), 'utf8')) as CurveConfig;
const rc = curve.route!;
const preview = rc.preview;
const ruler: Players.Ruler = rc.ruler ? { kind: rc.ruler.kind, budget: rc.ruler.budget, slip: rc.ruler.slip } : { kind: 'casual' };
const rulerCheck = rc.ruler?.checkGames ?? rc.checkCasual;
/** 每个犯规的版本试几种换法 */
const TRIES = 3;
const pad = (n: number) => String(n).padStart(4, '0');

if (process.argv.includes('--merge')) {
  const indexPath = join(LAB, 'index.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as Record<string, { versions: Record<string, unknown> }>;
  let n = 0;
  for (const f of existsSync(OUT) ? readdirSync(OUT) : []) {
    const part = JSON.parse(readFileSync(join(OUT, f), 'utf8')) as Record<string, Record<string, unknown>>;
    for (const [id, vers] of Object.entries(part))
      for (const [pct, m] of Object.entries(vers)) {
        if (!index[id]?.versions[pct]) continue;
        index[id].versions[pct] = m;
        n++;
      }
  }
  writeFileSync(indexPath, JSON.stringify(index, null, 1) + '\n');
  console.log(`调试页读数合进 index.json：${n} 档`);
  process.exit(0);
}

/** 参考解：先用原来的；回放不过就让想清楚的玩家打几局找一条过得了结构校验的 */
const validRoute = (lv: LevelData): [number, number][] | null => {
  const ok = (r: readonly [number, number][]) => {
    const c = LevelData.fromDict(lv.toDict());
    c.ref = r.map((t) => [t[0], t[1]] as [number, number]);
    return LevelCheck.errors(c).length === 0;
  };
  if (lv.ref.length > 0 && ok(lv.ref)) return lv.ref.map((t) => [t[0], t[1]] as [number, number]);
  for (let g = 0; g < 30; g++) {
    const p = Players.play(lv, 'think', 5000 + g, { preview });
    if (p.won && ok(p.taps)) return p.taps;
  }
  return null;
};

interface Fixed {
  lv: LevelData;
  natural: number;
  casual: number;
  think: number;
  run: number;
}

/** 同一个布局（本体和调试页那一档常常是同一份）只修一次 */
const cache = new Map<string, Fixed | null>();
const key = (lv: LevelData) => JSON.stringify([lv.bubbles.map((b) => b.fish), lv.buffer, lv.prefill]);

function repair(lv: LevelData, id: number, floor: number, measure: boolean): Fixed | null {
  const k = key(lv);
  if (cache.has(k)) return cache.get(k) ?? null;
  const orig = measure ? Players.rulerRate(lv, ruler, rulerCheck, preview, 1000).win : 0;
  let best: (Fixed & { d: number }) | null = null;
  for (let t = 0; t < TRIES; t++) {
    const c = LevelData.fromDict(lv.toDict());
    if (NoTriple.fix(c, new Rng(id * 7919 + t * 104729 + 13)) > 0) continue;
    if (!measure) {
      const route = validRoute(c);
      if (!route) continue;
      c.ref = route;
      best = { lv: c, natural: 0, casual: 0, think: 0, run: longestRun(c, route), d: 0 };
      break;
    }
    const natural = Players.rulerRate(c, ruler, rulerCheck, preview, 1000).win;
    const d = Math.abs(natural - orig);
    if (best && d >= best.d) continue;
    const think = Players.rate(c, 'think', rc.checkThink, { preview }, 1000).win;
    if (think < floor - 0.05) continue;
    const route = validRoute(c);
    if (!route) continue;
    c.ref = route;
    const casual = ruler.kind === 'casual' ? natural : Players.rate(c, 'casual', rc.checkCasual, { preview }, 1000).win;
    best = { lv: c, natural, casual, think, run: longestRun(c, route), d };
    if (d <= 0.02) break;
  }
  const r = best ? { lv: best.lv, natural: best.natural, casual: best.casual, think: best.think, run: best.run } : null;
  cache.set(k, r);
  if (measure) console.log(`    原来 ${Math.round(orig * 100)}% → ${r ? `${Math.round(r.natural * 100)}%（想清楚 ${Math.round(r.think * 100)}%）` : '修不好'}`);
  return r;
}

const ids = process.argv.slice(2).filter((a) => /^\d+$/.test(a)).map(Number);
let bad = 0;
for (const id of ids) {
  const floor = LevelCurve.thinkFloorFor(curve, id);
  // 前 5 关是教学关（不按尺子收紧，难度很低），只换开、找一条参考解，不量
  const measure = LevelCurve.routeTarget(curve, id) !== null && id >= (rc.targets.from ?? 6);
  const labFix: Record<string, unknown> = {};
  const files: { path: string; lab?: string; daily?: boolean }[] = [];
  const dailyOnly = process.argv.includes('--daily-only');
  if (!dailyOnly) for (const s of ['', '_e1', '_e2']) files.push({ path: join(LEVELS, `level_${pad(id)}${s}.json`) });
  if (existsSync(LAB) && !dailyOnly) for (const f of readdirSync(LAB)) {
    const m = f.match(new RegExp(`^level_${pad(id)}_p(\\d+)\\.json$`));
    if (m) files.push({ path: join(LAB, f), lab: m[1] });
  }
  files.push({ path: join(DAILY, `level_${pad(id)}.json`), daily: true });
  for (const f of files) {
    if (!existsSync(f.path)) continue;
    const lv = LevelData.fromDict(JSON.parse(readFileSync(f.path, 'utf8')));
    if (NoTriple.violations(lv) === 0) continue;
    console.log(`  第 ${id} 关 ${f.path.slice(CFG.length + 1)}：${NoTriple.violations(lv)} 个泡有三条同种鱼`);
    const fl = f.daily && rc.daily ? rc.daily.floor : floor;
    const r = repair(lv, id, fl, measure);
    if (!r) {
      bad++;
      continue;
    }
    // 只换鱼和参考解，其它（id、变体名、种子……）照原来的
    lv.bubbles.forEach((b, i) => (b.fish = r.lv.bubbles[i].fish.slice()));
    lv.ref = r.lv.ref;
    writeFileSync(f.path, lv.toJson() + '\n');
    if (f.lab && measure) labFix[f.lab] = { natural: Math.round(r.natural * 100), casual: Math.round(r.casual * 100), think: Math.round(r.think * 100), run: r.run };
  }
  if (Object.keys(labFix).length > 0) {
    mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ [String(id)]: labFix }) + '\n');
  } else if (existsSync(join(OUT, `${id}.json`))) unlinkSync(join(OUT, `${id}.json`));
}
console.log(`@@UNTRIPLE ${JSON.stringify({ ids, bad })}`);
process.exit(bad > 0 ? 1 : 0);
