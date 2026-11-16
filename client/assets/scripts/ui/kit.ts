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
  ink: new Color(31, 86, 176, 255),
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
  /** kit/ic_* 图标的染色；null = 保持原色（图标是 Codex 出的彩色图，目前都不染） */
  glyph: Color | null;
  /** 文字描边色（docs/03：白字加深色描边，浅色面上深色字不描边）；null = 不描边 */
  outline: Color | null;
}

export const INK = {
  ink: hex('#1F56B0'),
  sub: hex('#5E86C0'),
  blue: hex('#1B6FD1'),
  amber: hex('#D98200'),
};

const ON_DARK: Ink = { text: COLOR.white, accent: COLOR.yellow, glyph: null, outline: COLOR.navy };
const ON_LIGHT: Ink = { text: INK.ink, accent: INK.amber, glyph: null, outline: null };
const btnInk = (o: string): Ink => ({ text: COLOR.white, accent: COLOR.white, glyph: null, outline: hex(o) });
const ON_GREEN = btnInk('#1A7412');
const ON_BLUE = btnInk('#0F3F96');
/** 白色果冻图标键 */
const ON_WHITE_KEY: Ink = { text: INK.ink, accent: INK.amber, glyph: null, outline: null };
const ON_AMBER = btnInk('#8A4F00');
const ON_RED = btnInk('#8A1F12');
const ON_GRAY = btnInk('#5A6880');

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
  'kit/round_blue': ON_WHITE_KEY,
  // Codex 位图部件（ui/skin）
  'skin/j_btn_green': ON_GREEN,
  'skin/j_btn_blue': ON_BLUE,
  'skin/j_btn_amber': ON_AMBER,
  'skin/j_btn_red': ON_RED,
  'skin/j_btn_gray': ON_GRAY,
  'skin/j_bar_top': ON_DARK,
  'skin/j_bar_tab': ON_DARK,
  'skin/j_plate': ON_DARK,
  'skin/j_tile': ON_DARK,
  'skin/j_inset': ON_DARK,
  'skin/j_panel': ON_DARK,
  'skin/j_row': ON_DARK,
  'skin/j_row_gold': ON_AMBER,
  'skin/j_popup': ON_DARK,
  'skin/j_key_blue': ON_BLUE,
  'skin/j_key_green': ON_GREEN,
  'skin/j_key_red': ON_RED,
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
export const DARK_INK = ON_DARK;

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

/**
 * 旧的代码绘制部件 → 新的位图部件（docs/03 第 5 节）。页面代码还写着旧名字的，按这张表换皮：
 * plate = 横向三宫格（按高度缩放），nine = 九宫格（小于 150 的用小圆角的 j_row）
 */
const ALIAS: Record<string, [string, 'plate' | 'nine']> = {
  'kit/capsule': ['skin/j_bar_top', 'plate'],
  'kit/title_plate': ['skin/j_plate', 'plate'],
  'kit/btn_green': ['skin/j_btn_green', 'plate'],
  'kit/btn_blue': ['skin/j_btn_blue', 'plate'],
  'kit/btn_yellow': ['skin/j_btn_amber', 'plate'],
  'kit/btn_red': ['skin/j_btn_red', 'plate'],
  'kit/btn_gray': ['skin/j_btn_gray', 'plate'],
  'kit/panel_blue': ['skin/j_panel', 'nine'],
  'kit/panel_glass': ['skin/j_panel', 'nine'],
  'kit/row': ['skin/j_panel', 'nine'],
  'kit/row_blue': ['skin/j_panel', 'nine'],
  'kit/slot': ['skin/j_slot', 'nine'],
  'kit/slot_warn': ['skin/j_slot_warn', 'nine'],
  'kit/shelf': ['skin/j_shelf', 'plate'],
  'kit/bar_track': ['skin/j_bar_track', 'plate'],
  'kit/bar_track_light': ['skin/j_bar_track', 'plate'],
  'kit/bar_yellow': ['skin/j_bar_yellow', 'plate'],
  'kit/bar_green': ['skin/j_bar_green', 'plate'],
  'kit/bar_blue': ['skin/j_bar_blue', 'plate'],
  'kit/bar_purple': ['skin/j_bar_purple', 'plate'],
  'kit/tag_red': ['skin/j_btn_red', 'plate'],
  'kit/tag_amber': ['skin/j_btn_amber', 'plate'],
  'kit/cell_gold': ['skin/j_row_gold', 'nine'],
};
const plates = new WeakSet<Node>();

function nineFor(path: string, w: number, h: number): string {
  return path === 'skin/j_panel' && Math.min(w, h) < 150 ? 'skin/j_row' : path;
}

/** 九宫格：外层节点 w×h 管布局和子节点，皮在缩小 1/RES 的子节点上 */
export function slice(parent: Node | null, path: string, w: number, h: number, name = path): Node {
  // 页面标题：统一放在蓝色标题牌上（和商店一样），牌子不超过 86 高
  if (path === 'kit/title_page') return plate(parent, 'skin/j_plate', Math.max(220, w - 70), Math.min(h, 86), name);
  const alias = ALIAS[path];
  if (alias?.[1] === 'plate') return plate(parent, alias[0], w, h, name);
  if (alias) path = nineFor(alias[0], w, h);
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
  if (plates.has(n)) return resizePlate(n, w, h);
  size(n, w, h);
  const skin = n.getChildByName('skin');
  if (skin) size(skin, w * RES, h * RES);
}

export function setSlice(n: Node, path: string): void {
  const alias = ALIAS[path];
  if (plates.has(n)) return setPlate(n, alias ? alias[0] : path);
  if (alias) {
    const t = n.getComponent(UITransform) as UITransform;
    path = nineFor(alias[0], t.width, t.height);
  }
  const skin = n.getChildByName('skin');
  const sp = skin?.getComponent(Sprite);
  if (sp) sp.spriteFrame = frame(path);
}

/**
 * 位图部件（ui/skin，Codex 出的母版）：整张按高度等比缩放，只有中间一段横向拉伸，
 * 所以圆角、描边、高光在任何尺寸下都不变形（按钮越高圆角越大）。docs/03 第 5 节「界面部件」
 */
export function plate(parent: Node | null, path: string, w: number, h: number, name = path): Node {
  const n = box(name, parent, w, h);
  const skin = box('skin', n);
  const sp = skin.addComponent(Sprite);
  sp.type = Sprite.Type.SLICED;
  sp.sizeMode = Sprite.SizeMode.CUSTOM;
  sp.spriteFrame = frame(path);
  plates.add(n);
  resizePlate(n, w, h);
  const k = PART_INK[path];
  if (k) inks.set(n, k);
  return n;
}

export function resizePlate(n: Node, w: number, h: number): void {
  size(n, w, h);
  const skin = n.getChildByName('skin');
  const f = skin?.getComponent(Sprite)?.spriteFrame;
  if (!skin || !f) return;
  const k = h / f.originalSize.height;
  size(skin, w / k, f.originalSize.height);
  skin.setScale(k, k, 1);
}

export function setPlate(n: Node, path: string): void {
  const sp = n.getChildByName('skin')?.getComponent(Sprite);
  if (!sp) return;
  sp.spriteFrame = frame(path);
  const t = n.getComponent(UITransform) as UITransform;
  resizePlate(n, t.width, t.height);
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
    // 描边约字号的 1/12：再粗，笔画之间的空隙会被填死
    l.outlineWidth = o.outlineWidth ?? Math.max(2, Math.round(fontSize / 12));
  }
  // 描边字下面压一道更深的硬投影，字像有厚度一样立起来（定版图的做法）；小字不加，免得糊
  if (o.shadow ?? (!!outline && fontSize >= 28)) {
    l.enableShadow = true;
    l.shadowColor = depthColor(outline ?? COLOR.shadow);
    l.shadowOffset.set(0, -Math.max(2, Math.round(fontSize / 18)));
    l.shadowBlur = 1;
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

/** 字的厚度色：比描边再深一档 */
function depthColor(c: Color): Color {
  return new Color(Math.round(c.r * 0.7), Math.round(c.g * 0.7), Math.round(c.b * 0.7), 235);
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
      if (ink.outline) {
        l.outlineColor = ink.outline;
        if (l.enableShadow) l.shadowColor = depthColor(ink.outline);
      }
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


const BTN_SKIN: Record<BtnColor, string> = {
  green: 'skin/j_btn_green',
  blue: 'skin/j_btn_blue',
  yellow: 'skin/j_btn_amber',
  red: 'skin/j_btn_red',
  gray: 'skin/j_btn_gray',
};
/** 按下时皮压暗到这个颜色 */
const PRESSED = new Color(205, 205, 205, 255);

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

/** 亮面果冻按钮（圆角方块，不是胶囊；Codex 位图）：深色描边、下沿厚度、顶部高光；按下整体缩一点并压暗 */
export function button(parent: Node | null, o: BtnOpts): Btn {
  const n = plate(parent, BTN_SKIN[o.color], o.w, o.h, 'button');
  const fs = o.fontSize ?? Math.round(o.h * 0.4);
  let color = o.color;
  let pressed = false;
  const row = box('row', n);
  // 面的中心比外框中心高一点（下沿有厚度）
  const place = () => row.setPosition(0, o.h * 0.03 - (pressed ? 2 : 0), 0);
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
    setPlate(n, BTN_SKIN[c]);
    const sp = n.getChildByName('skin')?.getComponent(Sprite);
    if (sp) sp.color = pressed ? PRESSED : COLOR.white;
    const k = PART_INK[BTN_SKIN[c]];
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
    onTap(n, () => fn(), { press: 0.96, onPress: press });
  }
  return b;
}

/** 次按钮里放两行字：上面主文字（可带图标），下面小字（可带图标）。都放在按钮的 row 里，按下时一起下沉 */
export function twoLines(b: Btn, main: string, sub: string, subIcon: string | null, mainIcon: string | null = null): void {
  const row = b.node.getChildByName('row') as Node;
  const top = box('l1', row);
  at(top, 0, 15);
  const parts1: Node[] = [];
  if (mainIcon) parts1.push(img(top, mainIcon, 40, 40, 'ic'));
  parts1.push(text(top, main, 34).node);
  const bot = box('l2', row);
  at(bot, 0, -22);
  const parts2: Node[] = [];
  if (subIcon) parts2.push(img(bot, subIcon, 28, 28, 'ic'));
  parts2.push(text(bot, sub, 26).node);
  for (const parts of [parts1, parts2]) {
    const ws = parts.map((n) => {
      const l = n.getComponent(Label);
      if (l) l.updateRenderData(true);
      return (n.getComponent(UITransform) as UITransform).width;
    });
    const total = ws.reduce((x, y) => x + y, 0) + 6 * (ws.length - 1);
    let x = -total / 2;
    parts.forEach((n, i) => {
      at(n, x + ws[i] / 2, 0);
      x += ws[i] + 6;
    });
  }
}

/** 图标键（设置、加号…）：果冻方块（Codex 位图）+ 图标；按下缩一点并压暗 */
export function keyButton(parent: Node, color: 'blue' | 'green' | 'red', glyph: string, s: number, fn: (() => void) | null, glyphScale = 0.6): Node {
  const n = img(parent, `skin/j_key_${color}`, s, s, 'key');
  const g = img(n, glyph, s * glyphScale, s * glyphScale, 'glyph');
  g.setPosition(0, s * 0.02, 0);
  const sp = n.getComponent(Sprite) as Sprite;
  if (fn) onTap(n, () => fn(), { press: 0.92, onPress: (down) => (sp.color = down ? PRESSED : COLOR.white) });
  return n;
}

/** 图标键（设置、返回）：蓝色果冻方块 + 白色图标。skin 参数是旧接口，留着不用 */
const WHITE_GLYPH: Record<string, string> = { 'kit/ic_gear': 'skin/g_gear' };
export function iconButton(parent: Node, _skin: string, glyph: string | null, s: number, fn: () => void): Node {
  return keyButton(parent, 'blue', WHITE_GLYPH[glyph ?? ''] ?? glyph ?? 'skin/g_gear', s, fn, glyph === 'kit/ic_back' ? 0.62 : 0.6);
}

/** 信息条（金币、生命、关卡号）：深色半透明圆角 12，左边图标 + 白色数字 */
export interface Capsule {
  node: Node;
  label: Label;
  icon: Node | null;
  set(s: string): void;
}

export function capsule(parent: Node, w: number, h: number, iconPath: string | null, s: string, fontSize = Math.round(h * 0.56)): Capsule {
  const n = plate(parent, 'skin/j_bar_top', w, h, 'capsule');
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
  // 浅色卡片上用浅蓝凹槽，深色底上用深色半透明槽
  const track = slice(parent, inkOf(parent) === ON_LIGHT ? 'kit/bar_track_light' : 'kit/bar_track', w, h, 'bar');
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

/**
 * Codex 画的艺术数字（连击用）：'0'-'9' 和 '×'，金色糖果字。h = 数字高度；返回整行的宽。
 * 内容变了就清空重排（字数很少）
 */
export function artNumber(n: Node, s: string, h: number, align: 'left' | 'center' = 'center'): number {
  n.destroyAllChildren();
  const k = h / 180;
  const parts: [Node, number][] = [];
  for (const ch of s) {
    const path = ch === '×' ? 'skin/j_dg_x' : /[0-9]/.test(ch) ? `skin/j_dg_${ch}` : null;
    if (!path) continue;
    const f = frame(path);
    if (!f) continue;
    const g = img(n, path, f.originalSize.width * k, f.originalSize.height * k, 'g');
    parts.push([g, f.originalSize.width * k]);
  }
  const gap = -h * 0.07;
  const total = parts.reduce((a, [, w]) => a + w, 0) + gap * Math.max(0, parts.length - 1);
  let x = align === 'left' ? 0 : -total / 2;
  for (const [g, w] of parts) {
    at(g, x + w / 2, 0);
    x += w + gap;
  }
  return total;
}

/** 红点（右上角），可脉动 */
export function redDot(parent: Node, x: number, y: number, s = 30): Node {
  const n = img(parent, 'kit/dot_red', s, s, 'redDot');
  n.setPosition(x, y, 0);
  return n;
}
