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

/** 文字：白字 + 深蓝描边 + 轻投影（docs/09 第 3 节）。汉字不倾斜 */
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
  l.color = o.color ?? COLOR.white;
  const outline = o.outline === undefined ? COLOR.navy : o.outline;
  if (outline) {
    l.enableOutline = true;
    l.outlineColor = outline;
    l.outlineWidth = o.outlineWidth ?? Math.max(2, Math.round(fontSize / 9));
  }
  if (o.shadow ?? outline !== null) {
    l.enableShadow = true;
    l.shadowColor = COLOR.shadow;
    l.shadowOffset.set(0, -Math.max(2, Math.round(fontSize / 14)));
    l.shadowBlur = 2;
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
    if (press > 0) {
      Tween.stopAllByTarget(n);
      base = base.x === 0 ? new Vec3(1, 1, 1) : base;
      tween(n).to(0.06, { scale: new Vec3(base.x * press, base.y * press, 1) }).start();
    }
  });
  const release = (fire: boolean, e?: EventTouch) => {
    if (!down) return;
    down = false;
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

export type BtnColor = 'green' | 'blue' | 'yellow' | 'purple' | 'orange' | 'red' | 'gray';

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

/** 胶囊按钮：绿 = 主行动，蓝 = 次行动，黄 = 广告翻倍类，灰 = 禁用（docs/09 第 3 节） */
export function button(parent: Node | null, o: BtnOpts): Btn {
  const n = slice(parent, `kit/btn_${o.color}`, o.w, o.h, 'button');
  const fs = o.fontSize ?? Math.round(o.h * 0.4);
  let color = o.color;
  const row = box('row', n);
  row.setPosition(0, 2, 0);
  let icon: Node | null = null;
  if (o.icon) {
    const is = o.iconSize ?? Math.round(o.h * 0.56);
    icon = img(row, o.icon, is, is, 'icon');
  }
  const label = o.label !== undefined ? text(row, o.label, fs) : null;
  const layout = () => {
    const gap = 8;
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
      setSlice(n, `kit/btn_${b.enabled ? c : 'gray'}`);
    },
    setEnabled(on: boolean) {
      b.enabled = on;
      setSlice(n, `kit/btn_${on ? color : 'gray'}`);
    },
  };
  if (o.onTap) {
    const fn = o.onTap;
    onTap(n, () => fn());
  }
  return b;
}

/** 圆形图标按钮（设置、返回、关闭） */
export function iconButton(parent: Node, skin: string, glyph: string | null, s: number, fn: () => void): Node {
  const n = img(parent, skin, s, s, 'iconButton');
  if (glyph) img(n, glyph, s * 0.56, s * 0.56, 'glyph');
  onTap(n, () => fn());
  return n;
}

/** 深蓝胶囊信息条：左边图标 + 白色数字 */
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
    icon = img(n, iconPath, h * 1.05, h * 1.05, 'icon');
    icon.setPosition(-w / 2 + h * 0.42, 0, 0);
  }
  const label = text(n, s, fontSize);
  label.node.setPosition(iconPath ? h * 0.3 : 0, 0, 0);
  return { node: n, label, icon, set: (v: string) => (label.string = v) };
}

// ---------------------------------------------------------------- 进度条

export interface Bar {
  node: Node;
  set(frac: number): void;
}

/** 进度条：底槽 + 从左往右长的填充（填充最短也有一个高度宽，圆头不变形） */
export function progressBar(parent: Node, w: number, h: number, color: 'green' | 'yellow' | 'blue' | 'purple' = 'green'): Bar {
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
