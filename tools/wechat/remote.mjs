#!/usr/bin/env node
// 微信小游戏：构建完把 resources 资源包挪出安装包、改成从网上读（docs/04 第 8 节、docs/10 第 4 节）。
// ./package.sh 选择微信小游戏时自动跑；也能单独跑：node tools/wechat/remote.mjs
//
// 小游戏安装包（主包）最多 4 MB，我们的图、鱼、关卡有几十 MB，所以 resources 整个放到云存储：
//   1. client/build/wechatgame/assets/resources 里除了 index.js 都挪到 client/build/wechatgame-remote/remote/resources/
//      （在微信工程外面，开发者工具上传时不会带上它）；
//   2. index.js 挪到 src/bundle-scripts/resources/（小游戏不许跑网上下载的脚本，引擎的适配层就在这里找它）；
//   3. settings 里写上资源地址（game.json 的 wechat.remoteUrl），把 resources 标成远程包，并且不在启动前预读——
//      由我们的加载页去下（Boot.ts），这样能显示进度、失败了能重试。
// 这和在 Cocos 里把资源包勾成「远程包」得到的结果一样，只是不用改编辑器里的配置。
// 挪出去的资源再瘦身，画质和数据都不变（docs/04 第 8 节）：
//   4. 关卡文件去掉游戏不读的参考解和写成默认值的字段（slimlevel.mjs，client/tests/slimlevel.test.ts 验证全部关卡读出来一样）；
//   5. PNG 无损重压（pngpack.mjs，每张解码回来逐像素比对，一样才替换）。
// 文件名里的 MD5 是 Cocos 按构建时的内容算的，这两步不改文件名：同样的源文件每次处理结果都一样。
// 之后把 client/build/wechatgame-remote/remote 整个传到静态网站托管根目录（package.sh 里有 tcb 就自动传）。
import { fileURLToPath } from 'node:url';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { packPng } from './pngpack.mjs';
import { slimImportJson } from './slimlevel.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BUILD = join(ROOT, 'client/build/wechatgame');
const OUT = join(ROOT, 'client/build/wechatgame-remote');
const MAIN_LIMIT = 4 * 1024 * 1024;
const game = JSON.parse(readFileSync(join(ROOT, 'game.json'), 'utf8'));

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function sizeOf(p) {
  const st = statSync(p);
  if (!st.isDirectory()) return st.size;
  return readdirSync(p).reduce((a, f) => a + sizeOf(join(p, f)), 0);
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

// 上一次打包挪出去的资源先清掉（这次可能不挪）
rmSync(OUT, { recursive: true, force: true });

// 环境变量 WECHAT_REMOTE_URL 能临时顶替 game.json 的（试打包、量主包大小时用）
let server = String(process.env.WECHAT_REMOTE_URL ?? game.wechat?.remoteUrl ?? '').trim();
if (!server) {
  // 没填资源地址：资源留在包里，开发者工具的模拟器照样能跑，只是预览、上传会因为超过 4 MB 被拒
  console.log('! game.json 的 wechat.remoteUrl 还没填（云存储的下载地址）：这次资源留在包里，只能在模拟器里跑，预览和上传会超过 4 MB（docs/10 第 4 节）');
  process.exit(0);
}
if (!/^https:\/\//.test(server)) die(`wechat.remoteUrl 要 https:// 开头：${server}`);
if (!server.endsWith('/')) server += '/';

const res = join(BUILD, 'assets/resources');
if (!existsSync(res)) die(`没找到 ${relative(ROOT, res)}：先用 ./package.sh 构建微信小游戏`);

// settings：md5Cache 时文件名带哈希（settings.xxxxx.json）
const src = join(BUILD, 'src');
const settingsName = readdirSync(src).find((f) => /^settings(\.[0-9a-f]+)?\.json$/.test(f));
if (!settingsName) die('没找到 src/settings.json');
const settingsPath = join(src, settingsName);
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

// 1. 资源挪到工程外面
const remote = join(OUT, 'remote/resources');
mkdirSync(remote, { recursive: true });
const indexName = readdirSync(res).find((f) => /^index(\.[0-9a-f]+)?\.js$/.test(f));
if (!indexName) die('assets/resources 里没有 index.js');
for (const f of readdirSync(res)) {
  if (f === indexName) continue;
  renameSync(join(res, f), join(remote, f));
}
// 2. 资源包的脚本留在包里
const scripts = join(src, 'bundle-scripts/resources');
mkdirSync(scripts, { recursive: true });
renameSync(join(res, indexName), join(scripts, indexName));
rmSync(res, { recursive: true, force: true });

// 3. settings
const a = settings.assets;
a.server = server;
a.remoteBundles = Array.from(new Set([...(a.remoteBundles ?? []), 'resources']));
a.preloadBundles = (a.preloadBundles ?? []).filter((b) => b.bundle !== 'resources');
writeFileSync(settingsPath, JSON.stringify(settings));

// 4、5. 瘦身
function files(dir, ext) {
  const out = [];
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) out.push(...files(p, ext));
    else if (f.name.endsWith(ext)) out.push(p);
  }
  return out;
}
const before = sizeOf(join(OUT, 'remote'));
let levels = 0;
for (const p of files(remote, '.json')) {
  const slim = slimImportJson(readFileSync(p, 'utf8'));
  if (slim !== null) {
    writeFileSync(p, slim);
    levels++;
  }
}
const pngs = files(remote, '.png');
let pngBefore = 0;
let pngAfter = 0;
for (let i = 0; i < pngs.length; i += 8) {
  for (const [a0, b0] of await Promise.all(pngs.slice(i, i + 8).map(packPng))) {
    pngBefore += a0;
    pngAfter += b0;
  }
}
console.log(`✓ 瘦身：${levels} 个关卡文件去掉不用的内容；${pngs.length} 张 PNG 无损重压 ${mb(pngBefore)} → ${mb(pngAfter)}；合计 ${mb(before)} → ${mb(sizeOf(join(OUT, 'remote')))}`);

// 主包大小：微信工程目录里的全部文件
const main = sizeOf(BUILD);
const rest = sizeOf(join(OUT, 'remote'));
console.log(`✓ resources 挪到网上：${relative(ROOT, join(OUT, 'remote'))}（${mb(rest)}），资源地址 ${server}remote/resources/`);
console.log(`  安装包（主包）${mb(main)}，上限 4 MB`);
if (main > MAIN_LIMIT) die(`主包超过 4 MB（${mb(main)}），微信传不上去`);
