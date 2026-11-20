#!/usr/bin/env node
// 微信小游戏：构建完把首屏用不到的资源挪到网上（docs/04 第 8 节、docs/10 第 4 节）。
// ./package.sh 选择微信小游戏时自动跑；也能单独跑：node tools/wechat/remote.mjs
//
// 小游戏主包最多 4 MB、加上分包一共最多 30 MB，我们的图、鱼、关卡有五十多 MB。
// 2026-11-20 起（微信审核驳回「打不开」：审核员手机刚启动时微信报 offline mode，资源一个都没下下来；用户定「分包」）：
//   - resources 在微信上打成分包（client/settings/v2/packages/builder.json 的 fs_resources），随安装包下到手机，没网也能读；
//   - 首屏要用的留在分包里：界面部件和图标（收藏册大封面、别的海域的背景除外）、主页和第一片海域的背景、
//     第一片海域收藏册里的鱼和主页的鱼、音效、文案、配置、第 1–FIRST_LEVELS 关；
//   - 其余的（别的海域的鱼和背景、收藏册封面、后面的关卡、每日挑战关、韩文字体）挪到
//     client/build/wechatgame-remote/remote/resources/（在微信工程外面，开发者工具上传时不带），传到静态网站托管；
//   - 挪走的文件列表写进 settings（assets.fsRemote），游戏读到它们时把地址换成网上的（platform/wechatRemote.ts），
//     引擎的微信适配层下载后缓存在手机上，下次没网也能读。
// 再瘦身（画质和数据都不变）：关卡文件去掉游戏不读的内容（slimlevel.mjs）、PNG 无损重压（pngpack.mjs），分包和网上的都做。
// 文件名里的 MD5 是 Cocos 按构建时的内容算的，瘦身不改文件名：同样的源文件每次处理结果都一样。
// 之后把 client/build/wechatgame-remote/remote 整个传到静态网站托管根目录（package.sh 里有 tcb 就自动传）。
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { packPng } from './pngpack.mjs';
import { slimImportJson } from './slimlevel.mjs';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const BUILD = join(ROOT, 'client/build/wechatgame');
const OUT = join(ROOT, 'client/build/wechatgame-remote');
const CONFIG = join(ROOT, 'client/assets/resources/config');
const MAIN_LIMIT = 4 * 1024 * 1024;
const TOTAL_LIMIT = 30 * 1024 * 1024;
/** 分包里带前几关（第一片海域）：没网时能打开、能玩下去 */
const FIRST_LEVELS = 20;
const game = JSON.parse(readFileSync(join(ROOT, 'game.json'), 'utf8'));

function die(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function sizeOf(p) {
  if (!existsSync(p)) return 0;
  const st = statSync(p);
  if (!st.isDirectory()) return st.size;
  return readdirSync(p).reduce((a, f) => a + sizeOf(join(p, f)), 0);
}

function files(dir, ext = '') {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) out.push(...files(p, ext));
    else if (f.name.endsWith(ext)) out.push(p);
  }
  return out;
}

const mb = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

// 上一次打包挪出去的资源先清掉
rmSync(OUT, { recursive: true, force: true });

// 环境变量 WECHAT_REMOTE_URL 能临时顶替 game.json 的（试打包时用）
let server = String(process.env.WECHAT_REMOTE_URL ?? game.wechat?.remoteUrl ?? '').trim();
if (server && !/^https:\/\//.test(server)) die(`wechat.remoteUrl 要 https:// 开头：${server}`);
if (server && !server.endsWith('/')) server += '/';

const SUB = join(BUILD, 'subpackages/resources');
if (!existsSync(SUB)) die(`没找到 ${relative(ROOT, SUB)}：resources 要在微信上打成分包（builder.json 的 fs_resources），先用 ./package.sh 构建微信小游戏`);

// settings：md5Cache 时文件名带哈希（settings.xxxxx.json）
const src = join(BUILD, 'src');
const settingsName = readdirSync(src).find((f) => /^settings(\.[0-9a-f]+)?\.json$/.test(f));
if (!settingsName) die('没找到 src/settings.json');
const settingsPath = join(src, settingsName);
const settings = JSON.parse(readFileSync(settingsPath, 'utf8'));

// ---------------------------------------------------------------- 首屏要留在分包里的资源（按资源路径）

const eco = JSON.parse(readFileSync(join(CONFIG, 'economy.json'), 'utf8'));
const ui = JSON.parse(readFileSync(join(CONFIG, 'game_ui.json'), 'utf8'));
const firstSea = eco.seas[0].id;
const localFish = new Set([
  ...(eco.album?.books?.find((b) => b.sea === firstSea)?.cards ?? []),
  ...ui.homeDeco.school.map(([id]) => id),
  'c01',
  'c02',
]);
if (localFish.size < 10) die(`第一片海域（${firstSea}）的鱼不到 10 种，economy.json 的 album.books 是不是改了？`);

/** 这个资源路径（'fish/c01/spriteFrame'、'ui/kit/btn'、'config/levels/level_0001_e1'）首屏要不要 */
function isLocal(path) {
  const fish = /^fish\/([^/]+)/.exec(path);
  if (fish) return localFish.has(fish[1]);
  const bg = /^ui\/bg\/([^/]+)/.exec(path);
  if (bg) return bg[1] === 'home' || bg[1] === `sea_${firstSea}`;
  if (/^ui\/skin\/j_book_/.test(path)) return false;
  const lv = /^config\/levels\/level_(\d+)/.exec(path);
  if (lv) return Number(lv[1]) <= FIRST_LEVELS;
  if (/^config\/levels_(daily|lab)\//.test(path)) return false;
  if (/^font\//.test(path)) return false;
  return true;
}

// ---------------------------------------------------------------- 读分包的目录，按 uuid 定每个文件留不留

const cfgName = readdirSync(SUB).find((f) => /^config(\.[0-9a-f]+)?\.json$/.test(f));
if (!cfgName) die('分包里没有 config.json');
const cfg = JSON.parse(readFileSync(join(SUB, cfgName), 'utf8'));

// 构建出来的 uuid 是压缩过的（22 个字符），文件名用的是完整的：照引擎的 decodeUuid 还原
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const HEX = '0123456789abcdef';
const TEMPLATE = '00000000-0000-0000-0000-000000000000'.split('');
const SLOTS = TEMPLATE.map((c, i) => (c === '-' ? -1 : i)).filter((i) => i >= 0);
function decodeUuid(s) {
  const [head, ...rest] = String(s).split('@');
  if (head.length !== 22) return s;
  const t = TEMPLATE.slice();
  t[0] = head[0];
  t[1] = head[1];
  for (let i = 2, j = 2; i < 22; i += 2) {
    const l = B64.indexOf(head[i]);
    const r = B64.indexOf(head[i + 1]);
    t[SLOTS[j++]] = HEX[l >> 2];
    t[SLOTS[j++]] = HEX[((l & 3) << 2) | (r >> 4)];
    t[SLOTS[j++]] = HEX[r & 0xf];
  }
  return [t.join(''), ...rest].join('@');
}

const uuids = cfg.uuids.map(decodeUuid);
/** uuid（不带 @子资源）→ 路径 */
const pathOf = new Map();
for (const [idx, info] of Object.entries(cfg.paths)) {
  const u = uuids[Number(idx)];
  if (u === undefined) continue;
  pathOf.set(u, info[0]);
  const base = u.split('@')[0];
  if (!pathOf.has(base)) pathOf.set(base, info[0]);
}
/** 没有路径的（被别的资源引用的子资源等）跟着同 uuid 的主资源走；都查不到就留在分包里 */
function keep(uuid) {
  const p = pathOf.get(uuid) ?? pathOf.get(uuid.split('@')[0]);
  return p === undefined ? true : isLocal(p);
}

// 文件名 → uuid：import/xx/<uuid>[@子].<md5>.json、native/xx/<uuid>.<md5>.<扩展名>；合包（packs）留在分包里
const packIds = new Set(Object.keys(cfg.packs ?? {}));
const moved = [];
const remoteRoot = join(OUT, 'remote/resources');
for (const kind of ['import', 'native']) {
  for (const p of files(join(SUB, kind))) {
    const name = p.split('/').pop();
    const uuid = name.replace(/\.[0-9a-f]{5}\.[^.]+$/, '').replace(/\.[^.]+$/, '');
    if (packIds.has(uuid) || keep(uuid)) continue;
    const rel = relative(SUB, p).split('\\').join('/');
    const to = join(remoteRoot, rel);
    mkdirSync(dirname(to), { recursive: true });
    renameSync(p, to);
    moved.push(rel);
  }
}

// ---------------------------------------------------------------- settings

const a = settings.assets;
// 分包由加载页自己读（Boot.ts），能显示进度、失败了自动重试；不在引擎启动前预读
a.preloadBundles = (a.preloadBundles ?? []).filter((b) => b.bundle !== 'resources');
if (moved.length > 0) {
  if (!server) die('有资源要放到网上，但 game.json 的 wechat.remoteUrl 还没填（静态网站托管的地址，docs/10 第 4 节）');
  // platform/wechatRemote.ts 读：分包里这些文件不在，读到时去 server 下载
  a.fsRemote = { base: 'subpackages/resources/', server: `${server}remote/resources/`, files: moved };
}
writeFileSync(settingsPath, JSON.stringify(settings));

// ---------------------------------------------------------------- 瘦身（分包里的和挪到网上的都做）

const before = sizeOf(SUB) + sizeOf(join(OUT, 'remote'));
let levels = 0;
for (const p of [...files(SUB, '.json'), ...files(remoteRoot, '.json')]) {
  const slim = slimImportJson(readFileSync(p, 'utf8'));
  if (slim !== null) {
    writeFileSync(p, slim);
    levels++;
  }
}
const pngs = [...files(SUB, '.png'), ...files(remoteRoot, '.png')];
let pngBefore = 0;
let pngAfter = 0;
for (let i = 0; i < pngs.length; i += 8) {
  for (const [a0, b0] of await Promise.all(pngs.slice(i, i + 8).map(packPng))) {
    pngBefore += a0;
    pngAfter += b0;
  }
}
console.log(`✓ 瘦身：${levels} 个关卡文件去掉不用的内容；${pngs.length} 张 PNG 无损重压 ${mb(pngBefore)} → ${mb(pngAfter)}；合计 ${mb(before)} → ${mb(sizeOf(SUB) + sizeOf(join(OUT, 'remote')))}`);

// ---------------------------------------------------------------- 大小

const sub = sizeOf(SUB);
const main = sizeOf(BUILD) - sub;
const total = sizeOf(BUILD);
console.log(`✓ 分包 subpackages/resources ${mb(sub)}（首屏：第一片海域 ${localFish.size} 种鱼、前 ${FIRST_LEVELS} 关，没网也能打开）`);
if (moved.length) console.log(`✓ ${moved.length} 个文件挪到网上：${relative(ROOT, join(OUT, 'remote'))}（${mb(sizeOf(join(OUT, 'remote')))}），地址 ${server}remote/resources/`);
console.log(`  主包 ${mb(main)}（上限 4 MB），整包 ${mb(total)}（上限 30 MB）`);
if (main > MAIN_LIMIT) die(`主包超过 4 MB（${mb(main)}），微信传不上去`);
if (total > TOTAL_LIMIT) die(`主包加分包超过 30 MB（${mb(total)}），微信传不上去：少留一些在分包里（isLocal）`);
