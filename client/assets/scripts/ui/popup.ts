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
  if (o.title !== undefined) {
    const plate = slice(body, 'kit/title_plate', Math.max(240, o.title.length * 52 + 90), 84, 'title');
    plate.setPosition(0, o.h / 2 - 4, 0);
    text(plate, o.title, 46).node.setPosition(0, 4, 0);
  }
  if (o.mascot !== null) {
    const m = img(body, `fish/${o.mascot ?? 'c02'}`, 110, 110, 'mascot');
    m.setPosition(-o.w / 2 + 70, o.h / 2 + 24, 0);
    m.angle = 8;
  }
  if (!o.noClose) {
    const x = img(body, 'kit/close', 76, 76, 'close');
    x.setPosition(o.w / 2 - 22, o.h / 2 - 22, 0);
    onTap(x, () => p.close());
  }
  if (o.tapOutside) onTap(dim, () => p.close(), { press: 0, sound: null });
  popIn(body);
  stack.push(p);
  return p;
}
