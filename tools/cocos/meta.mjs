#!/usr/bin/env node
// 给 client/assets 下缺 .meta 的文件和目录补 .meta。
// UUID 由「相对路径」算出，换机器、重新生成都不变；已有的 .meta 不动。
// 用法：node tools/cocos/meta.mjs            补齐
//       node tools/cocos/meta.mjs --check    只检查，缺了就以非 0 退出（CI 用）
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
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
// 九宫格边距（像素，上 下 左 右）：tools/art/kit.mjs 画部件时写的
const slicesPath = join(root, 'tools/art/slices.json');
const SLICES = existsSync(slicesPath) ? JSON.parse(readFileSync(slicesPath, 'utf8')) : {};
// Codex 位图部件（ui/skin）的边距：tools/art/skin.py 切图时写的
const skinSlicesPath = join(root, 'tools/art/slices_skin.json');
if (existsSync(skinSlicesPath)) Object.assign(SLICES, JSON.parse(readFileSync(skinSlicesPath, 'utf8')));

/** 读 PNG / JPEG 的宽高（只看文件头） */
function imageSize(abs) {
  const b = readFileSync(abs);
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  let i = 2;
  while (i < b.length) {
    const m = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(i + 7), b.readUInt16BE(i + 5)];
    i += 2 + len;
  }
  throw new Error(`读不出图片尺寸：${abs}`);
}

/**
 * 图片的 .meta：sprite-frame 类型，线性过滤 + mipmap（缩小显示不出锯齿），修透明边（去黑边），
 * 不裁透明边（尺寸要和设计一致），九宫格边距按 slices.json。见 docs/09 第 7 节。
 */
function imageMeta(abs, rel) {
  const uuid = uuidFor(rel);
  const [w, h] = imageSize(abs);
  const name = rel.split('/').pop().replace(/\.[^.]+$/, '');
  const [bt, bb, bl, br] = SLICES[name] ?? [0, 0, 0, 0];
  const hasAlpha = extname(abs) === '.png';
  return {
    ver: '1.0.27',
    importer: 'image',
    imported: true,
    uuid,
    // Cocos 写的顺序：png 是 .json 在前，jpg 是 .jpg 在前
    files: hasAlpha ? ['.json', extname(abs)] : [extname(abs), '.json'],
    subMetas: {
      '6c48a': {
        importer: 'texture',
        uuid: `${uuid}@6c48a`,
        displayName: name,
        id: '6c48a',
        name: 'texture',
        userData: {
          wrapModeS: 'clamp-to-edge',
          wrapModeT: 'clamp-to-edge',
          imageUuidOrDatabaseUri: uuid,
          isUuid: true,
          visible: false,
          minfilter: 'linear',
          magfilter: 'linear',
          mipfilter: 'linear',
          anisotropy: 0,
        },
        ver: '1.0.22',
        imported: true,
        files: ['.json'],
        subMetas: {},
      },
      f9941: {
        importer: 'sprite-frame',
        uuid: `${uuid}@f9941`,
        displayName: name,
        id: 'f9941',
        name: 'spriteFrame',
        userData: {
          trimThreshold: 1,
          rotated: false,
          offsetX: 0,
          offsetY: 0,
          trimX: 0,
          trimY: 0,
          width: w,
          height: h,
          rawWidth: w,
          rawHeight: h,
          borderTop: bt,
          borderBottom: bb,
          borderLeft: bl,
          borderRight: br,
          packable: true,
          pixelsToUnit: 100,
          pivotX: 0.5,
          pivotY: 0.5,
          meshType: 0,
          vertices: {
            rawPosition: [-w / 2, -h / 2, 0, w / 2, -h / 2, 0, -w / 2, h / 2, 0, w / 2, h / 2, 0],
            indexes: [0, 1, 2, 2, 1, 3],
            uv: [0, h, w, h, 0, 0, w, 0],
            nuv: [0, 0, 1, 0, 0, 1, 1, 1],
            minPos: [-w / 2, -h / 2, 0],
            maxPos: [w / 2, h / 2, 0],
          },
          isUuid: true,
          imageUuidOrDatabaseUri: `${uuid}@6c48a`,
          atlasUuid: '',
          trimType: 'none',
        },
        ver: '1.0.12',
        imported: true,
        files: ['.json'],
        subMetas: {},
      },
    },
    userData: { type: 'sprite-frame', redirect: `${uuid}@6c48a`, hasAlpha, fixAlphaTransparencyArtifacts: hasAlpha },
  };
}

const IMPORTERS = {
  dir: () => ({ ver: '1.2.0', importer: 'directory' }),
  '.ts': () => ({ ver: '4.0.24', importer: 'typescript' }),
  '.scene': () => ({ ver: '1.1.50', importer: 'scene', files: ['.json'] }),
  '.json': () => ({ ver: '2.0.1', importer: 'json', files: ['.json'] }),
  '.ttf': (name) => ({ ver: '1.0.1', importer: 'ttf-font', files: ['.json', name] }),
  '.wav': () => ({ ver: '1.0.0', importer: 'audio-clip', files: ['.json', '.wav'], userData: { downloadMode: 0 } }),
  '.mp3': () => ({ ver: '1.0.0', importer: 'audio-clip', files: ['.json', '.mp3'], userData: { downloadMode: 0 } }),
};

// assets/resources 是 Cocos 的内置资源包，编辑器会给它写上这几项；先写好，免得 Mac 上构建后出现改动
const USER_DATA = {
  'assets/resources': { isBundle: true, bundleConfigID: 'default', bundleName: 'resources', priority: 8 },
};

function metaFor(abs, rel, isDir) {
  const make = isDir ? IMPORTERS.dir : IMPORTERS[extname(abs)];
  if (!make) return null;
  const m = { ...base, ...make(rel.split('/').pop()) };
  const userData = USER_DATA[rel] ?? m.userData ?? {};
  return { ver: m.ver, importer: m.importer, imported: true, uuid: uuidFor(rel), files: m.files, subMetas: {}, userData };
}

const missing = [];
const unknown = [];
function walk(dir) {
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('.') || name.endsWith('.meta')) continue;
    const abs = join(dir, name);
    const isDir = statSync(abs).isDirectory();
    const rel = relative(root, abs).split('\\').join('/');
    const ext = extname(name).toLowerCase();
    if (!isDir && (ext === '.png' || ext === '.jpg')) {
      const text = JSON.stringify(imageMeta(abs, rel), null, 2) + '\n';
      const old = existsSync(`${abs}.meta`) ? readFileSync(`${abs}.meta`, 'utf8') : '';
      if (old !== text) {
        missing.push(rel);
        if (!check) writeFileSync(`${abs}.meta`, text);
      }
    } else if (!existsSync(`${abs}.meta`)) {
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
