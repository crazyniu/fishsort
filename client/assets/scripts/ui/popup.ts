// 弹窗：压暗的背景 + 缩放回弹出现。宝蓝厚框浅青内底（panel）或整块宝蓝（panel_blue），
// 标题在顶部胶囊里，右上圆形关闭键，角落点缀小鱼（docs/09 第 3 节）。
import { Node, tween } from 'cc';
import { popIn, popOut } from './fx';
import { COLOR, blockInput, box, img, onTap, opacity, slice, text, tint } from './kit';
import { Screen } from './screen';

export interface PopupOpts {
  w: number;
  h: number;
  title?: string;
  /** 整块宝蓝底（失败、开奖） */
  blue?: boolean;
  /** 不给关闭键（必须点按钮离开） */
  noClose?: boolean;
  /** 点压暗处也关 */
  tapOutside?: boolean;
  /** 角落小鱼（生物 id），null = 不放 */
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
  const body = slice(root, o.blue ? 'kit/panel_blue' : 'kit/panel', o.w, o.h, 'body');
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
  // 框里飘几个小气泡（定版图 16、18 的内底点缀）
  if (!o.blue) {
    for (const [fx0, fy0, s] of [
      [0.42, 0.36, 26],
      [0.45, -0.3, 18],
      [-0.44, -0.38, 22],
      [-0.4, 0.1, 14],
    ]) {
      const b = img(body, 'kit/bubble_small', s, s, 'deco');
      b.setPosition(fx0 * (o.w - 80), fy0 * (o.h - 80), 0);
      opacity(b).opacity = 150;
    }
  }
  if (o.title !== undefined) {
    // 标题凸台压在框上沿正中，大白字
    const head = slice(body, 'kit/popup_head', Math.max(300, o.title.length * 66 + 120), 110, 'title');
    head.setPosition(0, o.h / 2 + 33, 0);
    text(head, o.title, 62).node.setPosition(0, 2, 0);
  }
  if (o.mascot !== null) {
    const m = img(body, `fish/${o.mascot ?? 'c02'}`, 140, 140, 'mascot');
    m.setPosition(-o.w / 2 + 64, o.h / 2 + 50, 0);
    m.angle = 8;
  }
  if (!o.noClose) {
    const x = img(body, 'kit/close', 84, 84, 'close');
    x.setPosition(o.w / 2 - 18, o.h / 2 - 6, 0);
    onTap(x, () => p.close());
  }
  if (o.tapOutside) onTap(dim, () => p.close(), { press: 0, sound: null });
  popIn(body);
  stack.push(p);
  return p;
}
