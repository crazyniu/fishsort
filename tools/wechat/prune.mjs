#!/usr/bin/env node
// 上传后清掉静态网站托管上用不到的旧资源（./package.sh 选择微信小游戏、上传成功后自动跑）。
// 用户 2026-11-18：网上只放有用的文件。资源文件名带 MD5，改过的文件换了名字，旧文件不清会越攒越多。
// 做法：列出托管上 remote/ 下的全部文件，最近 KEEP_BUILDS 次上传（含这次）都没用到的才删。
// 只按这次的包删不行（#170）：新包审核、体验期间线上还是旧包，旧包的资源被删了，没缓存的玩家启动就卡住。
// 每次上传用到哪些文件记在这台电脑的 ~/.fishsort/wechat-builds/<环境 ID>/ 里；记录不到 KEEP_BUILDS 次就先不删（宁可多留）。
// 用法：node tools/wechat/prune.mjs <云开发环境 ID> [--dry-run]
import { fileURLToPath } from 'node:url';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const LOCAL = join(ROOT, 'client/build/wechatgame-remote');
const env = process.argv[2];
const dry = process.argv.includes('--dry-run');
if (!env) {
  console.error('用法：node tools/wechat/prune.mjs <云开发环境 ID> [--dry-run]');
  process.exit(1);
}

function files(dir) {
  const out = [];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) out.push(...files(p));
    else out.push(relative(LOCAL, p).split('\\').join('/'));
  }
  return out;
}

const current = files(join(LOCAL, 'remote')).sort();
if (current.length === 0) {
  console.error('✗ 本地没有打包好的资源，不清理（免得把网上的全删了）');
  process.exit(1);
}
const listed = JSON.parse(execFileSync('tcb', ['hosting', 'list', 'remote', '--json', '-e', env], { encoding: 'utf8', maxBuffer: 64 << 20 }));
const remote = (listed.data ?? []).map((f) => f.key);
// 网上缺本地的文件说明上传没传全，这时不清理，也不记这次上传
const remoteSet = new Set(remote);
const missing = current.filter((k) => !remoteSet.has(k));
if (missing.length) {
  console.error(`✗ 网上还缺 ${missing.length} 个文件（如 ${missing[0]}），先把上传补全再清理`);
  process.exit(1);
}

// 记下这次上传用到的文件；和上一次一模一样就不另记（同一个包传两遍不该把更早的版本挤出去）
const KEEP_BUILDS = 3;
const HISTORY = join(homedir(), '.fishsort', 'wechat-builds', env);
mkdirSync(HISTORY, { recursive: true });
const readBuild = (f) => JSON.parse(readFileSync(join(HISTORY, f), 'utf8'));
let builds = readdirSync(HISTORY).filter((f) => f.endsWith('.json')).sort();
const last = builds.length ? readBuild(builds[builds.length - 1]) : null;
if (!dry && (!last || last.join('\n') !== current.join('\n'))) {
  const name = `${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(join(HISTORY, name), JSON.stringify(current));
  builds.push(name);
}
// 记录只留最近 10 次
for (const f of builds.slice(0, Math.max(0, builds.length - 10))) rmSync(join(HISTORY, f), { force: true });
builds = builds.slice(-10);
const recent = builds.slice(-KEEP_BUILDS);
if (recent.length < KEEP_BUILDS && !dry) {
  console.log(`· 这台电脑只记到 ${recent.length} 次上传（${HISTORY}），不到 ${KEEP_BUILDS} 次先不清：旧版本可能还在用网上的文件`);
  process.exit(0);
}
const keep = new Set(current);
for (const f of recent) for (const k of readBuild(f)) keep.add(k);
const stale = remote.filter((k) => !keep.has(k));
console.log(`· 托管上 ${remote.length} 个文件，最近 ${recent.length} 次上传用到 ${keep.size} 个，都用不到的旧文件 ${stale.length} 个${dry ? '（只预演，不删）' : ''}`);
if (dry) {
  for (const k of stale.slice(0, 20)) console.log(`  ${k}`);
  process.exit(0);
}
if (stale.length === 0) process.exit(0);

// 删法：每调一次 tcb 要两三秒（启动 + 网络），上千个文件逐个删要近一小时。
// 所以整个目录都没用了的按目录删（一次调用），剩下的零散文件并发删，并打印进度。
const keepDirs = new Set();
for (const k of keep) for (let i = k.indexOf('/'); i > 0; i = k.indexOf('/', i + 1)) keepDirs.add(k.slice(0, i));
const jobs = []; // [路径, 是不是目录, 含几个文件]
const dirCount = new Map();
for (const k of stale) {
  // 找这个文件最上层的、整个都没用的目录（remote/ 本身不算）
  let top = null;
  for (let i = k.indexOf('/', 'remote/'.length); i > 0; i = k.indexOf('/', i + 1)) {
    const d = k.slice(0, i);
    if (!keepDirs.has(d)) { top = d; break; }
  }
  if (top) dirCount.set(top, (dirCount.get(top) ?? 0) + 1);
  else jobs.push([k, false, 1]);
}
for (const [d, n] of dirCount) jobs.push([d, true, n]);

const run = promisify(execFile);
let done = 0, failed = 0, next = 0;
const CONCURRENCY = 12;
async function worker() {
  while (next < jobs.length) {
    const [path, dir, n] = jobs[next++];
    // 按目录删是前缀匹配，结尾带 / 免得 remote/ab 连 remote/abc/ 一起删
    const args = ['hosting', 'delete', dir ? `${path}/` : path, ...(dir ? ['--dir'] : []), '--yes', '-e', env];
    try {
      await run('tcb', args, { maxBuffer: 16 << 20 });
      done += n;
    } catch {
      failed += n;
    }
    process.stdout.write(`\r  删除中 ${done + failed}/${stale.length}${failed ? `（失败 ${failed}）` : ''}   `);
  }
}
console.log(`  按 ${dirCount.size} 个目录 + ${jobs.length - dirCount.size} 个零散文件删，${CONCURRENCY} 个一起跑`);
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
process.stdout.write('\n');
if (failed) {
  console.error(`! 清掉 ${done} 个，${failed} 个没删成（资源照常能用，下次打包会再清）`);
  process.exit(1);
}
console.log(`✓ 清掉 ${done} 个旧文件`);
