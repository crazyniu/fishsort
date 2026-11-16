// 校验关卡并输出难度报告（docs/02 第 5 节）。对应 Godot 版 tools/level/verify.gd。
// 用法：./run.sh level-verify [--runs=N] [文件...]   不给文件 = 全部，报告写到 tools/level/report.csv
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import type { CurveConfig } from '../../assets/scripts/core/config';
import * as LevelCurve from '../../assets/scripts/core/gen/levelCurve';
import { LevelData } from '../../assets/scripts/core/model/levelData';
import * as Bots from '../../assets/scripts/core/solver/bots';
import * as LevelCheck from '../../assets/scripts/core/solver/levelCheck';

const CLIENT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const DIR = join(CLIENT, 'assets/resources/config/levels');

let runs = 40;
const files: string[] = [];
for (const a of process.argv.slice(2)) {
  if (a.startsWith('--runs=')) runs = Number(a.slice(7));
  else files.push(resolve(process.env.INIT_CWD ?? process.cwd(), a));
}
const all = files.length === 0;
if (all) for (const n of readdirSync(DIR).sort()) if (n.endsWith('.json')) files.push(join(DIR, n));

const curve = JSON.parse(readFileSync(join(CLIENT, 'assets/resources/config/level_curve.json'), 'utf8')) as CurveConfig;
const gen = curve.gen;
const rows = ['level,species,fish,bubbles,challenge,peak,greedy2,greedy3,random2,flag'];
let bad = 0;
let off = 0;
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
  if (errs.length > 0) {
    bad++;
    for (const e of errs) console.error(`✗ ${name}: ${e}`);
    continue;
  }
  const isVariant = name.includes('_e');
  const g2 = Bots.rate(lv, 'greedy', 2, runs);
  const g3 = isVariant ? -1 : Bots.rate(lv, 'greedy', 3, runs);
  const r2 = isVariant ? -1 : Bots.rate(lv, 'random', 2, runs);
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
    if (g3 < g2 - gen.bot3Margin) flags.push('开第3缸更难');
    last.set(lv.challenge, g2);
  }
  if (!isVariant) baseRate.set(lv.id, g2);
  if (flags.length > 0) off++;
  const peak = LevelCheck.replay(lv).peak;
  rows.push([name, lv.palette, fish, lv.bubbles.length, lv.challenge ? 'y' : '', peak, g2, g3, r2, flags.join('|')].join(','));
}
if (all) writeFileSync(join(CLIENT, 'tools/level/report.csv'), rows.join('\n') + '\n');
else console.log(rows.join('\n'));
console.log(`校验 ${files.length} 个关卡：不合格 ${bad}，难度偏离目标 ${off}`);
process.exit(bad > 0 ? 1 : 0);
