#!/usr/bin/env node
// 手动清理静态网站托管上用不到的旧资源（docs/10 第 4 节）。不再在打包上传后自动跑（#170）。
// 用户 2026-11-18：网上只放有用的文件。资源文件名带 MD5，改过的文件换了名字，旧文件不清会越攒越多。
// 但「有用」不只是这次的包：线上版、审核版、体验版可能是三个不同的包，各自引用自己那批文件，删了其中一个要的文件，
// 没缓存的玩家启动就卡住。原来按「这次的包」或「这台电脑最近三次上传」删都会误删（#170），所以改成由人指定还在用的包：
//   每次打包，tools/wechat/remote.mjs 把这个包用到的文件写进 remote/_builds/<编号>.json，跟资源一起传上去，并打印编号；
//   微信开发者工具上传时把编号写进版本备注。清理时到小程序后台看线上版、审核版、体验版各是哪个编号，全部填进 --keep。
// 用法：node tools/wechat/prune.mjs <云开发环境 ID> --keep <编号,编号,...> [--yes]
//   不加 --yes 只列出要删的文件（预演）；加了才删。给的编号在托管上找不到清单就整个停下，一个都不删。
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const game = JSON.parse(readFileSync(join(ROOT, 'game.json'), 'utf8'));
const args = process.argv.slice(2);
const env = args[0] && !args[0].startsWith('--') ? args[0] : '';
const keepArg = args.includes('--keep') ? (args[args.indexOf('--keep') + 1] ?? '') : '';
const keepIds = keepArg.split(',').map((s) => s.trim()).filter(Boolean);
const really = args.includes('--yes');
if (!env || keepIds.length === 0) {
  console.error('用法：node tools/wechat/prune.mjs <云开发环境 ID> --keep <编号,编号,...> [--yes]');
  console.error('  编号是打包时打印的「资源编号」，到小程序后台看线上版、审核版、体验版的版本备注，还在用的全部填上');
  process.exit(1);
}
// 环境变量 WECHAT_REMOTE_URL 能临时顶替 game.json 的（和 remote.mjs 一样；本机测试时指向 http://127.0.0.1）
let server = String(process.env.WECHAT_REMOTE_URL ?? game.wechat?.remoteUrl ?? '').trim();
if (!/^https:\/\//.test(server) && !/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(server)) {
  console.error('✗ game.json 的 wechat.remoteUrl 没填或不是 https://，读不到托管上的清单');
  process.exit(1);
}
if (!server.endsWith('/')) server += '/';

const listed = JSON.parse(execFileSync('tcb', ['hosting', 'list', 'remote', '--json', '-e', env], { encoding: 'utf8', maxBuffer: 64 << 20 }));
const remote = (listed.data ?? []).map((f) => f.key);
const remoteSet = new Set(remote);

// 每个要留的包：清单要在托管上、读得下来、里面列的文件网上都在，否则停下
const keep = new Set();
for (const id of keepIds) {
  const key = `remote/_builds/${id}.json`;
  if (!remoteSet.has(key)) {
    console.error(`✗ 托管上没有 ${key}：编号写错了，或者那个包是改成这种做法之前传的。一个都不删`);
    process.exit(1);
  }
  let manifest;
  try {
    const res = await fetch(server + key, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    manifest = await res.json();
  } catch (e) {
    console.error(`✗ 读不下来 ${server}${key}（${e instanceof Error ? e.message : String(e)}）。一个都不删`);
    process.exit(1);
  }
  const used = Array.isArray(manifest?.files) ? manifest.files : [];
  if (used.length === 0) {
    console.error(`✗ ${key} 里没有文件列表。一个都不删`);
    process.exit(1);
  }
  const missing = used.filter((k) => !remoteSet.has(k));
  if (missing.length) {
    console.error(`! ${id} 要的文件网上已经缺 ${missing.length} 个（如 ${missing[0]}）：这个包现在就可能读不到资源，先重新上传它的资源`);
  }
  for (const k of used) keep.add(k);
  console.log(`· 留 ${id}：${used.length} 个文件`);
}
// 清单本身都留着（很小，以后还能查当时的包用了什么）
const stale = remote.filter((k) => !keep.has(k) && !k.startsWith('remote/_builds/'));
console.log(`· 托管上 ${remote.length} 个文件，这 ${keepIds.length} 个包用到 ${keep.size} 个，都用不到的 ${stale.length} 个${really ? '' : '（预演，加 --yes 才删）'}`);
if (!really) {
  for (const k of stale.slice(0, 20)) console.log(`  ${k}`);
  if (stale.length > 20) console.log(`  …还有 ${stale.length - 20} 个`);
  process.exit(0);
}
if (stale.length === 0) process.exit(0);

// 删法：每调一次 tcb 要两三秒（启动 + 网络），上千个文件逐个删要近一小时。
// 所以整个目录都没用了的按目录删（一次调用），剩下的零散文件并发删，并打印进度。
const keepDirs = new Set();
for (const k of [...keep, ...remote.filter((k) => k.startsWith('remote/_builds/'))]) {
  for (let i = k.indexOf('/'); i > 0; i = k.indexOf('/', i + 1)) keepDirs.add(k.slice(0, i));
}
const jobs = []; // [路径, 是不是目录, 含几个文件]
const dirCount = new Map();
for (const k of stale) {
  // 找这个文件最上层的、整个都没用的目录（remote/ 本身不算）
  let top = null;
  for (let i = k.indexOf('/', 'remote/'.length); i > 0; i = k.indexOf('/', i + 1)) {
    const d = k.slice(0, i);
    if (!keepDirs.has(d)) {
      top = d;
      break;
    }
  }
  if (top) dirCount.set(top, (dirCount.get(top) ?? 0) + 1);
  else jobs.push([k, false, 1]);
}
for (const [d, n] of dirCount) jobs.push([d, true, n]);

const run = promisify(execFile);
let done = 0,
  failed = 0,
  next = 0;
const CONCURRENCY = 12;
async function worker() {
  while (next < jobs.length) {
    const [path, dir, n] = jobs[next++];
    // 按目录删是前缀匹配，结尾带 / 免得 remote/ab 连 remote/abc/ 一起删
    const a = ['hosting', 'delete', dir ? `${path}/` : path, ...(dir ? ['--dir'] : []), '--yes', '-e', env];
    try {
      await run('tcb', a, { maxBuffer: 16 << 20 });
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
  console.error(`! 清掉 ${done} 个，${failed} 个没删成（资源照常能用，再跑一次会接着删）`);
  process.exit(1);
}
console.log(`✓ 清掉 ${done} 个旧文件`);
