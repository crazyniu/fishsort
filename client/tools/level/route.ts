// 规定路线关卡（docs/02 第 0.4 节，2026-11-19 第二版）：生成一关能过的，再逐步收紧——随手点的玩家过关率往下压、
// 想清楚的玩家守在下限之上（两个玩家都只看屏幕上看得到的东西，core/solver/players.ts）。随手点的过关率每 10% 存一档。
// 用法：npx tsx tools/level/route.ts <关卡号> [--target=0.8] [--floor=0.9] [--preview=0] [--iter=800] [--species=+1] [--queue=0.7] [--seed=1] [--lab] [--pkg]
//   --target  这一关随手点的玩家过关率要多少（不给 = level_curve.json 的 route.targets，LevelCurve.routeTarget）
//   --down    一路压到多少为止（不给 = target）。给调试页多存几档更难的用，包里的本体照样取最接近 target 的那档
//   --floor / --preview / --iter  不给用 level_curve.json 的 route
//   --species / --queue  在难度曲线的基础上改鱼种数（+1 = 多一种）和排队泡比例，做实验用
//   --lab     把每一档写进包里的 config/levels_lab/，并更新 index.json（难度调试页从这里挑，docs/01 9.7）
//   --pkg     包里这一关（level_XXXX.json）换成最接近目标的那一档，两个变体（连输 2、4 次换上）用更容易的档
//   --daily   每日挑战的专用难关（docs/01 5.11）：目标、保底用 level_curve.json 的 route.daily，只写 config/levels_daily/level_XXXX.json
//   --labEntry=文件  和 --lab 一起用：这一关的索引写到这个文件，不直接改 index.json（批量并行时用，tools/level/routeAll.ts）
//   --fresh   不用难度库（tools/level/pool.ts）：不从库里拿、不往库里存，照旧从头生成
// 最后一行打印 @@RESULT {…}（批量生成汇总用）
import { fileURLToPath } from 'node:url';
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
import * as Pool from './pool';
import * as NoTriple from '../../assets/scripts/core/gen/noTriple';

const CLIENT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
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
const daily = process.argv.includes('--daily') ? rc.daily : undefined;
if (process.argv.includes('--daily') && !daily) {
  console.log('level_curve.json 的 route 里没有 daily（每日挑战关的目标）');
  process.exit(1);
}
const target = Number(arg('target', String(daily ? daily.target : (LevelCurve.routeTarget(curve, id) ?? 0.95))));
// 想清楚的玩家的保底按关定（docs/02 0.3：min(floor.max, 目标 + floor.gap)），--floor 可以手动给
const floor = Number(arg('floor', String(daily ? daily.floor : LevelCurve.thinkFloorFor(curve, id))));
// 尺子：量难度用哪个玩家（level_curve.json 的 route.ruler；不给 = 随手点的玩家）
const ruler: Players.Ruler = rc.ruler ? { kind: rc.ruler.kind, budget: rc.ruler.budget, slip: rc.ruler.slip } : { kind: 'casual' };
const rulerGames = rc.ruler?.games ?? rc.casualGames;
const rulerCheck = rc.ruler?.checkGames ?? rc.checkCasual;
const rulerName = ruler.kind === 'think' ? '想几步' : '随手点';
// 起点：想清楚的玩家过得去、随手点的也比目标容易一截（从容易往难里收紧，中间每档都有）。随机生成的偶尔不满足，换下一个种子；
// 20 个种子都比目标难，就换放松的生成参数（ease 1、2）再试；还是比目标难就取最容易的，收紧时反过来往容易里放松
const want = Math.min(0.95, target + 0.2);
interface Start {
  lv: LevelData;
  seed: number;
  ease: number;
}
/** 从第 fromSeed 个种子起找一个开局布局；20 个种子（每个放松档）都没有想清楚就过得去的，返回 null */
const pickStart = (fromSeed: number): Start | null => {
  let best: Start | null = null;
  let easiest = -1;
  for (let ease = 0; ease <= 2 && easiest < want; ease++) {
    const pe = paramsFor(ease);
    for (let sd = fromSeed; sd < fromSeed + 20; sd++) {
      const x = generate(pe, LevelCurve.seedFor(id, 0) + sd * 7919 + ease * 104729, (y) => Route.solve(y, 100000).taps);
      // 难关开局占格（docs/01 9.3）：先从气泡里拿出几条后面才要的鱼放进暂存槽，再量、再收紧
      const pf = LevelCurve.prefillFor(curve, id);
      if (x && pf > 0 && curve.prefill) Prefill.apply(x, pf, curve.prefill.after, new Rng(id * 131 + sd * 17 + ease));
      // 同一个泡里同种鱼最多两条（noTriple.ts）：生成出来有三条的先换开，换不开就换下一个种子
      if (x && NoTriple.fix(x, new Rng(id * 977 + sd * 31 + ease)) > 0) continue;
      if (!x || Players.rate(x, 'think', rc.thinkGames, { preview }, 0, floor).win < floor) continue;
      const c = Players.rulerRate(x, ruler, rulerGames, preview).win;
      if (c > easiest) {
        easiest = c;
        best = { lv: x, seed: sd, ease };
        p = pe;
      }
      if (c >= want) break;
    }
  }
  if (!best) return null;
  if (best.ease > 0) console.log(`  生成参数按放松 ${best.ease} 档（难度曲线的参数对这一关偏难）`);
  if (easiest < target) console.log(`  注意：生成出来最容易的也只有 ${Math.round(easiest * 100)}%，比目标难，收紧时反过来放松`);
  best.lv.id = id;
  const lv = best.lv;
  const fish = lv.bubbles.reduce((n, b) => n + b.fish.length, 0);
  console.log(`第 ${id} 关（种子 ${best.seed}）鱼 ${fish} 种 ${p.species} 泡 ${lv.bubbles.length} 层 ${p.layers} 排队 ${lv.bubbles.filter((b) => b.queue).length} 冰 ${lv.bubbles.filter((b) => b.ice.length).length} 锁 ${lv.bubbles.filter((b) => b.chain).length} 暂存槽 ${lv.buffer}`);
  return best;
};
const opts = {
  target: Math.min(target, Number(arg('down', String(target)))),
  ruler,
  rulerGames,
  thinkFloor: floor,
  preview,
  iterations: Number(arg('iter', String(rc.iterations))),
  casualGames: rc.casualGames,
  thinkGames: rc.thinkGames,
  // 一路上每 5 个点存一份（原来 10 个点）：难度库里能挑的版本多一倍，以后改目标多半直接拿
  snapStep: 5,
};
// 收紧时一直用同一组种子量，挑出来的交换会偏向「刚好坑到这几局」：换一组种子多打几局复量，调试页和挑本体都用复量的数。
// 复量一般比收紧时量的松（2026-11-20 第 81–290 关：收到目标就停，复量平均松 5–10 个点，第 114 关 34% → 47%）。所以：
// - 收紧时往下多压 OVERSHOOT，越过目标一点，最后按复量挑最接近目标的那一版；
// - 复量下来所有版本都还比目标松：从最接近的那版接着收，收紧的目标再往下压「回弹了多少」，换一组种子量，一个布局最多 MAX_ATTEMPTS 轮；
// - 目标两边都有版本、但都差 5 个点以上（中间跳过了）：从头换个随机种子重收
// 调不动就换布局（2026-11-20 第 100 关：原来的布局一往难里收，想清楚的玩家也跟着过不去，收了一小时还是 15%；换个布局 4 分钟到 5%）：
// - 同一个布局连着两轮，最接近目标的那版没再近 STUCK_GAIN 以上，就记成「收不动」，换下一个种子的布局重来，最多 MAX_LAYOUTS 个布局、一共 MAX_ROUNDS 轮。
//   按轮数判断、不按用了多久（同样的参数生成出同样的关卡，查得回来）
const OVERSHOOT = 0.05;
const MAX_ATTEMPTS = 5;
const MAX_LAYOUTS = 3;
const MAX_ROUNDS = 8;
const STUCK_GAIN = 0.03;
interface Ver {
  pct: number;
  lv: LevelData;
  /** 尺子量的过关率（复量）：这一档的难度 */
  casual: number;
  /** 随手点的玩家（复量，调试页上参考） */
  rand: number;
  think: number;
  run: number;
  /** 哪条链（同一个开局布局收紧出来的各版，tools/level/pool.ts） */
  chain: string;
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

// 难度库（tools/level/pool.ts）：同配置的关共用一组；每日挑战和 --fresh 不用库
const kind = LevelCurve.isBoss(curve, id) ? 'boss' : LevelCurve.isChallenge(curve, id) ? 'hard' : 'normal';
const base = paramsFor(0) as Record<string, unknown> & { queue?: number };
const group = Pool.groupKey({
  p: { ...base, queue: base.queue === undefined ? undefined : Math.floor(base.queue * 20), scrambleFrom: undefined, scramble: undefined },
  prefill: LevelCurve.prefillFor(curve, id),
  kind,
  preview,
  ruler,
});
const usePool = !daily && !process.argv.includes('--fresh');
const okFloor = (v: { think: number }) => v.think >= floor - 0.05;
const near = (v: { casual: number }) => Math.abs(v.casual - target) <= 0.05;
const toVer = (c: Pool.Chain, v: Pool.PoolVer): Ver => ({ pct: bucket(v.casual), lv: LevelData.fromDict(v.lv), casual: v.casual, rand: v.rand, think: v.think, run: v.run, chain: c.id });
// 库里以前存的、有泡装了三条同种鱼的版本不要（2026-11-20 加这条规则以前存的）
const poolVers = (c: Pool.Chain) => c.versions.filter(okFloor).map((v) => toVer(c, v)).filter((v) => NoTriple.violations(v.lv) === 0);
/** 同组里这一关能用的链：没人用的，或者本来就是这一关的 */
const free = new Map<string, Pool.Chain>();
if (usePool) {
  for (const c of Pool.chains(CLIENT, group)) {
    const o = Pool.owner(CLIENT, group, c.id);
    if (o === null || o === id) free.set(c.id, c);
  }
}
const isOwn = (c: Pool.Chain) => Pool.owner(CLIENT, group, c.id) === id;
const all: Ver[] = [];
const chainsUsed = new Map<string, Pool.Chain>();
let tries = 0;
let rounds = 0;
let layouts = 0;
/** 这一关从哪来：pool = 库里直接拿，resume = 库里接着收，new = 新布局 */
let source = 'new';

// 1. 库里已经有离目标 5 个点以内的：直接拿（这一关自己的链优先，换不动就不换；再看同组没人用的、最接近目标的）
const hits = Array.from(free.values())
  .map((c) => ({ c, d: Math.min(9, ...poolVers(c).map((v) => Math.abs(v.casual - target))), own: isOwn(c) }))
  .filter((x) => x.d <= 0.05)
  .sort((a, b) => Number(b.own) - Number(a.own) || a.d - b.d);
for (const x of hits) {
  if (!Pool.claim(CLIENT, group, x.c.id, id)) continue;
  all.push(...poolVers(x.c));
  chainsUsed.set(x.c.id, x.c);
  source = 'pool';
  console.log(`第 ${id} 关从难度库拿：链 ${x.c.id}（第 ${x.c.from} 关生成，${x.c.versions.length} 版）`);
  break;
}

if (source !== 'pool') {
  // 2. 库里有没卡住、比目标容易的版本：从最接近目标的那版接着收（不从头生成）
  let resume: { c: Pool.Chain; v: Ver } | null = null;
  for (const c of Array.from(free.values())) {
    if (c.stuck) continue;
    for (const v of poolVers(c)) if (v.casual > target && (resume === null || v.casual < resume.v.casual)) resume = { c, v };
  }
  if (resume !== null && !Pool.claim(CLIENT, group, resume.c.id, id)) resume = null;
  let nextSeed = seed0;
  let done = false;
  for (let layout = 0; layout < MAX_LAYOUTS && rounds < MAX_ROUNDS && !done; layout++) {
    let chain: Pool.Chain;
    let from: LevelData;
    let fromPool = false;
    if (layout === 0 && resume !== null) {
      chain = resume.c;
      from = resume.v.lv;
      fromPool = true;
      source = 'resume';
      console.log(`第 ${id} 关从难度库接着收：链 ${chain.id}（第 ${chain.from} 关生成），从 ${Math.round(resume.v.casual * 100)}% 那版开始`);
    } else {
      const st = pickStart(nextSeed);
      if (st === null) break;
      nextSeed = st.seed + 1;
      const cid = `${id}-${st.ease}-${st.seed}`;
      const old = free.get(cid);
      // 同一个布局以前生成过（这一关以前跑过同一个种子）：接着往那条链里加；被同组别的关拿走了就换下一个种子
      if (usePool && !Pool.claim(CLIENT, group, cid, id)) continue;
      chain = old ?? { id: cid, group, from: id, seed: st.seed, ease: st.ease, versions: [] };
      from = st.lv;
    }
    layouts++;
    chainsUsed.set(chain.id, chain);
    all.push(...poolVers(chain).filter((v) => !all.some((w) => w.chain === v.chain)));
    let prevBest = Infinity;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && rounds < MAX_ROUNDS; attempt++) {
      const mine = all.filter((v) => v.chain === chain.id);
      // 第一轮从生成出来的关收（从库里接着收的从那一版收）；之后见上面
      const above = mine.filter((v) => v.casual > target).sort((a, b) => a.casual - b.casual);
      const resumeIn = (attempt > 0 || fromPool) && above.length > 0 && !mine.some((v) => v.casual < target);
      const start0 = resumeIn ? above[0].lv : from;
      // 收紧时的目标：比真正的目标低 OVERSHOOT；接着收的那几轮再低「最接近的那版复量回弹了多少」（只对往下收有用；往上放松的不压）
      const bounce = resumeIn ? above[0].casual - target : 0;
      const aim = opts.target >= target ? Math.max(0.01, opts.target - OVERSHOOT - bounce) : opts.target;
      // 每条链记着收过几轮：接着收的时候换一组种子量（同一组种子量出来的偏向坑到那几局）
      const n = chain.rounds ?? 0;
      chain.rounds = n + 1;
      rounds++;
      const r = tighten(start0, { ...opts, target: aim, seed: chain.seed + n * 7777, seedBase: n * 10007 });
      tries += r.tries;
      const st = r.stats;
      console.log(`  [${rounds}] 交换 ${r.tries}：没量尺子 ${st.skip}，尺子不要 ${st.ruler}，想清楚的不够 ${st.think}，留下 ${st.kept}，${((Date.now() - t0) / 1000).toFixed(0)}s`);
      for (const snap of Array.from(r.byPct.values())) {
        const casual = Players.rulerRate(snap.lv, ruler, rulerCheck, preview, 1000).win;
        const rand = ruler.kind === 'casual' ? casual : Players.rate(snap.lv, 'casual', rc.checkCasual, { preview }, 1000).win;
        const think = Players.rate(snap.lv, 'think', rc.checkThink, { preview }, 1000).win;
        // 参考解换成想清楚的玩家赢下来的那条（看得见的信息走得出来；交换过鱼以后生成时的参考解也不对了）
        const route = validRoute(snap.lv, snap.m.route);
        if (route) snap.lv.ref = route;
        const run = route ? longestRun(snap.lv, route) : 0;
        const tag = think < floor - 0.05 ? '（想清楚的复量不够，不要）' : route === null ? '（找不到过结构校验的参考解，不要）' : '';
        console.log(`  [${rounds}] ${rulerName} ${Math.round(casual * 100)}%  随手点 ${Math.round(rand * 100)}%  想清楚 ${Math.round(think * 100)}%  路线最长连击 ${run}${tag}`);
        // 进库的：参考解过得了结构校验的都存（想清楚的够不够按用的时候的保底再挑）
        if (route) chain.versions.push({ casual, rand, think, run, lv: snap.lv.toDict() });
        if (!tag) all.push({ pct: bucket(casual), lv: snap.lv, casual, rand, think, run, chain: chain.id });
      }
      if (usePool) Pool.save(CLIENT, chain);
      const now = all.filter((v) => v.chain === chain.id);
      // 有一档离目标 5 个点以内就行；所有档都比目标难（放不上来）再收也一样，不重来、也不换布局
      if (now.some(near) || (now.length > 0 && !now.some((v) => v.casual > target))) {
        done = true;
        break;
      }
      // 调不动了：这一轮一档都没比上一轮更接近（压不动），或者连着两轮最接近的那版没再近 STUCK_GAIN 以上 → 换布局
      const best = Math.min(Infinity, ...now.filter((v) => v.casual > target).map((v) => v.casual));
      if (attempt > 0 && ((r.byPct.size <= 1 && r.tries > 0) || !(prevBest - best >= STUCK_GAIN))) {
        chain.stuck = true;
        if (usePool) Pool.save(CLIENT, chain);
        console.log(`  这个布局收不动了（最接近的 ${Number.isFinite(best) ? Math.round(best * 100) + '%' : '没有'}），换下一个布局`);
        break;
      }
      prevBest = best;
    }
  }
}
console.log(`  目标：${rulerName} ${Math.round(target * 100)}%，想清楚的不低于 ${Math.round(opts.thinkFloor * 100)}%，预告 ${opts.preview} 缸；${source === 'pool' ? '从难度库拿' : `${layouts} 个布局 ${rounds} 轮，试了 ${tries} 次交换`}，${((Date.now() - t0) / 1000).toFixed(0)}s`);
if (all.length === 0) {
  console.log('  没有一档想清楚的玩家过得去，换个种子');
  process.exit(1);
}
/** 最接近 want 的一档；above：只在比 above 更容易的档里挑；from：在哪几版里挑 */
const nearest = (want: number, above = -1, from: Ver[] = all): Ver | null => {
  let best: Ver | null = null;
  for (const v of from) {
    if (v.casual <= above) continue;
    if (best === null || Math.abs(v.casual - want) < Math.abs(best.casual - want)) best = v;
  }
  return best;
};
const main = nearest(target) as Ver;
// 本体、变体、调试页各档都出自本体那条链（结构一样，只是难度不同）；别的链放回库里给同组的关用
const mine = all.filter((v) => v.chain === main.chain);
const mainChain = chainsUsed.get(main.chain) as Pool.Chain;
if (usePool) Pool.releaseOthers(CLIENT, group, id, main.chain);
/** 借了同组别的关生成的链：鱼的样子（种子决定挑哪几种鱼的图）按这一关自己的来，免得和那一关撞 */
const borrowed = mainChain.from !== id;
const own = (lv: LevelData) => {
  const out = LevelData.fromDict(lv.toDict());
  out.id = id;
  if (borrowed) out.levelSeed = LevelCurve.seedFor(id, 0);
  return out;
};
/** 汇总行报的那一档（每日挑战报写进 levels_daily 的那一档） */
let shown: Ver = main;
// 调试页每 10% 一档：同一档留想清楚的更稳的；包里那一档一定留
const vers: Ver[] = [];
for (const v of mine) {
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
if (daily) {
  // 每日挑战：取最接近目标、又不超过 max 的那一档（都超过就取最难的），不出变体（每日挑战不降难度）
  const ok = all.filter((v) => v.casual <= daily.max);
  const pick = ok.length > 0 ? ok.reduce((a, b) => (Math.abs(b.casual - target) < Math.abs(a.casual - target) ? b : a)) : all.reduce((a, b) => (b.casual < a.casual ? b : a));
  const out = LevelData.fromDict(pick.lv.toDict());
  out.id = id;
  out.variants = [];
  const DAILY = join(CLIENT, 'assets/resources/config/levels_daily');
  mkdirSync(DAILY, { recursive: true });
  writeFileSync(join(DAILY, `level_${pad(id)}.json`), out.toJson() + '\n');
  console.log(`  每日挑战第 ${id} 关：${rulerName} ${Math.round(pick.casual * 100)}%（不超过 ${Math.round(daily.max * 100)}%${ok.length ? '' : '，压不到，取了最难的一档'}），想清楚 ${Math.round(pick.think * 100)}%`);
  shown = pick;
}
if (process.argv.includes('--pkg')) {
  const out = own(main.lv);
  out.variants = [`level_${pad(id)}_e1`, `level_${pad(id)}_e2`];
  writeFileSync(join(LEVELS, `level_${pad(id)}.json`), out.toJson() + '\n');
  // 变体：更容易的档（随手点的过关率高 15、30 个点左右）；没有更容易的档就在最容易的那档上多给暂存槽
  let prev = main;
  for (const e of [1, 2]) {
    const v = nearest(target + 0.15 * e, prev.casual, mine);
    let lvE: LevelData;
    if (v !== null) {
      lvE = own(v.lv);
      prev = v;
    } else {
      lvE = own(prev.lv);
      lvE.buffer = Math.min(7, lvE.buffer + 1);
    }
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
    const out = own(v.lv);
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
      kind,
      target: Math.round(target * 1000) / 10,
      casual: Math.round(shown.casual * 1000) / 10,
      rand: Math.round(shown.rand * 1000) / 10,
      think: Math.round(shown.think * 100),
      ease: mainChain.ease,
      source,
      chain: main.chain,
      versions: vers.map((v) => Math.round(v.casual * 100)),
      seconds: Math.round((Date.now() - t0) / 1000),
    }),
);
