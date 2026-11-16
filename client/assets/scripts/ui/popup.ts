// 弹窗（docs/03 第 2 节）：压暗的背景 + 缩放回弹出现。白色圆角底板，上面写深蓝字（和别的容器一样）。
// 有标题时底板往上长 HEAD，蓝色标题牌骑在上沿正中；右上角红色关闭键压在板角上。标题区加在 h 之外，内容坐标不受影响。
import { Node, tween } from 'cc';
import { popIn, popOut } from './fx';
import { COLOR, blockInput, box, LIGHT_INK, fit, keyButton, onTap, opacity, plate, resizePlate, setInk, slice, text, textWidth, tint } from './kit';

/** 标题区高度 */
export const HEAD = 64;
import { Screen } from './screen';

export interface PopupOpts {
  w: number;
  h: number;
  title?: string;
  /** 旧参数（整块宝蓝底），现在所有弹窗同一种浅色卡片 */
  blue?: boolean;
  /** 不给关闭键（必须点按钮离开） */
  noClose?: boolean;
  /** 点压暗处也关 */
  tapOutside?: boolean;
  /** 旧参数（角落小鱼），不再显示 */
  mascot?: string | null;
  onClose?: () => void;
}

export interface Popup {
  root: Node;
  /** 面板，内容往这里加；原点在面板中心 */
  body: Node;
  close(): void;
}

let layer: Node | null = null;
const stack: Popup[] = [];

export function initPopups(l: Node): void {
  layer = l;
}

export function popupCount(): number {
  return stack.length;
}

export function closeAllPopups(): void {
  while (stack.length) stack[stack.length - 1].close();
}

export function openPopup(o: PopupOpts): Popup {
  const root = box('popup', layer, Screen.W, Screen.H);
  blockInput(root);
  const dim = tint(root, Screen.W, Screen.H, COLOR.dim, 'dim');
  const op = opacity(dim);
  op.opacity = 0;
  tween(op).to(0.18, { opacity: 255 }).start();
  const head = o.title !== undefined ? HEAD : 0;
  const body = box('body', root, o.w, o.h);
  // 内容直接放在 body 上：按白色底板取字色（深蓝、不描边）
  setInk(body, LIGHT_INK);
  // 框的皮往上长出标题区；内容仍以 body 中心为原点
  const frame = slice(body, 'skin/f_popup', o.w, o.h + head, 'frame');
  frame.setPosition(0, head / 2, 0);
  frame.setSiblingIndex(0);
  blockInput(body);
  let closed = false;
  const p: Popup = {
    root,
    body,
    close() {
      if (closed) return;
      closed = true;
      const i = stack.indexOf(p);
      if (i >= 0) stack.splice(i, 1);
      tween(op).to(0.14, { opacity: 0 }).start();
      popOut(body, 0.14, () => root.destroy());
      o.onClose?.();
    },
  };
  if (o.title !== undefined) {
    // 标题牌按字宽撑开，骑在框的上沿
    const bar = plate(body, 'skin/f_plate_blue', 260, 88, 'title');
    bar.setPosition(0, o.h / 2 + head - 8, 0);
    const l = text(bar, o.title, 46);
    l.node.setPosition(0, 5, 0);
    fit(l, o.w - 150 - 96, 46, 28);
    resizePlate(bar, Math.min(o.w - 150, Math.max(260, textWidth(l) + 96)), 88);
  }
  if (!o.noClose) {
    // 关闭键：红色图标键 + 白叉，压在底板的右上角
    const x = keyButton(body, 'red', 'kit/ic_x', 72, () => p.close(), 0.5);
    x.setPosition(o.w / 2 - 18, o.h / 2 + head - 18, 0);
    x.name = 'close';
  }
  if (o.tapOutside) onTap(dim, () => p.close(), { press: 0, sound: null });
  popIn(body);
  stack.push(p);
  return p;
}
