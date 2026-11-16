// 界面搭建的基础件：节点、图片、九宫格、文字、按钮。界面全部由代码生成（docs/09 第 8 节）。
// 图片都是 3 倍图：显示尺寸 = 图片像素 / RES。九宫格的皮放在缩小 1/RES 的子节点上，角的粗细才对。
import {
  BlockInputEvents,
  Color,
  EventTouch,
  HorizontalTextAlignment,
  Label,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  Tween,
  UIOpacity,
  UITransform,
  Vec2,
  Vec3,
  VerticalTextAlignment,
  tween,
} from 'cc';
import { frame, frameAsync, uiFont } from './res';

export const RES = 3;

export const COLOR = {
  white: new Color(255, 255, 255, 255),
  navy: new Color(11, 42, 115, 255),
  ink: new Color(18, 52, 120, 255),
  dim: new Color(0, 18, 60, 160),
  yellow: new Color(255, 214, 64, 255),
  red: new Color(255, 76, 64, 255),
  green: new Color(100, 230, 60, 255),
  gray: new Color(150, 162, 180, 255),
  shadow: new Color(0, 20, 70, 140),
};

// ---------------------------------------------------------------- 面的「墨色」
// 设计规范（docs/09 第 11 节）：浅色卡片上用深藏青字、蓝色图标，深色底上白字；按钮各有自己的字色。
// 部件建出来时登记在节点上，文字、图标按最近的祖先自动取色，页面代码不用分别写。

export interface Ink {
  /** 正文色（代码里写 COLOR.white 或不写颜色时用它） */
  text: Color;
  /** 强调色（代码里写 COLOR.yellow 时用它；浅底上黄字看不清，换成深琥珀） */
  accent: Color;
  /** kit/ic_* 图标的染色；null = 保持原色（白图形深描边） */
  glyph: Color | null;
  /** 文字描边色（docs/03：白字加深色描边，浅色面上深色字不描边）；null = 不描边 */
  outline: Color | null;
}

export const INK = {
  ink: hex('#13284F'),
  sub: hex('#5B7090'),
  blue: hex('#1B6FD1'),
  amber: hex('#D98200'),
};

const ON_DARK: Ink = { text: COLOR.white, accent: COLOR.yellow, glyph: null, outline: COLOR.navy };
const ON_LIGHT: Ink = { text: INK.ink, accent: INK.amber, glyph: hex('#4C8EE8'), outline: null };
const btnInk = (o: string): Ink => ({ text: COLOR.white, accent: COLOR.white, glyph: null, outline: hex(o) });
const ON_GREEN = btnInk('#1E6B12');
const ON_BLUE = btnInk('#0F3F96');
const ON_AMBER = btnInk('#8A4F00');
const ON_RED = btnInk('#8A1F12');
const ON_GRAY = btnInk('#6E7B8D');

/** 部件 → 上面放的字用什么颜色 */
const PART_INK: Record<string, Ink> = {
  'kit/panel': ON_LIGHT,
  'kit/panel_plain': ON_LIGHT,
  'kit/panel_glass': ON_LIGHT,
  'kit/row': ON_LIGHT,
  'kit/seg_bg': ON_LIGHT,
  'kit/tabbar': ON_DARK,
  'kit/panel_blue': ON_DARK,
  'kit/row_blue': ON_DARK,
  'kit/title_plate': ON_DARK,
  'kit/title_page': ON_DARK,
  'kit/capsule': ON_DARK,
  'kit/popup_head': ON_DARK,
  'kit/cell_gold': ON_AMBER,
  'kit/tag_red': ON_RED,
  'kit/tag_amber': ON_AMBER,
  'kit/btn_green': ON_GREEN,
  'kit/btn_red': ON_RED,
  'kit/btn_blue': ON_BLUE,
  'kit/btn_yellow': ON_AMBER,
  'kit/btn_gray': ON_GRAY,
  'kit/round_green': ON_GREEN,
  'kit/round_red': ON_RED,
  'kit/round_blue': ON_BLUE,
};

const inks = new WeakMap<Node, Ink>();
/** 单色图标节点（跟着面染色） */
const glyphs = new WeakSet<Node>();

export function setInk(n: Node, ink: Ink): void {
  inks.set(n, ink);
}

/** 最近的登记过的祖先决定墨色；都没有 = 深色底 */
export function inkOf(n: Node | null): Ink {
  for (let p = n; p; p = p.parent) {
    const k = inks.get(p);
    if (k) return k;
  }
  return ON_DARK;
}

export const LIGHT_INK = ON_LIGHT;

/** 千分位：100449 → 100,449 */
export function fmt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function hex(s: string, a = 255): Color {
  const n = parseInt(s.replace('#', ''), 16);
  return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, a);
}

/** 空节点。w、h 是设计单位 */
export function box(name: string, parent: Node | null = null, w = 0, h = 0): Node {
  const n = new Node(name);
  n.layer = Layers.Enum.UI_2D;
  n.addComponent(UITransform).setContentSize(w, h);
  if (parent) parent.addChild(n);
  return n;
}

export function size(n: Node, w: number, h: number): Node {
  (n.getComponent(UITransform) as UITransform).setContentSize(w, h);
  return n;
}

export function sizeOf(n: Node): { w: number; h: number } {
  const t = n.getComponent(UITransform) as UITransform;
  return { w: t.width, h: t.height };
}

export function at(n: Node, x: number, y: number): Node {
  n.setPosition(x, y, 0);
  return n;
}

/** 普通图片。不给尺寸就按图的显示尺寸；只给宽就按比例 */
export function img(parent: Node | null, path: string, w?: number, h?: number, name = path): Node {
  const n = box(name, parent);
  const sp = n.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  const f = frame(path);
  setFrame(n, f, w, h);
  const k = PART_INK[path];
  if (k) inks.set(n, k);
  if (path.startsWith('kit/ic_') && path !== 'kit/ic_lock') {
    glyphs.add(n);
    const g = inkOf(parent).glyph;
    if (g) sp.color = g;
  }
  return n;
}

export function setFrame(n: Node, f: SpriteFrame | null, w?: number, h?: number): void {
  const sp = n.getComponent(Sprite) as Sprite;
  sp.spriteFrame = f;
  if (!f) return;
  const fw = f.originalSize.width / RES;
  const fh = f.originalSize.height / RES;
  const ww = w ?? (h !== undefined ? (fw * h) / fh : fw);
  const hh = h ?? (w !== undefined ? (fh * w) / fw : fh);
  size(n, ww, hh);
}

export function setImg(n: Node, path: string, w?: number, h?: number): void {
  setFrame(n, frame(path), w, h);
}

/** 大图（背景、家园场景）：先建节点，读到再显示 */
export function lazyImg(parent: Node, path: string, w: number, h?: number): Node {
  const n = box(path, parent, w, h ?? w);
  const sp = n.addComponent(Sprite);
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  void frameAsync(path).then((f) => {
    if (n.isValid && f) {
      sp.spriteFrame = f;
      if (h === undefined) size(n, w, (f.originalSize.height * w) / f.originalSize.width);
    }
  });
  return n;
}

/** 九宫格：外层节点 w×h 管布局和子节点，皮在缩小 1/RES 的子节点上 */
export function slice(parent: Node | null, path: string, w: number, h: number, name = path): Node {
  const n = box(name, parent, w, h);
  const skin = box('skin', n, w * RES, h * RES);
  skin.setScale(1 / RES, 1 / RES, 1);
  const sp = skin.addComponent(Sprite);
  sp.type = Sprite.Type.SLICED;
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.spriteFrame = frame(path);
  size(skin, w * RES, h * RES);
  const k = PART_INK[path];
  if (k) inks.set(n, k);
  return n;
}

export function resizeSlice(n: Node, w: number, h: number): void {
  size(n, w, h);
  const skin = n.getChildByName('skin');
  if (skin) size(skin, w * RES, h * RES);
}

export function setSlice(n: Node, path: string): void {
  const skin = n.getChildByName('skin');
  const sp = skin?.getComponent(Sprite);
  if (sp) sp.spriteFrame = frame(path);
}

/** 纯色块（遮罩、压暗）：用白图染色，不是界面部件 */
export function tint(parent: Node, w: number, h: number, c: Color, name = 'tint'): Node {
  const n = img(parent, 'kit/white', w, h, name);
  (n.getComponent(Sprite) as Sprite).color = c;
  return n;
}

export interface TextOpts {
  color?: Color;
  /** 描边颜色；null = 不描边 */
  outline?: Color | null;
  outlineWidth?: number;
  shadow?: boolean;
  align?: 'left' | 'center' | 'right';
  /** 给了宽就自动换行 */
  width?: number;
  lineHeight?: number;
  bold?: boolean;
}

/**
 * 文字（docs/03 第 2 节）：颜色、描边按所在的面自动取——深色底与按钮上白字加深色描边，浅色卡片上深藏青字不描边；
 * 写 COLOR.white / COLOR.yellow 也按面换成对应的正文色 / 强调色；outline: null 强制不描边
 */
export function text(parent: Node | null, s: string, fontSize: number, o: TextOpts = {}): Label {
  const n = box('text', parent);
  const l = n.addComponent(Label);
  const font = uiFont();
  if (font) {
    l.useSystemFont = false;
    l.font = font;
  } else {
    l.isBold = true;
  }
  l.fontSize = fontSize;
  l.lineHeight = o.lineHeight ?? Math.round(fontSize * 1.25);
  const ink = inkOf(parent);
  l.color = inkColor(ink, o.color);
  const outline = o.outline === undefined ? ink.outline : o.outline;
  if (outline) {
    l.enableOutline = true;
    l.outlineColor = outline;
    l.outlineWidth = o.outlineWidth ?? Math.max(2, Math.round(fontSize / 11));
  }
  if (o.shadow) {
    l.enableShadow = true;
    l.shadowColor = COLOR.shadow;
    l.shadowOffset.set(0, -Math.max(1, Math.round(fontSize / 18)));
    l.shadowBlur = 3;
  }
  l.horizontalAlign =
    o.align === 'left' ? HorizontalTextAlignment.LEFT : o.align === 'right' ? HorizontalTextAlignment.RIGHT : HorizontalTextAlignment.CENTER;
  l.verticalAlign = VerticalTextAlignment.CENTER;
  if (o.width !== undefined) {
    l.overflow = Label.Overflow.RESIZE_HEIGHT;
    l.enableWrapText = true;
    size(n, o.width, l.lineHeight);
  }
  if (o.align === 'left') (n.getComponent(UITransform) as UITransform).setAnchorPoint(0, 0.5);
  if (o.align === 'right') (n.getComponent(UITransform) as UITransform).setAnchorPoint(1, 0.5);
  l.string = s;
  return l;
}

function inkColor(ink: Ink, c?: Color): Color {
  if (!c || c.equals(COLOR.white)) return ink.text;
  if (c.equals(COLOR.yellow)) return ink.accent;
  return c;
}

/** 文字、图标按新的面重新取色（按钮换颜色时用） */
export function reink(n: Node): void {
  const ink = inkOf(n);
  const walk = (m: Node) => {
    if (m !== n && inks.has(m)) return;
    const l = m.getComponent(Label);
    if (l) {
      l.color = ink.text;
      l.enableOutline = !!ink.outline;
      if (ink.outline) l.outlineColor = ink.outline;
    }
    const sp = m.getComponent(Sprite);
    if (sp && glyphs.has(m)) sp.color = ink.glyph ?? COLOR.white;
    m.children.forEach(walk);
  };
  n.children.forEach(walk);
}

export function opacity(n: Node): UIOpacity {
  return n.getComponent(UIOpacity) ?? n.addComponent(UIOpacity);
}

export function blockInput(n: Node): void {
  if (!n.getComponent(BlockInputEvents)) n.addComponent(BlockInputEvents);
}

// ---------------------------------------------------------------- 点击

export interface TapOpts {
  /** 按下缩到多少，0 = 不缩 */
  press?: number;
  /** 按下时的音效名；null = 不响 */
  sound?: string | null;
  /** 按下 / 松开时调（按钮换「按下」的皮、字下沉） */
  onPress?: (down: boolean) => void;
}

let onTapSound: (name: string) => void = () => {};
export function setTapSound(f: (name: string) => void): void {
  onTapSound = f;
}

/** 按下到松开移动超过这么多（设计单位）就不算点 */
export const TAP_SLOP = 14;

/** 点击：按下缩 0.95，松手回弹（docs/09 第 6 节）。手指滑出节点再松开不算 */
export function onTap(n: Node, fn: (e: EventTouch) => void, o: TapOpts = {}): void {
  const press = o.press ?? 0.95;
  let base = n.scale.clone();
  let down = false;
  n.on(Node.EventType.TOUCH_START, () => {
    down = true;
    o.onPress?.(true);
    if (press > 0) {
      Tween.stopAllByTarget(n);
      base = base.x === 0 ? new Vec3(1, 1, 1) : base;
      tween(n).to(0.06, { scale: new Vec3(base.x * press, base.y * press, 1) }).start();
    }
  });
  const release = (fire: boolean, e?: EventTouch) => {
    if (!down) return;
    down = false;
    o.onPress?.(false);
    // 手指滑动过（在滚动列表里拖）就不算点
    if (e && Vec2.distance(e.getUILocation(), e.getUIStartLocation()) > TAP_SLOP) fire = false;
    if (press > 0) {
      Tween.stopAllByTarget(n);
      tween(n)
        .to(0.08, { scale: new Vec3(base.x * 1.04, base.y * 1.04, 1) })
        .to(0.08, { scale: base })
        .start();
    }
    if (fire && e) {
      if (o.sound !== null) onTapSound(o.sound ?? 'tap');
      fn(e);
    }
  };
  n.on(Node.EventType.TOUCH_END, (e: EventTouch) => release(true, e));
  n.on(Node.EventType.TOUCH_CANCEL, () => release(false));
}

// ---------------------------------------------------------------- 按钮

/**
 * 按钮颜色按语义固定（docs/09 第 11 节）：green 主行动 · blue 次行动（白底蓝字）· yellow 奖励 / 广告（琥珀）·
 * red 危险 · gray 不可用。一屏只有一个主按钮
 */
export type BtnColor = 'green' | 'blue' | 'yellow' | 'red' | 'gray';

/** 台阶高度与按下的下沉量（和 tools/art/kit.mjs 的 LEDGE、SINK 一致） */
const LEDGE = 8;
const SINK = 5;

export interface BtnOpts {
  color: BtnColor;
  w: number;
  h: number;
  label?: string;
  fontSize?: number;
  /** 文字前的小图标（视频、金币…） */
  icon?: string;
  iconSize?: number;
  onTap?: () => void;
}

export interface Btn {
  node: Node;
  label: Label | null;
  icon: Node | null;
  setLabel(s: string): void;
  setColor(c: BtnColor): void;
  /** 灰掉：还能点（点了给反馈），但看起来不可用 */
  setEnabled(on: boolean): void;
  enabled: boolean;
}

/** 厚果冻按钮（圆角 22，不是胶囊）：下沿一圈深色厚度；按下面下沉、厚度变薄（不缩放） */
export function button(parent: Node | null, o: BtnOpts): Btn {
  const n = slice(parent, `kit/btn_${o.color}`, o.w, o.h, 'button');
  const fs = o.fontSize ?? Math.round(o.h * 0.36);
  let color = o.color;
  let pressed = false;
  const row = box('row', n);
  const place = () => row.setPosition(0, LEDGE / 2 - (pressed ? SINK : 0) + 1, 0);
  place();
  let icon: Node | null = null;
  if (o.icon) {
    const is = o.iconSize ?? Math.round(o.h * 0.5);
    icon = img(row, o.icon, is, is, 'icon');
  }
  const label = o.label !== undefined ? text(row, o.label, fs) : null;
  const layout = () => {
    const gap = 10;
    const ic = icon && icon.active ? icon : null;
    const iw = ic ? sizeOf(ic).w : 0;
    const lw = label ? (label.node.getComponent(UITransform) as UITransform).width : 0;
    const total = iw + (ic && label ? gap : 0) + lw;
    let x = -total / 2;
    if (ic) {
      ic.setPosition(x + iw / 2, 0, 0);
      x += iw + gap;
    }
    if (label) label.node.setPosition(x + lw / 2, 0, 0);
  };
  if (label) label.updateRenderData(true);
  layout();
  const skin = () => {
    const c = b.enabled ? color : 'gray';
    setSlice(n, `kit/btn_${c}${pressed ? '_down' : ''}`);
    const k = PART_INK[`kit/btn_${c}`];
    if (k && inks.get(n) !== k) {
      inks.set(n, k);
      reink(n);
    }
  };
  const b: Btn = {
    node: n,
    label,
    icon,
    enabled: true,
    setLabel(s: string) {
      if (!label) return;
      label.string = s;
      label.updateRenderData(true);
      layout();
    },
    setColor(c: BtnColor) {
      color = c;
      skin();
    },
    setEnabled(on: boolean) {
      b.enabled = on;
      skin();
    },
  };
  const press = (down: boolean) => {
    pressed = down;
    place();
    skin();
  };
  if (o.onTap) {
    const fn = o.onTap;
    onTap(n, () => fn(), { press: 0, onPress: press });
  }
  return b;
}

/** 方形图标按钮（设置、返回）：软方块 + 单色图标，按下下沉 */
export function iconButton(parent: Node, skin: string, glyph: string | null, s: number, fn: () => void): Node {
  const n = img(parent, skin, s, s, 'iconButton');
  let g: Node | null = null;
  if (glyph) g = img(n, glyph, s * 0.5, s * 0.5, 'glyph');
  const k = s / 96;
  const place = (down: boolean) => g?.setPosition(0, (LEDGE / 2 - (down ? SINK : 0)) * k, 0);
  place(false);
  onTap(n, () => fn(), {
    press: 0,
    onPress: (down) => {
      setImg(n, down ? `${skin}_down` : skin, s, s);
      place(down);
    },
  });
  return n;
}

/** 信息条（金币、生命、关卡号）：深色半透明圆角 12，左边图标 + 白色数字 */
export interface Capsule {
  node: Node;
  label: Label;
  icon: Node | null;
  set(s: string): void;
}

export function capsule(parent: Node, w: number, h: number, iconPath: string | null, s: string, fontSize = Math.round(h * 0.5)): Capsule {
  const n = slice(parent, 'kit/capsule', w, h, 'capsule');
  let icon: Node | null = null;
  if (iconPath) {
    icon = img(n, iconPath, h * 0.92, h * 0.92, 'icon');
    icon.setPosition(-w / 2 + h * 0.5, 0, 0);
  }
  // 有图标：数字左对齐紧跟图标；没图标：居中
  const label = text(n, s, fontSize, iconPath ? { align: 'left' } : {});
  label.node.setPosition(iconPath ? -w / 2 + h * 0.96 + 8 : 0, 0, 0);
  return { node: n, label, icon, set: (v: string) => (label.string = v) };
}

// ---------------------------------------------------------------- 进度条

export interface Bar {
  node: Node;
  set(frac: number): void;
}

/** 进度条：底槽 + 从左往右长的填充（填充最短也有一个高度宽，圆头不变形） */
export function progressBar(parent: Node, w: number, h: number, color: 'green' | 'yellow' | 'blue' = 'green'): Bar {
  const track = slice(parent, 'kit/bar_track', w, h, 'bar');
  const fill = slice(track, `kit/bar_${color}`, w, h, 'fill');
  const set = (frac: number) => {
    const f = Math.max(0, Math.min(1, frac));
    fill.active = f > 0;
    const fw = Math.max(h, w * f);
    resizeSlice(fill, fw, h);
    fill.setPosition(-w / 2 + fw / 2, 0, 0);
  };
  set(0);
  return { node: track, set };
}

/** 红点（右上角），可脉动 */
export function redDot(parent: Node, x: number, y: number, s = 30): Node {
  const n = img(parent, 'kit/dot_red', s, s, 'redDot');
  n.setPosition(x, y, 0);
  return n;
}
