#!/usr/bin/env node
// 上传后清掉静态网站托管上用不到的旧资源（./package.sh 选择微信小游戏、上传成功后自动跑）。
// 用户 2026-11-18：网上只放有用的文件。资源文件名带 MD5，改过的文件换了名字，旧文件不清会越攒越多。
// 做法：列出托管上 remote/ 下的全部文件，本地这次打包出来的 client/build/wechatgame-remote/remote 里没有的就删掉。
// 用法：node tools/wechat/prune.mjs <云开发环境 ID> [--dry-run]
import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
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

const keep = new Set(files(join(LOCAL, 'remote')));
if (keep.size === 0) {
  console.error('✗ 本地没有打包好的资源，不清理（免得把网上的全删了）');
  process.exit(1);
}
const listed = JSON.parse(execFileSync('tcb', ['hosting', 'list', 'remote', '--json', '-e', env], { encoding: 'utf8', maxBuffer: 64 << 20 }));
const remote = (listed.data ?? []).map((f) => f.key);
// 网上缺本地的文件说明上传没传全，这时不清理
const missing = Array.from(keep).filter((k) => !remote.includes(k));
if (missing.length) {
  console.error(`✗ 网上还缺 ${missing.length} 个文件（如 ${missing[0]}），先把上传补全再清理`);
  process.exit(1);
}
const stale = remote.filter((k) => !keep.has(k));
console.log(`· 托管上 ${remote.length} 个文件，这次用到 ${keep.size} 个，用不到的旧文件 ${stale.length} 个${dry ? '（只预演，不删）' : ''}`);
if (dry) {
  for (const k of stale.slice(0, 20)) console.log(`  ${k}`);
  process.exit(0);
}
for (const k of stale) execFileSync('tcb', ['hosting', 'delete', k, '--yes', '-e', env], { stdio: 'ignore' });
console.log(`✓ 清掉 ${stale.length} 个旧文件`);
