// 全量生成规定路线关卡（docs/02 第 0.4 节）：第 from–to 关，每关跑一次 tools/level/route.ts（--pkg 换掉包里的本体和两个变体），几关并行。
// 用法：./run.sh level-route [起] [止] [--jobs=4] [--lab] [--resume]
//   --daily   每日挑战的专用难关（docs/01 5.11）：只跑 level_curve.json 的 route.daily 定的那些关（第 from 关起每 step 关，到起止为止），
//             每关写 config/levels_daily/level_XXXX.json，不动包里的关卡和调试页；日志在 route_logs_daily/，汇总 route_report_daily.csv
//   --lab     各档也写进 config/levels_lab（难度调试页挑档用）；每关先写一小份索引，全部跑完再合进 index.json
//   --resume  接着上次没跑完的：日志里已经有结果的关跳过，汇总和索引把上次跑完的一起算进去
//   --ids=234,236,…  只跑这几关（重跑离目标远的关用），不看起止
//   --iter=N  每次收紧最多试几次交换（传给 route.ts，不给用 level_curve.json 的 route.iterations）
//   --fresh  不用难度库（tools/level/pool.ts），每关都从头生成
//   --seed=N  生成种子从几起（传给 route.ts，不给 = 1）：重跑离目标远的关时换一个开局布局
// 每关的输出在 tools/level/route_logs/<关>.log（不进仓库），汇总写 tools/level/route_report.csv：关、类型、目标、包里那档的随手点 / 想清楚、
// 有没有用放松的生成参数、各档、用时。离目标超过 10 个点的关在最后列出来
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { cpus, setPriority } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const CLIENT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const nums = process.argv.slice(2).filter((a) => !a.startsWith('--')).map(Number);
const from = nums[0] ?? 6;
const to = nums[1] ?? from;
const jobsArg = process.argv.find((a) => a.startsWith('--jobs='));
// 默认给别的程序留 5 个核（2026-11-20：Mac 上 14 路全开时，用户同时在测游戏，浏览器抢不到 CPU，画面卡死、声音一直刺耳地重复）
const jobs = jobsArg ? Number(jobsArg.slice(7)) : Math.max(1, cpus().length - 5);
const daily = process.argv.includes('--daily');
const lab = !daily && process.argv.includes('--lab');
const resume = process.argv.includes('--resume');
const idsArg = process.argv.find((a) => a.startsWith('--ids='));
const only = idsArg ? idsArg.slice(6).split(',').map(Number).filter((x) => x > 0) : null;
const iterArg = process.argv.find((a) => a.startsWith('--iter='));
/** --seed=N 传给 route.ts：换一个生成种子（重跑离目标远的关时换一个开局布局） */
const seedArg = process.argv.find((a) => a.startsWith('--seed='));
const LOGS = join(CLIENT, daily ? 'tools/level/route_logs_daily' : 'tools/level/route_logs');
const ENTRIES = join(LOGS, 'lab_entries');
mkdirSync(LOGS, { recursive: true });
if (lab && !resume) rmSync(ENTRIES, { recursive: true, force: true });
if (lab) mkdirSync(ENTRIES, { recursive: true });

/** 日志里的结果行（这一关跑完了才有） */
function logged(id: number): Result | null {
  const f = join(LOGS, `${id}.log`);
  if (!existsSync(f)) return null;
  const line = readFileSync(f, 'utf8').split('\n').find((l) => l.startsWith('@@RESULT '));
  return line ? (JSON.parse(line.slice(9)) as Result) : null;
}

interface Result {
  id: number;
  kind: string;
  target: number;
  casual: number;
  think: number;
  ease: number;
  versions: number[];
  seconds: number;
}

// 后面的关鱼多、目标低，跑得久：先排它们，最后几个空闲的核不会只剩一关长的在跑
const queue: number[] = [];
const results: Result[] = [];
const curveCfg = JSON.parse(readFileSync(join(CLIENT, 'assets/resources/config/level_curve.json'), 'utf8')) as { route?: { daily?: { from: number; step: number } } };
const dailyCfg = curveCfg.route?.daily;
if (daily && !dailyCfg) {
  console.log('level_curve.json 的 route 里没有 daily');
  process.exit(1);
}
/** 每日挑战只跑 daily.from 起每 step 关 */
const wanted = (id: number) => !daily || (dailyCfg !== undefined && id >= dailyCfg.from && (id - dailyCfg.from) % dailyCfg.step === 0);
for (const id of (only ? only.slice().sort((a, b) => b - a) : Array.from({ length: to - from + 1 }, (_, k) => to - k)).filter(wanted)) {
  const done = resume ? logged(id) : null;
  if (done && (!lab || existsSync(join(ENTRIES, `${id}.json`)))) results.push(done);
  else queue.push(id);
}
const total = queue.length + results.length;
if (resume) console.log(`接着上次：已经跑完 ${results.length} 关，还剩 ${queue.length} 关`);
const failed: number[] = [];
const t0 = Date.now();

function runOne(id: number): Promise<void> {
  return new Promise((done) => {
    const args = ['tsx', 'tools/level/route.ts', String(id), daily ? '--daily' : '--pkg'];
    if (lab) args.push('--lab', `--labEntry=${join(ENTRIES, `${id}.json`)}`);
    if (iterArg) args.push(iterArg);
    if (seedArg) args.push(seedArg);
    if (process.argv.includes('--fresh')) args.push('--fresh');
    const child = spawn('npx', args, { cwd: CLIENT });
    // 生成的进程优先级降到最低：同一台机器上开着游戏试玩、编辑器时让它们先用 CPU（子进程跟着继承）
    try {
      if (child.pid) setPriority(child.pid, 19);
    } catch {
      /* 没权限就照常跑 */
    }
    let out = '';
    child.stdout.on('data', (d: Buffer) => (out += d.toString()));
    child.stderr.on('data', (d: Buffer) => (out += d.toString()));
    child.on('close', (code) => {
      writeFileSync(join(LOGS, `${id}.log`), out);
      const line = out.split('\n').find((l) => l.startsWith('@@RESULT '));
      if (code === 0 && line) {
        const r = JSON.parse(line.slice(9)) as Result;
        results.push(r);
        const min = ((Date.now() - t0) / 60000).toFixed(1);
        console.log(`[${results.length + failed.length}/${total} ${min} 分] 第 ${id} 关 ${r.kind} 目标 ${r.target}% → ${r.casual}%（想清楚 ${r.think}%）${r.ease ? ` 放松${r.ease}` : ''} ${r.seconds}s`);
      } else {
        failed.push(id);
        console.log(`[${results.length + failed.length}/${total}] 第 ${id} 关失败（退出码 ${code}），看 tools/level/route_logs/${id}.log`);
      }
      done();
    });
  });
}

async function worker(): Promise<void> {
  for (;;) {
    const id = queue.shift();
    if (id === undefined) return;
    await runOne(id);
  }
}

async function main(): Promise<void> {
  await Promise.all(Array.from({ length: Math.min(jobs, total) }, () => worker()));

  results.sort((a, b) => a.id - b.id);
  const rows = ['level,kind,target,casual,think,ease,versions,seconds'];
  for (const r of results) rows.push([r.id, r.kind, r.target, r.casual, r.think, r.ease, r.versions.join(' '), r.seconds].join(','));
  writeFileSync(join(CLIENT, daily ? 'tools/level/route_report_daily.csv' : 'tools/level/route_report.csv'), rows.join('\n') + '\n');

  if (lab) {
    const LAB = join(CLIENT, 'assets/resources/config/levels_lab');
    const indexPath = join(LAB, 'index.json');
    const index = (existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : {}) as Record<string, unknown>;
    for (const f of readdirSync(ENTRIES)) Object.assign(index, JSON.parse(readFileSync(join(ENTRIES, f), 'utf8')));
    const sorted = Object.fromEntries(Object.keys(index).sort((a, b) => Number(a) - Number(b)).map((k) => [k, index[k]]));
    writeFileSync(indexPath, JSON.stringify(sorted, null, 1) + '\n');
  }

  const off = results.filter((r) => Math.abs(r.casual - r.target) > 10);
  console.log(`\n${total} 关，成功 ${results.length}，失败 ${failed.length}${failed.length ? `（${failed.join('、')}）` : ''}，用时 ${((Date.now() - t0) / 60000).toFixed(0)} 分钟`);
  console.log(`离目标超过 10 个点：${off.length} 关${off.length ? '\n' + off.map((r) => `  第 ${r.id} 关 ${r.kind} 目标 ${r.target}% 实际 ${r.casual}%`).join('\n') : ''}`);
  console.log(`汇总：tools/level/${daily ? 'route_report_daily' : 'route_report'}.csv；`+'新文件要补 .meta：./run.sh meta');
  process.exit(failed.length > 0 ? 1 : 0);
}

void main();
