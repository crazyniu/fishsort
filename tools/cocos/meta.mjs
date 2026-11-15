#!/usr/bin/env node
// 给 client/assets 下缺 .meta 的文件和目录补 .meta。
// UUID 由「相对路径」算出，换机器、重新生成都不变；已有的 .meta 不动。
// 用法：node tools/cocos/meta.mjs            补齐
//       node tools/cocos/meta.mjs --check    只检查，缺了就以非 0 退出（CI 用）
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../client');
const assets = join(root, 'assets');
const check = process.argv.includes('--check');

export function uuidFor(rel) {
  const h = createHash('sha1').update(`fishsort:${rel}`).digest('hex');
  // 按 UUID v5 的格式写版本位与变体位
  const v = '5' + h.slice(13, 16);
  const variant = ((parseInt(h[16], 16) & 0x3) | 0x8).toString(16) + h.slice(17, 20);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${v}-${variant}-${h.slice(20, 32)}`;
}

// Cocos 场景、组件里引用脚本类用的 23 位压缩 UUID
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function compressUuid(uuid) {
  const hex = uuid.replace(/-/g, '');
  let out = hex.slice(0, 5);
  for (let i = 5; i < 32; i += 3) {
    const n = parseInt(hex.slice(i, i + 3), 16);
    out += B64[n >> 6] + B64[n & 63];
  }
  return out;
}

const base = { imported: true, files: [], subMetas: {}, userData: {} };
const IMPORTERS = {
  dir: () => ({ ver: '1.2.0', importer: 'directory' }),
  '.ts': () => ({ ver: '4.0.24', importer: 'typescript' }),
  '.scene': () => ({ ver: '1.1.50', importer: 'scene', files: ['.json'] }),
  '.json': () => ({ ver: '2.0.1', importer: 'json', files: ['.json'] }),
};

function metaFor(abs, rel, isDir) {
  const make = isDir ? IMPORTERS.dir : IMPORTERS[extname(abs)];
  if (!make) return null;
  const m = { ...base, ...make() };
  return { ver: m.ver, importer: m.importer, imported: true, uuid: uuidFor(rel), files: m.files, subMetas: {}, userData: {} };
}

const missing = [];
const unknown = [];
function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.') || name.endsWith('.meta')) continue;
    const abs = join(dir, name);
    const isDir = statSync(abs).isDirectory();
    const rel = relative(root, abs).split('\\').join('/');
    if (!existsSync(`${abs}.meta`)) {
      const meta = metaFor(abs, rel, isDir);
      if (!meta) unknown.push(rel);
      else {
        missing.push(rel);
        if (!check) writeFileSync(`${abs}.meta`, JSON.stringify(meta, null, 2) + '\n');
      }
    }
    if (isDir) walk(abs);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'uuid') {
    const u = uuidFor(process.argv[3]);
    console.log(u, compressUuid(u));
    process.exit(0);
  }
  walk(assets);
  for (const r of unknown) console.error(`✗ 不认识的资源类型，没生成 .meta：${r}`);
  if (check && missing.length) {
    for (const r of missing) console.error(`✗ 缺 .meta：${r}`);
    process.exit(1);
  }
  if (!check) for (const r of missing) console.log(`+ ${r}.meta`);
  if (unknown.length) process.exit(1);
}
