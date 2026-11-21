// PNG 无损重压（微信版放到网上的资源用，tools/wechat/remote.mjs 调）。
// Cocos 导入图片时会「修透明边」（fixAlphaTransparencyArtifacts，免得缩放时出黑边），然后按 8 位 RGBA 全彩重新存盘，
// 我们压好的 256 色调色板 PNG 在构建产物里又变大了（鱼图 14.6 KB → 21.3 KB）。这里把它们重新存小：
//   - 整张图不超过 256 种颜色（按 RGBA 算）：存成调色板 PNG（颜色表 + 透明度表），每个像素原样保留；
//   - 超过 256 种（Cocos 给透明像素填了颜色，一般就多出二三十种）：保持全彩，换最高压缩级别重存（实测小 3% 左右）。
// 每张新图都解码回来和原图逐像素比对，完全一样、而且确实更小才替换——画质一点不变。
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

// sharp 装在 client/node_modules（client/package.json 的开发依赖）
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sharp = createRequire(join(ROOT, 'client/package.json'))('sharp');

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** RGBA 像素 → 调色板 PNG；颜色超过 256 种返回 null */
function encodePalette(rgba, w, h) {
  const index = new Map();
  const pal = [];
  const px = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const key = rgba.readUInt32BE(i * 4);
    let k = index.get(key);
    if (k === undefined) {
      if (pal.length === 256) return null;
      k = pal.length;
      index.set(key, k);
      pal.push(key);
    }
    px[i] = k;
  }
  // 不透明的颜色排在后面，透明度表（tRNS）只写到最后一个半透明的为止，能短一点
  const order = pal.map((c, i) => i).sort((a, b) => (pal[a] & 0xff) - (pal[b] & 0xff));
  const remap = new Uint8Array(pal.length);
  order.forEach((old, i) => (remap[old] = i));
  const sorted = order.map((i) => pal[i]);
  const bits = sorted.length <= 2 ? 1 : sorted.length <= 4 ? 2 : sorted.length <= 16 ? 4 : 8;
  const stride = Math.ceil((w * bits) / 8);
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (stride + 1);
    raw[row] = 0; // 调色板图不做行滤波压得最小
    for (let x = 0; x < w; x++) {
      const v = remap[px[y * w + x]];
      const bitPos = x * bits;
      raw[row + 1 + (bitPos >> 3)] |= v << (8 - bits - (bitPos & 7));
    }
  }
  const plte = Buffer.alloc(sorted.length * 3);
  sorted.forEach((c, i) => {
    plte[i * 3] = c >>> 24;
    plte[i * 3 + 1] = (c >>> 16) & 0xff;
    plte[i * 3 + 2] = (c >>> 8) & 0xff;
  });
  let lastAlpha = -1;
  sorted.forEach((c, i) => (c & 0xff) !== 0xff && (lastAlpha = i));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = bits;
  ihdr[9] = 3; // 调色板
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('PLTE', plte)];
  if (lastAlpha >= 0) parts.push(chunk('tRNS', Buffer.from(sorted.slice(0, lastAlpha + 1).map((c) => c & 0xff))));
  parts.push(chunk('IDAT', deflateSync(raw, { level: 9, memLevel: 9 })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

async function rgbaOf(buf) {
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** 重压一张；返回 [原大小, 新大小]（没变小或比对不一致时新大小 = 原大小，文件不动） */
export async function packPng(path) {
  const src = readFileSync(path);
  const { data, w, h } = await rgbaOf(src);
  let out = encodePalette(data, w, h);
  if (!out) out = await sharp(data, { raw: { width: w, height: h, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: false, palette: false }).toBuffer();
  if (out.length >= src.length) return [src.length, src.length];
  const back = await rgbaOf(out);
  if (back.w !== w || back.h !== h || !back.data.equals(data)) return [src.length, src.length];
  writeFileSync(path, out);
  return [src.length, out.length];
}
