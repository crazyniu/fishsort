#!/usr/bin/env node
// 界面部件：SVG 写的，按 3 倍渲染成透明 PNG（docs/09 第 7 节）。
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

// ---------------------------------------------------------------- 颜色
const C = {
  navy: '#0B2A73',
  navy2: '#123C9C',
  royal: '#1F5FE0',
  royal2: '#2F7BFF',
  cyan: '#43C8FF',
  ice: '#C9F2FF',
  ice2: '#8FDDFB',
  white: '#FFFFFF',
};
const BTN = {
  green: ['#8CF04A', '#3DC21A', '#1E8A0E', '#13650A'],
  blue: ['#6FC3FF', '#2D8BF5', '#1659C9', '#0D3D93'],
  yellow: ['#FFE96B', '#FFC21F', '#E58A06', '#A85D02'],
  purple: ['#D49BFF', '#9B4DF5', '#6A22C9', '#481493'],
  orange: ['#FFC266', '#FF8A1F', '#D9580A', '#9C3B05'],
  red: ['#FF9A8A', '#F2483A', '#C42318', '#8A160E'],
  gray: ['#E6ECF3', '#B6C1CE', '#8794A6', '#5E6B7D'],
};
const RARITY = {
  common: ['#E8EEF6', '#A9B7C9', '#6E7F96'],
  uncommon: ['#B9F59A', '#4FC93A', '#25841A'],
  rare: ['#A6DDFF', '#2F8BF5', '#1453B8'],
  epic: ['#E2B5FF', '#A44DF5', '#6A1FC2'],
  legend: ['#FFF1A3', '#FFC21F', '#D07A05'],
};

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

// ---------------------------------------------------------------- 按钮（胶囊，横向九宫格）
// 上半高光、下沿深色厚边、细深色描边（docs/09 第 3 节）
function pill(name, col, w = 120, h = 96) {
  const [hi, mid, low, edge] = col;
  const r = (h - 10) / 2;
  const [g1, d1] = lin([[0, hi], [0.5, mid], [1, low]]);
  const [g2, d2] = lin([[0, '#fff', 0.85], [1, '#fff', 0.15]]);
  const body = `<defs>${d1}${d2}</defs>
    ${rr(2, 8, w - 4, h - 10, r, `fill="${edge}"`)}
    ${rr(2, 2, w - 4, h - 12, r, `fill="url(#${g1})" stroke="${edge}" stroke-width="2.5"`)}
    ${rr(r * 0.55, 6, w - r * 1.1, (h - 12) * 0.36, (h - 12) * 0.18, `fill="url(#${g2})"`)}
    <ellipse cx="${r * 0.62}" cy="${h * 0.26}" rx="${r * 0.18}" ry="${r * 0.12}" fill="#fff" opacity="0.9"/>`;
  part(name, w, h, body, [0, 0, r + 4, r + 4]);
}
for (const [k, v] of Object.entries(BTN)) pill(`btn_${k}`, v);

// 方形图标按钮（设置、返回）
function roundBtn(name, col, s = 88) {
  const [hi, mid, low, edge] = col;
  const [g1, d1] = lin([[0, hi], [0.55, mid], [1, low]]);
  const [g2, d2] = lin([[0, '#fff', 0.8], [1, '#fff', 0]]);
  const r = s / 2 - 4;
  const body = `<defs>${d1}${d2}</defs>
    <circle cx="${s / 2}" cy="${s / 2 + 3}" r="${r}" fill="${edge}"/>
    <circle cx="${s / 2}" cy="${s / 2}" r="${r}" fill="url(#${g1})" stroke="#fff" stroke-width="3.5"/>
    <ellipse cx="${s / 2}" cy="${s * 0.3}" rx="${r * 0.62}" ry="${r * 0.32}" fill="url(#${g2})"/>`;
  part(name, s, s, body);
}
roundBtn('round_blue', BTN.blue);
roundBtn('round_green', BTN.green);
roundBtn('round_red', BTN.red);

// ---------------------------------------------------------------- 弹窗
// 宝蓝圆角厚框（立体：上亮下暗）+ 饱和青色内底（16、18）。气泡、珊瑚点缀由代码另放
{
  const w = 300;
  const h = 300;
  const [gf, df] = lin([[0, '#6EC2FF'], [0.18, '#3592F7'], [0.7, '#1E62DA'], [1, '#164CB8']]);
  const [gi, di] = lin([[0, '#A6EBFF'], [0.45, '#7AD9FF'], [1, '#4FC2F5']]);
  const [gs, ds] = lin([[0, '#fff', 0.8], [1, '#fff', 0]]);
  const [gw, dw] = lin([[0, '#fff', 0.55], [0.25, '#fff', 0]]);
  const body = `<defs>${df}${di}${ds}${dw}</defs>
    ${rr(3, 10, w - 6, h - 12, 54, `fill="#0A2B7A"`)}
    ${rr(3, 3, w - 6, h - 12, 54, `fill="url(#${gf})" stroke="#0B2F86" stroke-width="4"`)}
    ${rr(9, 8, w - 18, h - 24, 48, `fill="none" stroke="#9FD8FF" stroke-width="3" opacity="0.8"`)}
    ${rr(30, 12, w - 60, 16, 8, `fill="url(#${gs})"`)}
    ${rr(26, 30, w - 52, h - 64, 34, `fill="#0F4BB8"`)}
    ${rr(26, 33, w - 52, h - 66, 34, `fill="url(#${gi})"`)}
    ${rr(26, 33, w - 52, h - 66, 34, `fill="url(#${gw})"`)}
    ${rr(26, 30, w - 52, h - 63, 34, `fill="none" stroke="#1756C4" stroke-width="3"`)}`;
  part('panel', w, h, body, [80, 80, 80, 80]);
}
// 列表行（17 排行）：宝蓝底 + 亮青描边，上亮下暗
{
  const w = 200;
  const h = 120;
  const [gf, df] = lin([[0, '#3A8CF5'], [0.5, '#1F64DC'], [1, '#174FC0']]);
  const [gs, ds] = lin([[0, '#fff', 0.5], [1, '#fff', 0]]);
  const body = `<defs>${df}${ds}</defs>
    ${rr(3, 8, w - 6, h - 10, 36, `fill="#0A2B7A"`)}
    ${rr(3, 3, w - 6, h - 10, 36, `fill="url(#${gf})" stroke="#8FD8FF" stroke-width="4"`)}
    ${rr(22, 9, w - 44, 16, 8, `fill="url(#${gs})"`)}`;
  part('row_blue', w, h, body, [44, 44, 44, 44]);
}
// 今天可领的格子（签到）：金黄底 + 白边，上亮下暗
{
  const w = 120;
  const h = 120;
  const [gf, df] = lin([[0, '#FFE680'], [0.5, '#FFC21F'], [1, '#F29A0C']]);
  const [gs, ds] = lin([[0, '#fff', 0.7], [1, '#fff', 0]]);
  const body = `<defs>${df}${ds}</defs>
    ${rr(2, 6, w - 4, h - 8, 24, `fill="#A85D02"`)}
    ${rr(2, 2, w - 4, h - 8, 24, `fill="url(#${gf})" stroke="#fff" stroke-width="4"`)}
    ${rr(14, 8, w - 28, 14, 7, `fill="url(#${gs})"`)}`;
  part('cell_gold', w, h, body, [30, 30, 30, 30]);
}
// 弹窗标题凸台：和框同色的圆顶台子，两肩圆弧过渡到框上沿（16、18）
{
  const w = 240;
  const h = 110;
  const [gf, df] = lin([[0, '#6EC2FF'], [0.35, '#3592F7'], [1, '#2B7CEB']]);
  const [gs, ds] = lin([[0, '#fff', 0.8], [1, '#fff', 0]]);
  const shape = (o) =>
    `M0 ${h} Q22 ${h} 24 ${h - 22} V${50 + o} Q24 ${6 + o} 66 ${6 + o} H${w - 66} Q${w - 24} ${6 + o} ${w - 24} ${50 + o} V${h - 22} Q${w - 22} ${h} ${w} ${h} Z`;
  const body = `<defs>${df}${ds}</defs>
    <path d="${shape(4)}" fill="#0A2B7A"/>
    <path d="${shape(0)}" fill="url(#${gf})" stroke="#0B2F86" stroke-width="4" stroke-linejoin="round"/>
    <path d="M31 ${h - 20} V52 Q31 13 68 13 H${w - 68} Q${w - 31} 13 ${w - 31} 52 V${h - 20}" fill="none" stroke="#9FD8FF" stroke-width="3" opacity="0.8"/>
    ${rr(54, 14, w - 108, 16, 8, `fill="url(#${gs})"`)}
    <rect x="0" y="${h - 3}" width="${w}" height="3" fill="#2B7CEB"/>`;
  part('popup_head', w, h, body, [0, 0, 76, 76]);
}
// 页面里的玻璃卡片（04 商店、06 收藏、13 结算奖励条）：半透明浅蓝 + 亮青描边
{
  const w = 200;
  const h = 200;
  const [gf, df] = lin([[0, '#9BE2FF', 0.62], [0.5, '#4FA8F2', 0.5], [1, '#2C7FE0', 0.55]]);
  const [gs, ds] = lin([[0, '#fff', 0.6], [1, '#fff', 0]]);
  const body = `<defs>${df}${ds}</defs>
    ${rr(3, 7, w - 6, h - 9, 40, `fill="#0B3A8F" fill-opacity="0.35"`)}
    ${rr(3, 3, w - 6, h - 9, 40, `fill="url(#${gf})" stroke="#CFF6FF" stroke-width="5"`)}
    ${rr(10, 10, w - 20, h - 23, 33, `fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2"`)}
    ${rr(24, 12, w - 48, 22, 11, `fill="url(#${gs})"`)}`;
  part('panel_glass', w, h, body, [56, 56, 56, 56]);
}
// 整块宝蓝底（15、19）：亮蓝厚边（上亮下暗）+ 深宝蓝内底
{
  const w = 300;
  const h = 300;
  const [gf, df] = lin([[0, '#8AD4FF'], [0.2, '#3FA2FF'], [0.75, '#2378EC'], [1, '#1A5CD0']]);
  const [gi, di] = lin([[0, '#2F7CF0'], [0.5, '#1C5ED8'], [1, '#1548BC']]);
  const [gs, ds] = lin([[0, '#fff', 0.85], [1, '#fff', 0]]);
  const [gw, dw] = lin([[0, '#fff', 0.25], [0.3, '#fff', 0]]);
  const body = `<defs>${df}${di}${ds}${dw}</defs>
    ${rr(3, 10, w - 6, h - 12, 54, `fill="#0A2B7A"`)}
    ${rr(3, 3, w - 6, h - 12, 54, `fill="url(#${gf})" stroke="#0B2F86" stroke-width="4"`)}
    ${rr(9, 8, w - 18, h - 24, 48, `fill="none" stroke="#C4ECFF" stroke-width="3" opacity="0.8"`)}
    ${rr(30, 12, w - 60, 14, 7, `fill="url(#${gs})"`)}
    ${rr(24, 26, w - 48, h - 58, 36, `fill="#0D3A9A"`)}
    ${rr(24, 29, w - 48, h - 60, 36, `fill="url(#${gi})"`)}
    ${rr(24, 29, w - 48, h - 60, 36, `fill="url(#${gw})"`)}`;
  part('panel_blue', w, h, body, [80, 80, 80, 80]);
}
// 弹窗标题凸台：和框同色的圆顶台子，两肩圆弧过渡到框上沿（16、18）
{
  const w = 240;
  const h = 110;
  const [gf, df] = lin([[0, '#6EC2FF'], [0.35, '#3592F7'], [1, '#2B7CEB']]);
  const [gs, ds] = lin([[0, '#fff', 0.8], [1, '#fff', 0]]);
  const shape = (o) =>
    `M0 ${h} Q22 ${h} 24 ${h - 22} V${50 + o} Q24 ${6 + o} 66 ${6 + o} H${w - 66} Q${w - 24} ${6 + o} ${w - 24} ${50 + o} V${h - 22} Q${w - 22} ${h} ${w} ${h} Z`;
  const body = `<defs>${df}${ds}</defs>
    <path d="${shape(4)}" fill="#0A2B7A"/>
    <path d="${shape(0)}" fill="url(#${gf})" stroke="#0B2F86" stroke-width="4" stroke-linejoin="round"/>
    <path d="M31 ${h - 20} V52 Q31 13 68 13 H${w - 68} Q${w - 31} 13 ${w - 31} 52 V${h - 20}" fill="none" stroke="#9FD8FF" stroke-width="3" opacity="0.8"/>
    ${rr(54, 14, w - 108, 16, 8, `fill="url(#${gs})"`)}
    <rect x="0" y="${h - 3}" width="${w}" height="3" fill="#2B7CEB"/>`;
  part('popup_head', w, h, body, [0, 0, 76, 76]);
}
// 页面里的玻璃卡片（04 商店、06 收藏、13 结算奖励条）：半透明浅蓝 + 亮青描边
{
  const w = 200;
  const h = 200;
  const [gf, df] = lin([[0, '#9BE2FF', 0.62], [0.5, '#4FA8F2', 0.5], [1, '#2C7FE0', 0.55]]);
  const [gs, ds] = lin([[0, '#fff', 0.6], [1, '#fff', 0]]);
  const body = `<defs>${df}${ds}</defs>
    ${rr(3, 7, w - 6, h - 9, 40, `fill="#0B3A8F" fill-opacity="0.35"`)}
    ${rr(3, 3, w - 6, h - 9, 40, `fill="url(#${gf})" stroke="#CFF6FF" stroke-width="5"`)}
    ${rr(10, 10, w - 20, h - 23, 33, `fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="2"`)}
    ${rr(24, 12, w - 48, 22, 11, `fill="url(#${gs})"`)}`;
  part('panel_glass', w, h, body, [56, 56, 56, 56]);
}
// 整块宝蓝底（15、19）
{
  const w = 240;
  const h = 240;
  const [gf, df] = lin([[0, '#5CB4FF'], [0.18, C.royal2], [1, '#1546B8']]);
  const [gs, ds] = lin([[0, '#fff', 0.55], [1, '#fff', 0]]);
  const body = `<defs>${df}${ds}</defs>
    ${rr(2, 6, w - 4, h - 8, 44, `fill="${C.navy}"`)}
    ${rr(2, 2, w - 4, h - 8, 44, `fill="url(#${gf})" stroke="${C.navy}" stroke-width="3"`)}
    ${rr(8, 8, w - 16, h - 20, 38, `fill="none" stroke="#8FD0FF" stroke-width="3" opacity="0.8"`)}
    ${rr(22, 16, w - 44, 34, 17, `fill="url(#${gs})"`)}`;
  part('panel_blue', w, h, body, [64, 64, 64, 64]);
}
// 弹窗里的一行（浅色底条）
{
  const w = 120;
  const h = 64;
  const body = `${rr(1, 1, w - 2, h - 2, 22, `fill="#fff" fill-opacity="0.5" stroke="#fff" stroke-opacity="0.9" stroke-width="2"`)}`;
  part('row', w, h, body, [26, 26, 26, 26]);
}
// 标题胶囊（顶部）
{
  const w = 160;
  const h = 84;
  const [g, d] = lin([[0, '#6CC4FF'], [0.5, '#2E86F5'], [1, '#1A5BD0']]);
  const [gs, ds] = lin([[0, '#fff', 0.75], [1, '#fff', 0]]);
  const body = `<defs>${d}${ds}</defs>
    ${rr(2, 7, w - 4, h - 9, 36, `fill="${C.navy}"`)}
    ${rr(2, 2, w - 4, h - 9, 36, `fill="url(#${g})" stroke="#fff" stroke-width="4"`)}
    ${rr(24, 8, w - 48, 22, 11, `fill="url(#${gs})"`)}`;
  part('title_plate', w, h, body, [0, 0, 42, 42]);
}
// 关闭键
{
  const s = 84;
  const [g1, d1] = lin([[0, '#7CCBFF'], [1, '#1F63D6']]);
  const body = `<defs>${d1}</defs>
    <circle cx="42" cy="45" r="37" fill="${C.navy}"/>
    <circle cx="42" cy="41" r="37" fill="url(#${g1})" stroke="#fff" stroke-width="5"/>
    <path d="M28 27 L56 55 M56 27 L28 55" stroke="${C.navy}" stroke-width="13" stroke-linecap="round"/>
    <path d="M28 27 L56 55 M56 27 L28 55" stroke="#fff" stroke-width="8" stroke-linecap="round"/>`;
  part('close', s, s, body);
}

// ---------------------------------------------------------------- 胶囊信息条（顶栏、家园、局内）
{
  const w = 120;
  const h = 64;
  const [g, d] = lin([[0, '#0E3A9E', 0.92], [1, '#071F63', 0.92]]);
  const body = `<defs>${d}</defs>
    ${rr(2, 2, w - 4, h - 4, 30, `fill="url(#${g})" stroke="#4A9BFF" stroke-width="3"`)}
    ${rr(10, 6, w - 20, 14, 7, `fill="#fff" opacity="0.12"`)}`;
  part('capsule', w, h, body, [0, 0, 32, 32]);
}
// 页面大标题下的底板（云朵状）
{
  const w = 200;
  const h = 96;
  const [g, d] = lin([[0, '#5DB9FF'], [1, '#1D5FD6']]);
  const body = `<defs>${d}</defs>
    ${rr(3, 8, w - 6, h - 10, 44, `fill="${C.navy}"`)}
    ${rr(3, 3, w - 6, h - 12, 42, `fill="url(#${g})" stroke="#fff" stroke-width="4"`)}
    ${rr(28, 10, w - 56, 20, 10, `fill="#fff" opacity="0.4"`)}`;
  part('title_page', w, h, body, [0, 0, 48, 48]);
}

// ---------------------------------------------------------------- 底栏
{
  const w = 200;
  const h = 150;
  const [g, d] = lin([[0, '#3C8DFF'], [0.08, C.royal], [1, '#0F3FAE']]);
  const body = `<defs>${d}</defs>
    ${rr(2, 2, w - 4, h - 4, 40, `fill="url(#${g})" stroke="${C.navy}" stroke-width="4"`)}
    ${rr(10, 6, w - 20, 6, 3, `fill="#9BD3FF" opacity="0.7"`)}`;
  part('tabbar', w, h, body, [48, 48, 48, 48]);
}
{
  const w = 140;
  const h = 150;
  const [g, d] = lin([[0, '#BFF0FF'], [0.45, '#5BC6FF'], [1, '#2E8FF0']]);
  const body = `<defs>${d}</defs>
    ${rr(4, 10, w - 8, h - 12, 34, `fill="#0D3C99"`)}
    ${rr(4, 4, w - 8, h - 14, 34, `fill="url(#${g})" stroke="#fff" stroke-width="5"`)}
    ${rr(18, 12, w - 36, 24, 12, `fill="#fff" opacity="0.55"`)}`;
  part('tab_sel', w, h, body, [44, 44, 44, 44]);
}
part('tab_divider', 4, 80, `${rr(0.5, 0, 3, 80, 1.5, `fill="#0B2A73" opacity="0.55"`)}${rr(2.5, 0, 1.5, 80, 0.75, `fill="#7FC0FF" opacity="0.5"`)}`);

// ---------------------------------------------------------------- 开关、分段、进度条
function toggle(name, on) {
  const w = 120;
  const h = 64;
  const col = on ? BTN.green : BTN.gray;
  const [g, d] = lin([[0, col[2]], [1, col[1]]]);
  const kx = on ? w - 32 : 32;
  const body = `<defs>${d}</defs>
    ${rr(2, 2, w - 4, h - 4, 30, `fill="url(#${g})" stroke="${col[3]}" stroke-width="3"`)}
    <circle cx="${kx}" cy="${h / 2 + 2}" r="23" fill="#000" opacity="0.18"/>
    <circle cx="${kx}" cy="${h / 2}" r="23" fill="#fff" stroke="#DDE6F0" stroke-width="2"/>`;
  part(name, w, h, body);
}
toggle('toggle_on', true);
toggle('toggle_off', false);
{
  const w = 100;
  const h = 60;
  part('seg_bg', w, h, rr(2, 2, w - 4, h - 4, 28, `fill="#1048B8" stroke="${C.navy}" stroke-width="3"`), [0, 0, 30, 30]);
  const [g, d] = lin([[0, BTN.green[0]], [1, BTN.green[2]]]);
  part('seg_on', w, h, `<defs>${d}</defs>${rr(4, 4, w - 8, h - 8, 26, `fill="url(#${g})" stroke="#fff" stroke-width="3"`)}`, [0, 0, 30, 30]);
}
{
  const w = 80;
  const h = 28;
  part('bar_track', w, h, rr(1, 1, w - 2, h - 2, 13, `fill="#0A2A70" stroke="#4A8FEF" stroke-width="2"`), [0, 0, 14, 14]);
  for (const [k, col] of [['green', BTN.green], ['yellow', BTN.yellow], ['blue', BTN.blue], ['purple', BTN.purple]]) {
    const [g, d] = lin([[0, col[0]], [1, col[2]]]);
    part(`bar_${k}`, w, h, `<defs>${d}</defs>${rr(3, 3, w - 6, h - 6, 11, `fill="url(#${g})"`)}${rr(9, 5, w - 18, 6, 3, `fill="#fff" opacity="0.55"`)}`, [0, 0, 14, 14]);
  }
}

// ---------------------------------------------------------------- 局内：暂存格、木架、鱼缸、气泡
{
  const w = 120;
  const h = 96;
  const [g, d] = lin([[0, '#fff', 0.35], [1, '#9FE6FF', 0.15]]);
  part('slot', w, h, `<defs>${d}</defs>${rr(3, 3, w - 6, h - 6, 18, `fill="url(#${g})" stroke="#BDF0FF" stroke-width="4"`)}${rr(12, 9, w - 24, 8, 4, `fill="#fff" opacity="0.5"`)}`, [24, 24, 24, 24]);
  part('slot_warn', w, h, `<defs>${d}</defs>${rr(3, 3, w - 6, h - 6, 18, `fill="#FF4A4A" fill-opacity="0.25" stroke="#FF4040" stroke-width="5"`)}`, [24, 24, 24, 24]);
}
{
  const w = 200;
  const h = 44;
  const [g, d] = lin([[0, '#E9A866'], [0.45, '#C17A3B'], [1, '#8C5222']]);
  part('shelf', w, h, `<defs>${d}</defs>${rr(2, 6, w - 4, h - 8, 12, `fill="#5E3410"`)}${rr(2, 2, w - 4, h - 10, 12, `fill="url(#${g})" stroke="#6B3D14" stroke-width="2.5"`)}${rr(12, 6, w - 24, 5, 2.5, `fill="#FFD8A8" opacity="0.6"`)}<path d="M30 20 Q60 16 90 21 M110 24 Q140 19 170 23" stroke="#8C5222" stroke-width="2" fill="none" opacity="0.6"/>`, [0, 0, 22, 22]);
}
{
  // 玻璃鱼缸：圆肚、窄口、厚口沿
  const s = 180;
  const [gb, db] = rad([[0, '#E6FBFF', 0.25], [0.7, '#9FE4FF', 0.32], [1, '#5CC5F2', 0.6]], 0.45, 0.5, 0.55);
  const [gw, dw] = lin([[0, '#5BD3FF', 0.35], [1, '#1E8FE0', 0.5]]);
  const [gr, dr] = lin([[0, '#fff'], [1, '#A8E6FF']]);
  const body = `<defs>${db}${dw}${dr}</defs>
    <path d="M52 38 C20 58 10 92 16 120 C24 158 58 174 90 174 C122 174 156 158 164 120 C170 92 160 58 128 38 Z" fill="url(#${gb})" stroke="#CFF4FF" stroke-width="4"/>
    <path d="M20 112 C34 106 60 102 90 104 C120 102 146 106 160 112 C156 150 124 170 90 170 C56 170 24 150 20 112 Z" fill="url(#${gw})"/>
    <ellipse cx="90" cy="36" rx="46" ry="12" fill="url(#${gr})" stroke="#8FD7F5" stroke-width="3"/>
    <ellipse cx="90" cy="36" rx="34" ry="6" fill="#4FB8E8" opacity="0.4"/>
    <path d="M34 74 C28 92 30 118 42 136" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.75"/>
    <ellipse cx="138" cy="76" rx="7" ry="12" fill="#fff" opacity="0.55"/>`;
  part('bowl', s, s, body);
  const [gl, dl] = rad([[0, '#BFF4FF', 0.9], [1, '#3FB7FF', 0]]);
  part('bowl_glow', s, s, `<defs>${dl}</defs><circle cx="90" cy="100" r="88" fill="url(#${gl})"/>`);
}
{
  // 气泡：透明身体、彩虹描边、高光
  const s = 200;
  const [gb, db] = rad([[0, '#fff', 0.02], [0.7, '#CFF5FF', 0.12], [0.92, '#7FD8FF', 0.38], [1, '#E8FBFF', 0.85]]);
  const [gs, ds] = lin([[0, '#9DE8FF'], [0.35, '#E5C8FF'], [0.65, '#B6FFE0'], [1, '#9DE8FF']], 0, 0, 1, 1);
  const body = `<defs>${db}${ds}</defs>
    <circle cx="100" cy="100" r="95" fill="url(#${gb})"/>
    <circle cx="100" cy="100" r="95" fill="none" stroke="url(#${gs})" stroke-width="4" opacity="0.9"/>
    <path d="M44 70 A62 62 0 0 1 86 36" stroke="#fff" stroke-width="10" stroke-linecap="round" fill="none" opacity="0.85"/>
    <circle cx="150" cy="140" r="8" fill="#fff" opacity="0.5"/>`;
  part('bubble', s, s, body);
}
{
  // 回流位小气泡、提示光圈、迷雾、锁链
  const s = 120;
  const [g, d] = rad([[0, '#fff', 0], [0.8, '#B3F0FF', 0.25], [1, '#fff', 0.9]]);
  part('bubble_small', s, s, `<defs>${d}</defs><circle cx="60" cy="60" r="56" fill="url(#${g})" stroke="#CFF6FF" stroke-width="3"/><path d="M28 44 A36 36 0 0 1 52 24" stroke="#fff" stroke-width="7" stroke-linecap="round" fill="none"/>`);
  const [gh, dh] = rad([[0.6, '#FFF27A', 0], [0.82, '#FFE14A', 0.9], [1, '#FFB300', 0]]);
  part('hint_ring', 200, 200, `<defs>${dh}</defs><circle cx="100" cy="100" r="98" fill="url(#${gh})"/>`);
  const [gf, df] = rad([[0, '#E9F1FF', 0.95], [0.75, '#C3D3F0', 0.92], [1, '#AFC2E6', 0]]);
  part('fog', 200, 200, `<defs>${df}</defs><circle cx="100" cy="100" r="100" fill="url(#${gf})"/><circle cx="70" cy="80" r="34" fill="#fff" opacity="0.5"/><circle cx="126" cy="112" r="40" fill="#fff" opacity="0.4"/>`);
  const link = (x, y, rot) => `<g transform="translate(${x} ${y}) rotate(${rot})"><rect x="-22" y="-12" width="44" height="24" rx="12" fill="none" stroke="#5B6B80" stroke-width="10"/><rect x="-22" y="-12" width="44" height="24" rx="12" fill="none" stroke="#C9D4E2" stroke-width="5"/></g>`;
  part('chain', 200, 200, `${link(40, 40, 45)}${link(76, 76, -45)}${link(112, 112, 45)}${link(148, 148, -45)}${link(160, 40, -45)}${link(124, 76, 45)}${link(88, 112, -45)}${link(52, 148, 45)}`);
}

// ---------------------------------------------------------------- 图标（白色 + 深蓝描边）
function icon(name, inner, s = 64) {
  const o = `<g fill="none" stroke="${C.navy}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
  const f = `<g fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${inner}</g>`;
  part(name, s, s, o + f);
}
function solidIcon(name, d, s = 64, fill = '#fff') {
  part(name, s, s, `<path d="${d}" fill="${C.navy}" stroke="${C.navy}" stroke-width="7" stroke-linejoin="round"/><path d="${d}" fill="${fill}"/>`);
}
icon('ic_plus', '<path d="M32 14 V50 M14 32 H50"/>');
icon('ic_check', '<path d="M14 34 L27 47 L51 19"/>');
icon('ic_back', '<path d="M40 14 L20 32 L40 50"/>');
icon('ic_arrow', '<path d="M24 14 L44 32 L24 50"/>');
icon('ic_music', '<path d="M24 46 V16 L48 11 V40"/><circle cx="18" cy="46" r="6"/><circle cx="42" cy="41" r="6"/>');
icon('ic_sound', '<path d="M12 26 H22 L34 16 V48 L22 38 H12 Z"/><path d="M42 24 Q48 32 42 40 M48 18 Q58 32 48 46"/>');
icon('ic_vibrate', '<rect x="22" y="12" width="20" height="40" rx="4"/><path d="M12 22 L8 27 L12 32 L8 37 L12 42 M52 22 L56 27 L52 32 L56 37 L52 42"/>');
icon('ic_globe', '<circle cx="32" cy="32" r="20"/><path d="M12 32 H52 M32 12 Q20 32 32 52 Q44 32 32 12"/>');
icon('ic_timer', '<circle cx="32" cy="36" r="17"/><path d="M32 36 V26 M26 12 H38 M47 20 L50 17"/>');
icon('ic_share', '<circle cx="18" cy="32" r="6"/><circle cx="46" cy="17" r="6"/><circle cx="46" cy="47" r="6"/><path d="M23 29 L41 20 M23 35 L41 44"/>');
icon('ic_info', '<circle cx="32" cy="32" r="20"/><path d="M32 30 V44 M32 21 V21.5"/>');
icon('ic_retry', '<path d="M46 22 A18 18 0 1 0 50 36"/><path d="M48 12 V24 H36"/>');
icon('ic_home', '<path d="M12 32 L32 14 L52 32"/><path d="M18 28 V50 H46 V28"/><path d="M28 50 V38 H36 V50"/>');
solidIcon('ic_gear', 'M28 6 h8 l2 8 a19 19 0 0 1 6 3 l7-4 6 6-4 7 a19 19 0 0 1 3 6 l8 2 v8 l-8 2 a19 19 0 0 1-3 6 l4 7-6 6-7-4 a19 19 0 0 1-6 3 l-2 8 h-8 l-2-8 a19 19 0 0 1-6-3 l-7 4-6-6 4-7 a19 19 0 0 1-3-6 l-8-2 v-8 l8-2 a19 19 0 0 1 3-6 l-4-7 6-6 7 4 a19 19 0 0 1 6-3 Z M32 23 a9 9 0 1 0 0.01 0 Z');
{
  // 视频（广告）图标：彩色小胶片
  const body = `${rr(6, 14, 52, 38, 8, `fill="#fff" stroke="${C.navy}" stroke-width="5"`)}
    ${rr(6, 14, 52, 9, 4, `fill="#FF5A4E" stroke="${C.navy}" stroke-width="4"`)}
    <path d="M27 30 L42 38 L27 46 Z" fill="#FF5A4E" stroke="${C.navy}" stroke-width="3.5" stroke-linejoin="round"/>`;
  part('ic_video', 64, 64, body);
}
{
  // 红点
  const [g, d] = rad([[0, '#FF8A80'], [1, '#E2231A']], 0.4, 0.35, 0.65);
  part('dot_red', 32, 32, `<defs>${d}</defs><circle cx="16" cy="16" r="13" fill="url(#${g})" stroke="#fff" stroke-width="3.5"/>`);
}
{
  // 小锁（灰锁、未开放入口用）
  const [g, d] = lin([[0, '#FFE27A'], [1, '#E09A10']]);
  part('ic_lock', 64, 64, `<defs>${d}</defs><path d="M20 30 V22 a12 12 0 0 1 24 0 V30" fill="none" stroke="${C.navy}" stroke-width="11"/><path d="M20 30 V22 a12 12 0 0 1 24 0 V30" fill="none" stroke="#C9D4E2" stroke-width="6"/>${rr(12, 28, 40, 30, 8, `fill="url(#${g})" stroke="${C.navy}" stroke-width="4"`)}<circle cx="32" cy="41" r="4.5" fill="${C.navy}"/><rect x="30" y="42" width="4" height="9" rx="2" fill="${C.navy}"/>`);
}
{
  // 名次奖牌 1/2/3
  for (const [n, col] of [[1, ['#FFE36B', '#F2A70C']], [2, ['#F0F4FA', '#A9B7C9']], [3, ['#FFC48A', '#C9742A']]]) {
    const [g, d] = rad([[0, col[0]], [1, col[1]]], 0.4, 0.35, 0.7);
    part(`medal_${n}`, 72, 72, `<defs>${d}</defs><path d="M22 4 L32 26 L42 4" fill="#2F7BFF" stroke="${C.navy}" stroke-width="3"/><circle cx="36" cy="44" r="24" fill="url(#${g})" stroke="${C.navy}" stroke-width="4"/><circle cx="36" cy="44" r="16" fill="none" stroke="#fff" stroke-width="3" opacity="0.6"/>`);
  }
}

// ---------------------------------------------------------------- 横幅（通关、失败）
function ribbon(name, col) {
  const w = 640;
  const h = 200;
  const [g, d] = lin([[0, col[0]], [0.45, col[1]], [1, col[2]]]);
  const [gt, dt] = lin([[0, col[2]], [1, col[3]]]);
  const [gs, ds] = lin([[0, '#fff', 0.85], [1, '#fff', 0]]);
  const body = `<defs>${d}${dt}${ds}</defs>
    <path d="M8 96 L112 84 L112 178 L8 190 L48 142 Z" fill="url(#${gt})" stroke="${C.navy}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M632 96 L528 84 L528 178 L632 190 L592 142 Z" fill="url(#${gt})" stroke="${C.navy}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M84 150 L112 178 L112 150 Z" fill="${col[3]}" stroke="${C.navy}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M556 150 L528 178 L528 150 Z" fill="${col[3]}" stroke="${C.navy}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M70 56 Q320 4 570 56 L570 158 Q320 108 70 158 Z" fill="${C.navy}" transform="translate(0 6)"/>
    <path d="M70 56 Q320 4 570 56 L570 158 Q320 108 70 158 Z" fill="url(#${g})" stroke="${C.navy}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M92 68 Q320 22 548 68 L548 86 Q320 42 92 86 Z" fill="url(#${gs})"/>
    <path d="M80 148 Q320 100 560 148" stroke="#fff" stroke-width="3" fill="none" opacity="0.35"/>`;
  part(name, w, h, body);
}
ribbon('ribbon_blue', ['#7FD0FF', '#2D86F5', '#1550C8', '#0B3792']);
ribbon('ribbon_gray', ['#C8D2DE', '#8C9AAD', '#64748A', '#46526A']);

// ---------------------------------------------------------------- 收藏卡框（五档稀有度）
for (const [k, [hi, mid, low]] of Object.entries(RARITY)) {
  const w = 200;
  const h = 280;
  const [g, d] = lin([[0, hi], [0.5, mid], [1, low]], 0, 0, 1, 1);
  const [gi, di] = lin([[0, '#FFFFFF'], [1, '#DDF4FF']]);
  const gem = k === 'legend' || k === 'epic' ? `<path d="M100 250 L114 264 L100 278 L86 264 Z" fill="#fff" stroke="${low}" stroke-width="3"/>` : '';
  const body = `<defs>${d}${di}</defs>
    ${rr(3, 7, w - 6, h - 9, 22, `fill="${C.navy}"`)}
    ${rr(3, 3, w - 6, h - 9, 22, `fill="url(#${g})" stroke="${C.navy}" stroke-width="4"`)}
    ${rr(14, 14, w - 28, h - 64, 14, `fill="url(#${gi})" stroke="${low}" stroke-width="3"`)}
    ${rr(20, 18, w - 40, 22, 11, `fill="#fff" opacity="0.6"`)}${gem}`;
  part(`card_${k}`, w, h, body);
}
part('card_slot', 200, 280, rr(4, 4, 192, 272, 22, `fill="#0A2A70" fill-opacity="0.35" stroke="#7FB8FF" stroke-width="4" stroke-dasharray="14 10"`));

// ---------------------------------------------------------------- 选关节点
function lvNode(name, col, ring) {
  const s = 132;
  const [g, d] = rad([[0, col[0]], [0.6, col[1]], [1, col[2]]], 0.4, 0.32, 0.7);
  const body = `<defs>${d}</defs>
    <ellipse cx="66" cy="112" rx="50" ry="14" fill="#000" opacity="0.18"/>
    <circle cx="66" cy="66" r="54" fill="${col[3]}"/>
    <circle cx="66" cy="60" r="54" fill="url(#${g})" stroke="${ring}" stroke-width="6"/>
    <ellipse cx="66" cy="34" rx="30" ry="12" fill="#fff" opacity="0.45"/>`;
  part(name, s, s, body);
}
lvNode('node_done', BTN.blue, '#fff');
lvNode('node_current', BTN.green, '#FFF59A');
lvNode('node_locked', BTN.gray, '#E6ECF3');
lvNode('node_challenge', BTN.purple, '#FFD95A');
lvNode('node_challenge_done', ['#E8B8FF', '#B26AF5', '#7A2FD0', '#4E1897'], '#FFD95A');
// 选关路线：一个周期 4 关、每关 200 高、左右摆 150；上下首尾相接（节点位置见 pages/levels.ts）
{
  const W = 420;
  const H = 800;
  const A = 150;
  const pts = [];
  for (let y = -40; y <= H + 40; y += 4) pts.push(`${(W / 2 - A * Math.sin((2 * Math.PI * y) / H)).toFixed(2)} ${y}`);
  const d = `M${pts.join(' L')}`;
  part(
    'path_wave',
    W,
    H,
    `<path d="${d}" fill="none" stroke="#1F7FD0" stroke-opacity="0.28" stroke-width="78"/>` +
      `<path d="${d}" fill="none" stroke="#BDF0FF" stroke-opacity="0.75" stroke-width="62"/>` +
      `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="22"/>`,
  );
}
part('path_dot', 24, 24, `<circle cx="12" cy="12" r="9" fill="#fff" stroke="#2F6BD8" stroke-width="3" opacity="0.9"/>`);
{
  const [g, d] = lin([[0, '#FFB24A'], [1, '#E86A0C']]);
  part('flag', 64, 72, `<defs>${d}</defs><path d="M14 6 V68" stroke="${C.navy}" stroke-width="7" stroke-linecap="round"/><path d="M14 6 V68" stroke="#E6ECF3" stroke-width="3" stroke-linecap="round"/><path d="M16 8 L58 18 L16 34 Z" fill="url(#${g})" stroke="${C.navy}" stroke-width="4" stroke-linejoin="round"/>`);
}

// ---------------------------------------------------------------- 收藏册封面（一册一个海域，颜色各不同；鱼由代码叠上去）
function book(name, col) {
  const [g, d] = lin([[0, col[0]], [1, col[1]]], 0, 0, 1, 1);
  const [gw, dw] = lin([[0, '#FFFFFF', 0.55], [1, '#FFFFFF', 0.12]]);
  const rings = [36, 76, 116]
    .map((y) => `<rect x="4" y="${y}" width="26" height="14" rx="7" fill="#FFD23F" stroke="#B8770A" stroke-width="3"/>`)
    .join('');
  part(
    name,
    150,
    160,
    `<defs>${d}${dw}</defs>
    <rect x="22" y="12" width="122" height="144" rx="16" fill="#000" opacity="0.2"/>
    <rect x="16" y="6" width="124" height="144" rx="16" fill="${col[2]}"/>
    <rect x="16" y="4" width="124" height="138" rx="16" fill="url(#${g})" stroke="${col[2]}" stroke-width="4"/>
    <rect x="32" y="18" width="94" height="110" rx="12" fill="url(#${gw})" stroke="#FFFFFF" stroke-opacity="0.7" stroke-width="3"/>
    ${rings}`,
  );
}
book('book_1', ['#5FD3FF', '#2A86E8', '#165AB0']);
book('book_2', ['#FF9BD0', '#E0479A', '#9C1F66']);
book('book_3', ['#8EE86A', '#33A83A', '#1D6E25']);
book('book_4', ['#FFC07A', '#D9772A', '#8F4512']);
book('book_5', ['#D6A8FF', '#8E4DE8', '#5A23A6']);
book('book_6', ['#FFE680', '#E8B020', '#9A6C05']);

// ---------------------------------------------------------------- 新手引导的手指（食指在左边缘竖起，指尖在上；另外三指蜷着）
{
  const [g, d] = lin([[0, '#FFFFFF'], [1, '#DCE8F6']]);
  const shape = (fill, stroke, dy) => `<g transform="translate(0 ${dy})" fill="${fill}" stroke="${stroke}" stroke-width="5" stroke-linejoin="round">
      <path d="M22 60 L22 16 Q22 4 33 4 Q44 4 44 16 L44 56 Q48 46 58 46 Q66 46 68 54 Q72 46 80 46 Q88 46 90 56 Q98 52 102 62 L102 90 Q102 118 76 118 L50 118 Q28 118 22 98 Z"/>
      <path d="M22 70 Q10 66 8 78 Q8 88 24 96" />
    </g>`;
  part(
    'finger',
    112,
    126,
    `<defs>${d}</defs>${shape('#0A2B7A', '#0A2B7A', 5)}${shape(`url(#${g})`, C.navy, 0)}
    <path d="M58 48 Q56 60 60 70 M80 48 Q78 60 82 70" fill="none" stroke="${C.navy}" stroke-width="4" stroke-linecap="round"/>
    <ellipse cx="33" cy="16" rx="6" ry="4" fill="#fff"/>`,
  );
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
  part('confetti', 16, 24, rr(0, 0, 16, 24, 3, 'fill="#fff"'));
  part('white', 8, 8, rr(0, 0, 8, 8, 0, 'fill="#fff"'), [3, 3, 3, 3]);
  part('round_white', 64, 64, rr(0, 0, 64, 64, 22, 'fill="#fff"'), [24, 24, 24, 24]);
  part('circle_white', 64, 64, '<circle cx="32" cy="32" r="31" fill="#fff"/>');
  const [gv, dv] = lin([[0, '#000', 0], [1, '#000', 1]]);
  part('fade_down', 8, 64, `<defs>${dv}</defs><rect width="8" height="64" fill="url(#${gv})"/>`);
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
