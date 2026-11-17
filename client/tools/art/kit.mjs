#!/usr/bin/env node
// 代码画的界面小件：特效用的光、环、星、彩纸，纯色块、分隔线。SVG 写的，按 3 倍渲染成透明 PNG。
// 平面的界面部件（按钮、面板、图标键、白色图标）在 tools/art/flat_skin.py；鱼缸、气泡这些插画是 Codex 出的位图（tools/art/skin.py → ui/skin）。
// 输出 assets/resources/ui/kit/<名字>.png，九宫格边距写进 tools/art/slices.json（meta.mjs 读它）。
// 用法：node tools/art/kit.mjs [名字...]   不给名字 = 全部重画；--sheet 另出一张总览图
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'assets/resources/ui/kit');
/** 渲染倍率：显示尺寸（设计分辨率 750 宽）× 3 */
export const RES = 3;

// ---------------------------------------------------------------- 工具
const parts = new Map();
const slices = {};
let gid = 0;
const id = (p) => `${p}${gid++}`;

/** 注册一个部件。w、h 是显示尺寸（设计单位）；border = [上, 下, 左, 右]（设计单位，九宫格） */
function part(name, w, h, body, border) {
  parts.set(name, { w, h, body });
  if (border) slices[name] = border.map((v) => v * RES);
}

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w * RES}" height="${h * RES}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

function lin(stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) {
  const g = id('g');
  const s = stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('');
  return [g, `<linearGradient id="${g}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${s}</linearGradient>`];
}

function rad(stops, cx = 0.5, cy = 0.5, r = 0.5, fx = cx, fy = cy) {
  const g = id('r');
  const s = stops.map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`).join('');
  return [g, `<radialGradient id="${g}" cx="${cx}" cy="${cy}" r="${r}" fx="${fx}" fy="${fy}">${s}</radialGradient>`];
}

const rr = (x, y, w, h, r, attrs) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" ry="${r}" ${attrs}/>`;

// ---------------------------------------------------------------- 分隔线
// 细分隔线（家园信息条、区域之间）
part('tab_divider', 4, 80, rr(0, 0, 4, 80, 2, 'fill="#0B2A73" fill-opacity="0.3"'));

// ---------------------------------------------------------------- 局内：满缸的光、提示光圈
{
  const [gl, dl] = rad([[0, '#BFF4FF', 0.9], [1, '#3FB7FF', 0]]);
  part('bowl_glow', 180, 180, `<defs>${dl}</defs><circle cx="90" cy="100" r="88" fill="url(#${gl})"/>`);
  const [gh, dh] = rad([[0.6, '#FFF27A', 0], [0.82, '#FFE14A', 0.9], [1, '#FFB300', 0]]);
  part('hint_ring', 200, 200, `<defs>${dh}</defs><circle cx="100" cy="100" r="98" fill="url(#${gh})"/>`);
}

// ---------------------------------------------------------------- 特效、杂项
{
  const [g, d] = rad([[0, '#fff', 0.95], [0.25, '#FFF6B0', 0.7], [1, '#FFD84A', 0]]);
  part('fx_glow', 200, 200, `<defs>${d}</defs><circle cx="100" cy="100" r="100" fill="url(#${g})"/>`);
  part('fx_spark', 64, 64, `<path d="M32 0 C35 24 40 29 64 32 C40 35 35 40 32 64 C29 40 24 35 0 32 C24 29 29 24 32 0 Z" fill="#fff"/>`);
  part('fx_ring', 200, 200, `<circle cx="100" cy="100" r="92" fill="none" stroke="#fff" stroke-width="10"/>`);
  const rays = Array.from({ length: 12 }, (_, i) => {
    const a = (i * Math.PI) / 6;
    const b = a + 0.16;
    return `<path d="M100 100 L${100 + 100 * Math.cos(a)} ${100 + 100 * Math.sin(a)} L${100 + 100 * Math.cos(b)} ${100 + 100 * Math.sin(b)} Z"/>`;
  }).join('');
  const [gr, dr] = rad([[0, '#FFF8C2', 0.9], [1, '#FFE066', 0]]);
  part('fx_rays', 200, 200, `<defs>${dr}</defs><g fill="url(#${gr})">${rays}</g>`);
  // 光柱（主页的动态光照）：上窄下宽的一束白光，上亮下淡、两边虚化；代码里染色、摆动、明暗变化
  const [gb, db] = lin([[0, '#fff', 0.95], [0.5, '#fff', 0.45], [1, '#fff', 0]]);
  part(
    'fx_beam',
    96,
    256,
    `<defs>${db}<filter id="beamBlur" x="-30%" y="-5%" width="160%" height="110%"><feGaussianBlur stdDeviation="5 2"/></filter></defs><path d="M36 4 L60 4 L88 252 L8 252 Z" fill="url(#${gb})" filter="url(#beamBlur)"/>`,
  );
  part('confetti', 16, 24, rr(0, 0, 16, 24, 3, 'fill="#fff"'));
  part('white', 8, 8, rr(0, 0, 8, 8, 0, 'fill="#fff"'), [3, 3, 3, 3]);
  part('round_white', 64, 64, rr(0, 0, 64, 64, 22, 'fill="#fff"'), [24, 24, 24, 24]);
  part('circle_white', 64, 64, '<circle cx="32" cy="32" r="31" fill="#fff"/>');
}

// ---------------------------------------------------------------- 输出
async function render(name) {
  const p = parts.get(name);
  const png = new Resvg(svg(p.w, p.h, p.body), { fitTo: { mode: 'original' } }).render().asPng();
  // 直接量化成 256 色调色板（包体；肉眼无差，见 tools/art/compress.mjs）
  const small = await sharp(png).png({ palette: true, quality: 95, effort: 10, dither: 1.0, compressionLevel: 9 }).toBuffer();
  writeFileSync(join(OUT, `${name}.png`), small.length < png.length ? small : png);
}

const sheetAt = process.argv.indexOf('--sheet');
const args = process.argv.slice(2).filter((a, i) => !a.startsWith('--') && i + 2 !== sheetAt + 1);
mkdirSync(OUT, { recursive: true });
for (const name of args.length ? args : [...parts.keys()]) {
  if (!parts.has(name)) throw new Error(`没有这个部件：${name}`);
  await render(name);
}
writeFileSync(join(ROOT, 'tools/art/slices.json'), JSON.stringify(slices, null, 2) + '\n');
console.log(`✓ 画了 ${args.length || parts.size} 个部件 → assets/resources/ui/kit（${RES} 倍）`);

if (process.argv.includes('--sheet')) {
  // 总览：深浅两种底各放一份，200% 放大看边缘（docs/09 第 7 节第 6 条）
  const cell = 150;
  const names = [...parts.keys()];
  const cols = 8;
  const rows = Math.ceil(names.length / cols);
  const items = names
    .map((n, i) => {
      const p = parts.get(n);
      const k = Math.min((cell - 24) / p.w, (cell - 34) / p.h, 2);
      const x = (i % cols) * cell + (cell - p.w * k) / 2;
      const y = Math.floor(i / cols) * cell + 6 + (cell - 34 - p.h * k) / 2;
      return `<g transform="translate(${x} ${y}) scale(${k})">${p.body}</g><text x="${(i % cols) * cell + cell / 2}" y="${Math.floor(i / cols) * cell + cell - 8}" font-size="12" fill="#fff" text-anchor="middle" font-family="sans-serif">${n}</text>`;
    })
    .join('');
  const sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}"><rect width="100%" height="100%" fill="#2F6FD0"/>${items}</svg>`;
  writeFileSync(process.argv[process.argv.indexOf('--sheet') + 1] ?? '/tmp/kit_sheet.png', new Resvg(sheet).render().asPng());
}
