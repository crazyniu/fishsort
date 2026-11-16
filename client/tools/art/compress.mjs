// 包体压缩（docs/09 第 8 步）：界面图、鱼、家园物件的 PNG 量化成 256 色调色板（libimagequant，带透明，肉眼无差），
// 家园物件先缩到最大显示尺寸的 2 倍。已经是调色板 PNG 的跳过（可以反复跑，不会越压越糊）。
// 用法：node tools/art/compress.mjs [--dry | --check]（--check：有没压过的图就报错，./run.sh check 用）
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const RES = join(ROOT, 'assets/resources');
const DIRS = ['ui/kit', 'ui/icon', 'ui/base', 'fish'];
/** 家园物件最大显示约 240 设计单位，2 倍够用 */
const MAX_SIDE = { 'ui/base': 480 };
const check = process.argv.includes('--check');
const dry = check || process.argv.includes('--dry');

/** PNG 头里的颜色类型：3 = 调色板 */
function isPalette(buf) {
  return buf.length > 25 && buf.readUInt32BE(12) === 0x49484452 && buf[25] === 3;
}

let before = 0;
let after = 0;
let changed = 0;
for (const d of DIRS) {
  const dir = join(RES, d);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.png')) continue;
    const p = join(dir, f);
    const buf = readFileSync(p);
    before += buf.length;
    if (isPalette(buf)) {
      after += buf.length;
      continue;
    }
    let img = sharp(buf);
    const max = MAX_SIDE[d];
    if (max) {
      const m = await img.metadata();
      if (Math.max(m.width ?? 0, m.height ?? 0) > max) img = img.resize({ width: max, height: max, fit: 'inside' });
    }
    const out = await img.png({ palette: true, quality: 95, effort: 10, dither: 1.0, compressionLevel: 9 }).toBuffer();
    if (out.length < buf.length) {
      after += out.length;
      changed++;
      if (!dry) writeFileSync(p, out);
    } else after += buf.length;
  }
}
const mb = (n) => (n / 1048576).toFixed(1);
if (check) {
  if (changed > 0) {
    console.error(`✗ 有 ${changed} 张图没压缩（${mb(before - after)} MB 可省），先跑 ./run.sh art-compress`);
    process.exit(1);
  }
  process.exit(0);
}
console.log(`✓ ${changed} 张压过：${mb(before)} MB → ${mb(after)} MB${dry ? '（--dry，没写文件）' : ''}`);

