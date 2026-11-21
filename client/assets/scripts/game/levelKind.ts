// 三种关卡的标识（docs/01 9.2、docs/ux/level-types.md）：普通关、难关（每 5 关）、超难关（每 20 关）。
// 难度起伏、颜色、图标、奖励都挂在关卡类型上；顶栏、开局横幅、选关页、主页的开始键、结算页都从这里取样式
import { Color, Node } from 'cc';
import * as LevelCurve from '../core/gen/levelCurve';
import * as Meta from '../core/meta/meta';
import { App } from '../services/app';
import { tr } from '../ui/i18n';
import { at, box, COLOR, hex, img, Ink, plate, resizePlate, setInk, text, textWidth } from '../ui/kit';

export type LevelKind = 'normal' | 'hard' | 'boss';

export interface KindStyle {
  /** 小牌子的底（三宫格，tools/art/flat_skin.py 的 f_tag_*）；图标是 Codex 画的（tools/art/obstacles.py 切图） */
  tag: string;
  /** 选关页的圆牌 */
  node: string;
  icon: string;
  /** 顶栏关卡号的描边 */
  outline: Color;
  label: string;
  banner: string;
}

export const KIND_STYLE: Record<'hard' | 'boss', KindStyle> = {
  hard: { tag: 'skin/f_tag_hard', node: 'skin/f_node_orange', icon: 'icon/kind_hard', outline: hex('#B23A0E'), label: 'UI_CHALLENGE_TAG', banner: 'UI_BANNER_HARD' },
  boss: { tag: 'skin/f_tag_boss', node: 'skin/f_node_purple', icon: 'icon/kind_boss', outline: hex('#4C1D95'), label: 'UI_TAG_SUPER', banner: 'UI_BANNER_SUPER' },
};

/** 第 level 关是哪一种（第 360 关以后按循环到的关卡文件算） */
export function levelKind(level: number): LevelKind {
  const file = Meta.levelFile(level, App.config.levelCount);
  if (LevelCurve.isBoss(App.config.curve, file)) return 'boss';
  return LevelCurve.isChallenge(App.config.curve, file) ? 'hard' : 'normal';
}

/** 这一种关过关给几个金币（economy.json：30 / 60 / 90） */
export function kindCoins(kind: LevelKind): number {
  const eco = App.config.eco;
  return kind === 'boss' ? (eco.bossCoins ?? eco.challengeCoins) : kind === 'hard' ? eco.challengeCoins : eco.levelCoins;
}

/** 小牌子：纯色圆头小条，左边白色图标、右边白字；宽度跟着字走 */
/**
 * 牌子上的字：白字不描边，下面压一道这一种关的深色（和平面按钮同一种做法）。原来没登记墨色，字取了外面的颜色——
 * 结算页的浅色奖励条上是深紫字压在橙色牌子上，看不清（用户 2026-11-21）
 */
function tagInk(kind: 'hard' | 'boss'): Ink {
  return { text: COLOR.white, accent: COLOR.white, glyph: null, outline: null, depth: KIND_STYLE[kind].outline };
}

export function kindTag(parent: Node, kind: 'hard' | 'boss', h = 40, name = 'kindTag'): Node {
  const st = KIND_STYLE[kind];
  const n = plate(parent, st.tag, h * 3, h, name);
  setInk(n, tagInk(kind));
  const fs = Math.round(h * 0.55);
  const label = text(n, tr(st.label), fs, { align: 'left', outline: null });
  const ic = h * 0.82;
  const pad = h * 0.32;
  const w = Math.ceil(pad + ic + 6 + textWidth(label) + pad * 1.2);
  resizePlate(n, w, h);
  at(img(n, st.icon, ic, ic, 'icon'), -w / 2 + pad + ic / 2, 0);
  at(label.node, -w / 2 + pad + ic + 6, 1);
  return n;
}

/** 开局横幅：大图标 + 「困难关卡！」+ 一行「过关 60 金币」，同色的长条 */
export function kindBanner(parent: Node, kind: 'hard' | 'boss'): Node {
  const st = KIND_STYLE[kind];
  const n = box('kindBanner', parent, 640, 150);
  const bar = plate(n, st.tag, 640, 150, 'bar');
  setInk(bar, tagInk(kind));
  const title = text(bar, tr(st.banner), 48, { align: 'left', outline: null });
  const sub = text(bar, tr('UI_BANNER_COINS', kindCoins(kind)), 26, { align: 'left', outline: null });
  const w = Math.max(520, Math.ceil(64 + 20 + Math.max(textWidth(title), textWidth(sub)) + 96));
  resizePlate(bar, w, 150);
  const left = -w / 2 + 48;
  at(img(bar, st.icon, 64, 64, 'icon'), left + 32, 0);
  at(title.node, left + 64 + 20, 20);
  at(sub.node, left + 64 + 20, -34);
  return n;
}
