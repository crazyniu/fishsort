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

// ---------------------------------------------------------------- 设计规范（docs/03 第 2 节「厚果冻」+ docs/09 第 11 节）
// 实色、上浅下深的柔和渐变，内部下沿一圈深色厚度，顶部一层很淡的柔光；没有硬高光条、没有白描边。
// 不用胶囊：按钮圆角 22，卡片 / 弹窗 32 / 24，小标签 12。颜色按语义固定。
const T = {
  ink: '#13284F',
  surface: '#F3F9FF',
  line: '#CFE6FA',
  blue: '#1B6FD1',
  deep: '#0E3B8C',
  shade: '#0A2560',
};
// 按钮：面上色、面下色、厚度色、柔光强度
const FACE = {
  green: ['#7BE04A', '#3DB923', '#22831A', 0.35],
  blue: ['#5DB4FF', '#2378EE', '#1650B8', 0.35],
  yellow: ['#FFDB5C', '#FFB01F', '#C97800', 0.45],
  red: ['#FF8A70', '#F0503C', '#B3301F', 0.35],
  gray: ['#D9E1EA', '#B9C5D3', '#8794A6', 0.4],
};
const LEDGE = 8;
const SINK = 5;

/** 厚果冻按钮：整块是厚度色，面在上面、下沿露出 LEDGE 的厚度；down = 按下（面下沉 SINK） */
function faceBody(col, w, h, down, r = 22) {
  const [top, bot, ledge, glow] = col;
  const fh = h - LEDGE;
  const oy = down ? SINK : 0;
  const [g, d] = lin([[0, top], [1, bot]]);
  const [gl, dl] = lin([[0, '#fff', glow], [0.45, '#fff', 0]]);
  const [gb, db] = lin([[0, ledge, 0], [1, ledge, 0.35]]);
  return `<defs>${d}${dl}${db}</defs>
    ${rr(0, 0, w, h, r, `fill="${ledge}"`)}
    ${rr(0, oy, w, fh, r, `fill="url(#${g})"`)}
    ${rr(0, oy, w, fh, r, `fill="url(#${gb})"`)}
    ${rr(4, oy + 3, w - 8, fh * 0.6, r - 4, `fill="url(#${gl})"`)}`;
}
for (const [k, col] of Object.entries(FACE)) {
  part(`btn_${k}`, 132, 120, faceBody(col, 132, 120, false), [28, 34, 28, 28]);
  part(`btn_${k}_down`, 132, 120, faceBody(col, 132, 120, true), [28, 34, 28, 28]);
}
// 图标键：同一种厚果冻，正方形圆角 22
// round_blue 是白色果冻键（彩色图标放在白底上才看得清）
for (const [name, col] of [['round_blue', ['#FFFFFF', '#DDEEFF', '#7FAFE6', 0.6]], ['round_green', FACE.green], ['round_red', FACE.red]]) {
  part(name, 96, 96, faceBody(col, 96, 96, false));
  part(`${name}_down`, 96, 96, faceBody(col, 96, 96, true));
}

// ---------------------------------------------------------------- 弹窗：宝蓝厚框（内部下沿有厚度）+ 浅色内容区
/** top = 顶部框的厚度（有标题时放标题） */
function popupFrame(name, top) {
  const w = 300;
  const h = 300 + top;
  const side = 16;
  const [gf, df] = lin([[0, '#5BB0FF'], [0.25, '#2C84F0'], [1, '#1B62D2']]);
  const [gl, dl] = lin([[0, '#fff', 0.35], [1, '#fff', 0]]);
  const [gi, di] = lin([[0, '#E3F0FC'], [0.08, T.surface], [1, '#FFFFFF']]);
  const body = `<defs>${df}${dl}${di}</defs>
    ${rr(0, 8, w, h - 8, 32, `fill="${T.shade}" fill-opacity="0.35"`)}
    ${rr(0, 0, w, h - 4, 32, 'fill="#154BB0"')}
    ${rr(0, 0, w, h - 14, 32, `fill="url(#${gf})"`)}
    ${rr(6, 4, w - 12, Math.min(top, 60), 26, `fill="url(#${gl})"`)}
    ${rr(side, top, w - side * 2, h - top - side - 12, 20, `fill="url(#${gi})" stroke="#1450B4" stroke-opacity="0.35" stroke-width="2"`)}`;
  part(name, w, h, body, [top + 24, side + 34, side + 24, side + 24]);
}
popupFrame('panel', 96);
popupFrame('panel_plain', 16);
// 关闭键：右上角红色圆角方块 + 白叉（深色描边）
{
  const s = 80;
  const x = `<path d="M28 26 L52 50 M52 26 L28 50" stroke-linecap="round"`;
  part('close', s, s, `${faceBody(FACE.red, s, s, false, 20)}${x} stroke="#8A1F12" stroke-width="13"/>${x} stroke="#fff" stroke-width="8"/>`);
}
part('popup_head', 64, 96, rr(0, 0, 64, 96, 0, 'fill="#fff" fill-opacity="0"'), [0, 0, 8, 8]);

// ---------------------------------------------------------------- 卡片
/** 浅色卡片（页面上的商店卡、排行自己那行）：白面 + 下沿浅蓝厚度 + 顶部柔光 */
function lightCard(name, w, h, r) {
  const [g, d] = lin([[0, '#FFFFFF'], [1, '#EAF4FE']]);
  const body = `<defs>${d}</defs>
    ${rr(0, 4, w, h - 4, r, `fill="${T.shade}" fill-opacity="0.25"`)}
    ${rr(0, 0, w, h - 4, r, 'fill="#BCD6F0"')}
    ${rr(0, 0, w, h - 10, r, `fill="url(#${g})"`)}`;
  part(name, w, h, body, [r + 8, r + 16, r + 8, r + 8]);
}
lightCard('panel_glass', 200, 200, 24);
/** 深色半透明卡片（压在背景图上：主页入口、技能键、排行行）：上沿一道淡亮边，下沿深一点 */
function darkCard(name, w, h, r, a = 0.55) {
  const [g, d] = lin([[0, '#3C9BFF', a], [1, '#1A62D6', a + 0.1]]);
  const [gs, ds] = lin([[0, '#fff', 0.75], [0.25, '#fff', 0.3], [1, '#fff', 0.2]]);
  const body = `<defs>${d}${ds}</defs>
    ${rr(1, 1, w - 2, h - 2, r, `fill="url(#${g})" stroke="url(#${gs})" stroke-width="2"`)}`;
  part(name, w, h, body, [r + 6, r + 6, r + 6, r + 6]);
}
darkCard('panel_blue', 200, 200, 24, 0.62);
darkCard('row_blue', 120, 120, 16, 0.7);
darkCard('title_plate', 80, 64, 16, 0.8);
darkCard('capsule', 80, 64, 16, 0.8);
part('title_page', 64, 64, rr(0, 0, 64, 64, 12, 'fill="#fff" fill-opacity="0"'), [16, 16, 16, 16]);
// 弹窗里的一行：白面 + 下沿浅蓝厚度
{
  const [g, d] = lin([[0, '#FFFFFF'], [1, '#F2F8FF']]);
  part('row', 120, 100, `<defs>${d}</defs>${rr(0, 0, 120, 100, 18, 'fill="#C7DCF2"')}${rr(0, 0, 120, 95, 18, `fill="url(#${g})"`)}`, [22, 26, 22, 22]);
}
// 今天可领的格子（签到）：琥珀厚果冻
part('cell_gold', 120, 120, faceBody(FACE.yellow, 120, 120, false, 20), [26, 34, 26, 26]);
// 小标签（「挑战」「新」、技能数量）
part('tag_red', 80, 48, faceBody(FACE.red, 80, 48, false, 12), [0, 0, 16, 16]);
part('tag_amber', 80, 48, faceBody(FACE.yellow, 80, 48, false, 12), [0, 0, 16, 16]);
// 页面背景：深海蓝竖向渐变，拉伸到全屏
{
  const [g, d] = lin([[0, '#5CCBFF'], [0.45, '#2E95F2'], [1, '#1E6CDB']]);
  part('bg_page', 8, 400, `<defs>${d}</defs><rect width="8" height="400" fill="url(#${g})"/>`);
}

// ---------------------------------------------------------------- 底栏：宝蓝厚果冻长条，选中格是亮青厚果冻
{
  const w = 200;
  const h = 150;
  const [g, d] = lin([[0, '#3D93F5'], [1, '#1A5BCB']]);
  const [gl, dl] = lin([[0, '#fff', 0.3], [1, '#fff', 0]]);
  const body = `<defs>${d}${dl}</defs>
    ${rr(0, 0, w, h, 32, 'fill="#123F9E"')}
    ${rr(0, 0, w, h - 8, 32, `fill="url(#${g})"`)}
    ${rr(6, 3, w - 12, 30, 24, `fill="url(#${gl})"`)}`;
  part('tabbar', w, h, body, [40, 40, 40, 40]);
  part('tab_sel', 132, 132, faceBody(['#8FE6FF', '#3CB6F5', '#1B7FC8', 0.45], 132, 132, false, 24), [30, 36, 30, 30]);
  part('tab_divider', 4, 80, rr(0, 0, 4, 80, 2, 'fill="#0B2A73" fill-opacity="0.3"'));
}

// ---------------------------------------------------------------- 开关、分段、进度条
function toggle(name, on) {
  const w = 108;
  const h = 64;
  const kx = on ? w - 32 : 32;
  const [g, d] = lin([[0, on ? '#2E9E1C' : '#9AA7B8'], [1, on ? '#4CC42E' : '#C2CCD8']]);
  const body = `<defs>${d}</defs>
    ${rr(0, 0, w, h, 32, `fill="url(#${g})"`)}
    <circle cx="${kx}" cy="${h / 2 + 3}" r="25" fill="${T.shade}" opacity="0.25"/>
    <circle cx="${kx}" cy="${h / 2}" r="25" fill="#E3ECF5"/>
    <circle cx="${kx}" cy="${h / 2 - 2}" r="23" fill="#fff"/>`;
  part(name, w, h, body);
}
toggle('toggle_on', true);
toggle('toggle_off', false);
{
  const [g, d] = lin([[0, '#C9DCF0'], [1, '#E2EDF9']]);
  part('seg_bg', 100, 64, `<defs>${d}</defs>${rr(0, 0, 100, 64, 16, `fill="url(#${g})"`)}`, [0, 0, 18, 18]);
  part('seg_on', 100, 64, faceBody(FACE.blue, 92, 56, false, 12).replace('<defs>', '<g transform="translate(4 4)"><defs>') + '</g>', [0, 0, 18, 18]);
}
{
  const w = 80;
  const h = 28;
  part('bar_track', w, h, `${rr(0, 0, w, h, 12, 'fill="#061C52" fill-opacity="0.55"')}${rr(0, h - 3, w, 3, 1.5, 'fill="#fff" fill-opacity="0.15"')}`, [0, 0, 14, 14]);
  for (const [k, c] of [['green', FACE.green], ['yellow', FACE.yellow], ['blue', FACE.blue], ['purple', ['#C79BFF', '#8E5BD9', '#5E2FA8', 0.4]]]) {
    const [g, d] = lin([[0, c[0]], [1, c[1]]]);
    part(`bar_${k}`, w, h, `<defs>${d}</defs>${rr(0, 0, w, h, 12, `fill="${c[2]}"`)}${rr(0, 0, w, h - 4, 12, `fill="url(#${g})"`)}${rr(6, 3, w - 12, 6, 3, 'fill="#fff" opacity="0.35"')}`, [0, 0, 14, 14]);
  }
}

// ---------------------------------------------------------------- 局内：暂存格、鱼缸托盘、鱼缸、气泡
{
  // 暂存格：深色半透明圆角 16，细白边；满格前一格变红
  const w = 120;
  const h = 96;
  const [gs, ds] = lin([[0, '#1D6FD8', 0.42], [1, '#5FBFFF', 0.3]]);
  part('slot', w, h, `<defs>${ds}</defs>${rr(1.5, 1.5, w - 3, h - 3, 16, `fill="url(#${gs})" stroke="#fff" stroke-opacity="0.7" stroke-width="3"`)}`, [20, 20, 20, 20]);
  part('slot_warn', w, h, rr(1.5, 1.5, w - 3, h - 3, 16, 'fill="#FF4D4F" fill-opacity="0.22" stroke="#FF4D4F" stroke-width="3"'), [20, 20, 20, 20]);
}
{
  // 鱼缸下的托盘：一条浅色半透明的台面（不再是木架）
  const w = 200;
  const h = 44;
  const [g, d] = lin([[0, '#fff', 0.5], [1, '#fff', 0.18]]);
  part('shelf', w, h, `<defs>${d}</defs>${rr(0, 6, w, h - 6, 12, `fill="${T.shade}" fill-opacity="0.25"`)}${rr(0, 2, w, h - 8, 12, `fill="url(#${g})" stroke="#fff" stroke-opacity="0.5" stroke-width="2"`)}`, [0, 0, 16, 16]);
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

// ---------------------------------------------------------------- 图标
// kit/ic_*（设置、音乐、音效、振动、语言、分享、视频、锁、返回、主页、重试、叉、加号、勾、说明、计时）
// 是 Codex 出的位图（art/raw/ui_icons，tools/art/slice.py 切成 192×192），不在这里画。
{
  // 红点
  const [g, d] = rad([[0, '#FF8A80'], [1, '#E2231A']], 0.4, 0.35, 0.65);
  part('dot_red', 32, 32, `<defs>${d}</defs><circle cx="16" cy="16" r="13.5" fill="url(#${g})" stroke="#fff" stroke-width="3"/>`);
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
