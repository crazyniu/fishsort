// 校验关卡并输出难度报告（docs/02 第 5 节；第 6 关起按规定路线的目标复测，docs/02 第 0.3 节）。
// 用法：./run.sh level-verify [--measure] [--runs=N] [文件...]   不给文件 = 全部，报告写到 tools/level/report.csv
//   --measure：第 6 关起用两个只看屏幕的玩家复测难度（离目标远、想清楚过不去的标出来）；不给只查结构和参考解（CI 用）
// 默认用验收那一组机器人种子跑 400 局（level_curve.json 的 gen.verifyRuns / verifySeedBase），和生成器复测用的是同一组，
// 所以报告里的胜率就是生成时判的胜率。
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { CurveConfig } from '../../assets/scripts/core/config';
import * as LevelCurve from '../../assets/scripts/core/gen/levelCurve';
import { LevelData } from '../../assets/scripts/core/model/levelData';
import * as Bots from '../../assets/scripts/core/solver/bots';
import * as NoTriple from '../../assets/scripts/core/gen/noTriple';
import * as LevelCheck from '../../assets/scripts/core/solver/levelCheck';
import * as Players from '../../assets/scripts/core/solver/players';
import * as Jam from './jam';

const CLIENT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const DIR = join(CLIENT, 'assets/resources/config/levels');

const curve = JSON.parse(readFileSync(join(CLIENT, 'assets/resources/config/level_curve.json'), 'utf8')) as CurveConfig;
const gen = curve.gen;
let runs = gen.verifyRuns;
const files: string[] = [];
// --measure：第 6 关起再用两个只看屏幕的玩家复测难度（慢，Mac 上跑；CI 只查结构和参考解，要在三分钟内跑完）
const measureOn = process.argv.includes('--measure');
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--runs=')) runs = Number(a.slice(7));
  else if (a !== '--measure') files.push(resolve(process.env.INIT_CWD ?? process.cwd(), a));
}
const all = files.length === 0;
if (all) for (const n of readdirSync(DIR).sort()) if (n.endsWith('.json')) files.push(join(DIR, n));

const rate = (lv: LevelData, kind: Bots.BotKind, slots: number) => Bots.rate(lv, kind, slots, runs, gen.verifySeedBase, curve.bot);

/** 这一关实际带了哪几种障碍 */
function obstacles(lv: LevelData): string[] {
  const out: string[] = [];
  if (lv.bubbles.some((b) => b.chain > 0)) out.push('chain');
  if (lv.orders.some((o) => o.timer > 0)) out.push('timer');
  if (lv.bubbles.some((b) => b.fog > 0)) out.push('fog');
  if (lv.bubbles.some((b) => b.ice.length > 0)) out.push('ice');
  if (lv.orders.some((o) => o.cap > 3)) out.push('big');
  if (lv.bubbles.some((b) => b.pairs.length > 0)) out.push('pairs');
  return out;
}

const rows = ['level,species,fish,bubbles,challenge,peak,greedy2,greedy3,random2,obstacles,flag,kind,queue,normal0,normal1,normal2,normal3,normal4,normal6,casual0,casual6,target,routeCasual,routeThink'];
const route = curve.route;
/** 规定路线关卡复测（docs/02 第 0.3 节）：两个只看屏幕的玩家，换一组种子（和生成时都不一样） */
const VERIFY_SEED = 2000;
let bad = 0;
let off = 0;
let off3 = 0;
// 单调检查：上一个普通关 / 挑战关的 2 缸胜率；变体检查：本体的 2 缸胜率
const last = new Map<boolean, number>([
  [false, -1],
  [true, -1],
]);
const baseRate = new Map<number, number>();
for (const path of files) {
  const name = basename(path, '.json');
  const lv = LevelData.fromJson(readFileSync(path, 'utf8'));
  if (lv === null) {
    console.error(`✗ ${name}: 无法解析`);
    bad++;
    continue;
  }
  const errs = LevelCheck.errors(lv);
  // 同一个泡里同种鱼最多两条（core/gen/noTriple.ts，用户 2026-11-20）。只查进包的关：生成器原始输出和 Godot 版逐位一致，不在 LevelCheck 里管
  if (NoTriple.violations(lv) > 0) errs.push(`${NoTriple.violations(lv)} 个气泡里同种鱼超过 ${NoTriple.MAX_SAME} 条`);
  const isVariant = name.includes('_e');
  const obs = obstacles(lv);
  // 新机制首发（docs/02 第 2.2、5 节）：解锁关是挑战关的下一关、只带这一个障碍；没解锁的障碍不能提前出现
  if (!isVariant) {
    const fresh = LevelCurve.unlockedAt(curve, lv.id);
    if (fresh !== '' && fresh !== 'layer') {
      if (LevelCurve.isChallenge(curve, lv.id) || !LevelCurve.isChallenge(curve, lv.id - 1)) errs.push(`新机制 ${fresh} 的解锁关不是挑战关的下一关`);
      const allowed = fresh === 'drop' ? [] : [fresh];
      const extra = obs.filter((m) => allowed.indexOf(m) < 0);
      if (extra.length > 0) errs.push(`解锁关除了新机制 ${fresh} 还带了 ${extra.join('+')}`);
      if (fresh === 'drop' && lv.fieldCap <= 0) errs.push('掉落的解锁关不是掉落关');
      if (fresh !== 'drop' && obs.indexOf(fresh) < 0) errs.push(`解锁关没带新机制 ${fresh}`);
    }
  }
  for (const m of LevelCurve.MECHANICS) if (obs.indexOf(m) >= 0 && lv.id < curve.unlock[m]) errs.push(`障碍 ${m} 第 ${curve.unlock[m]} 关才解锁`);
  if (errs.length > 0) {
    bad++;
    for (const e of errs) console.error(`✗ ${name}: ${e}`);
    continue;
  }
  const kind = LevelCurve.jamKind(curve, lv.id);
  const target = route ? LevelCurve.routeTarget(curve, lv.id) : null;
  if (route && target !== null && kind !== null && !measureOn) {
    // 不复测难度：结构和参考解上面已经查过了
    const fish = lv.bubbles.reduce((n, b) => n + b.fish.length, 0);
    rows.push([name, lv.palette, fish, lv.bubbles.length, lv.challenge ? 'y' : '', LevelCheck.replay(lv).peak, -1, -1, -1, obs.join('+'), '', kind, lv.bubbles.filter((b) => b.queue).length, '', '', '', '', '', '', '', '', Math.round(target * 100), '', ''].join(','));
    continue;
  }
  if (route && target !== null && kind !== null) {
    // 规定路线关卡（第 6 关起）：随手点的玩家过关率离目标多远、想清楚的玩家过不过得去；变体要比本体容易
    const o = { preview: route.preview };
    // 尺子（route.ruler，不给 = 随手点的玩家）量难度，想清楚的玩家的保底按关定（LevelCurve.thinkFloorFor）
    const ruler: Players.Ruler = route.ruler ? { kind: route.ruler.kind, budget: route.ruler.budget, slip: route.ruler.slip } : { kind: 'casual' };
    const casual = Players.rulerRate(lv, ruler, route.ruler?.checkGames ?? route.checkCasual, route.preview, VERIFY_SEED).win;
    // 想清楚的玩家打 route.checkThink 局（60）：20 局一局就差 5 个点，太粗
    const think = isVariant ? -1 : Players.rate(lv, 'think', route.checkThink, o, VERIFY_SEED).win;
    const flags: string[] = [];
    if (isVariant) {
      const base = baseRate.get(lv.id);
      if (base !== undefined && casual * 100 < base - 5) flags.push('变体不比本体易');
    } else {
      baseRate.set(lv.id, casual * 100);
      if (Math.abs(casual - target) > 0.1) flags.push(casual < target ? '偏难' : '偏易');
      if (think < LevelCurve.thinkFloorFor(curve, lv.id) - 0.1) flags.push('想清楚过不去');
    }
    if (flags.length > 0) off++;
    const fish = lv.bubbles.reduce((n, b) => n + b.fish.length, 0);
    const pc = (x: number) => (x < 0 ? '' : Math.round(x * 100));
    const peak = LevelCheck.replay(lv).peak;
    const blank = ['', '', '', '', '', '', '', ''];
    rows.push([name, lv.palette, fish, lv.bubbles.length, lv.challenge ? 'y' : '', peak, -1, -1, -1, obs.join('+'), flags.join('|'), kind, lv.bubbles.filter((b) => b.queue).length, ...blank, pc(target), pc(casual), pc(think)].join(','));
    continue;
  }
  if (kind !== null) {
    // 排队泡关卡（docs/02 第 0 节）：按普通玩家机器人花几样才过来验收，不看贪心机器人的胜率
    const ease = isVariant ? Number(name.slice(name.indexOf('_e') + 2)) : 0;
    const m = Jam.measure(lv, lv.id, 50000);
    const jt = LevelCurve.jamTargets(curve, lv.id, ease);
    const flags: string[] = [];
    if (jt !== null && Jam.gap(m, jt).miss > 0) flags.push(Jam.gap(m, jt).signed < 0 ? '偏难' : '偏易');
    if (isVariant) {
      const base = baseRate.get(lv.id);
      if (base !== undefined && m.normal[0] * 100 < base - 5) flags.push('变体不比本体易');
    } else baseRate.set(lv.id, m.normal[0] * 100);
    if (flags.length > 0) off++;
    const fish = lv.bubbles.reduce((n, b) => n + b.fish.length, 0);
    const pc = (x: number) => Math.round(x * 100);
    const queued = lv.bubbles.filter((b) => b.queue).length;
    const peak = LevelCheck.replay(lv).peak;
    rows.push(
      [name, lv.palette, fish, lv.bubbles.length, lv.challenge ? 'y' : '', peak, -1, -1, -1, obs.join('+'), flags.join('|'), kind, queued, ...[0, 1, 2, 3, 4, 6].map((k) => pc(m.normal[k])), pc(m.casual[0]), pc(m.casual[6]), '', '', ''].join(','),
    );
    continue;
  }
  const g2 = rate(lv, 'greedy', 2);
  const g3 = isVariant ? -1 : rate(lv, 'greedy', 3);
  const r2 = isVariant ? -1 : rate(lv, 'random', 2);
  const fish = lv.bubbles.reduce((n, b) => n + b.fish.length, 0);
  // 以下偏离只提示、计入统计，不算校验失败（docs/02 第 5 节）
  const flags: string[] = [];
  if (isVariant) {
    const base = baseRate.get(lv.id);
    if (base !== undefined && g2 < base) flags.push('变体不比本体易');
  } else if (lv.id > curve.targets.tutorialUntil) {
    const span = LevelCurve.target(curve, lv.id, lv.challenge);
    if (LevelCurve.miss(span, g2) > 0) flags.push(g2 < span[0] ? '偏难' : '偏易');
    const prev = last.get(lv.challenge) as number;
    if (prev >= 0 && g2 > prev + gen.monotoneMargin) flags.push('比上一关易');
    last.set(lv.challenge, g2);
  }
  if (!isVariant) baseRate.set(lv.id, g2);
  if (flags.length > 0) off++;
  // 第 3 缸要明显有用但不保证过关：目前只警告，单独计数
  if (!isVariant && lv.id > curve.targets.tutorialUntil) {
    const s3 = LevelCurve.bowl3Span(curve, lv.id, g2);
    if (g3 < s3[0]) flags.push('第3缸帮助小');
    else if (g3 > s3[1]) flags.push('第3缸等于过关');
    if (LevelCurve.miss(s3, g3) > 0) off3++;
  }
  const peak = LevelCheck.replay(lv).peak;
  rows.push([name, lv.palette, fish, lv.bubbles.length, lv.challenge ? 'y' : '', peak, g2, g3, r2, obs.join('+'), flags.join('|'), '', '', '', '', '', '', '', '', '', '', '', '', ''].join(','));
}
if (all) writeFileSync(join(CLIENT, 'tools/level/report.csv'), rows.join('\n') + '\n');
else console.log(rows.join('\n'));
console.log(`校验 ${files.length} 个关卡（前 ${(curve.jam?.from ?? 1) - 1} 关贪心机器人每关 ${runs} 局，之后按两个只看屏幕的玩家复测）：不合格 ${bad}，偏离目标 ${off}，第 3 缸不在区间 ${off3}`);
process.exit(bad > 0 ? 1 : 0);
