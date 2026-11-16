// 弹窗（docs/03 第 2 节）：压暗的背景 + 缩放回弹出现。宝蓝厚框（内部下沿有厚度）+ 浅色内容区；
// 有标题时框顶加厚 HEAD，白字深描边的标题压在上面；右上角红色关闭键。不再放角落小鱼和装饰气泡。
// 标题框加在 h 之外（往上长 HEAD），内容坐标不受影响。
import { Node, tween } from 'cc';
import { popIn, popOut } from './fx';
import { COLOR, blockInput, box, img, onTap, opacity, size, slice, text, tint } from './kit';
import { RES } from './kit';

/** 标题栏高度 */
export const HEAD = 96;
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
  const body = slice(root, head ? 'kit/panel' : 'kit/panel_plain', o.w, o.h, 'body');
  if (head) {
    // 卡片的皮往上长出标题栏的高度，标题栏盖在上面，圆角对齐
    const skin = body.getChildByName('skin') as Node;
    size(skin, o.w * RES, (o.h + head) * RES);
    skin.setPosition(0, head / 2, 0);
  }
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
    const bar = slice(body, 'kit/popup_head', o.w, HEAD, 'title');
    bar.setPosition(0, o.h / 2 + HEAD / 2 - 6, 0);
    text(bar, o.title, 48).node.setPosition(0, 0, 0);
  }
  if (!o.noClose) {
    // 关闭键：右上角红色方块，压在框角上
    const x = img(body, 'kit/close', 76, 76, 'close');
    x.setPosition(o.w / 2 - 22, o.h / 2 + head - 14, 0);
    const hit = box('hit', x, 96, 96);
    onTap(hit, () => p.close(), { press: 0 });
  }
  if (o.tapOutside) onTap(dim, () => p.close(), { press: 0, sound: null });
  popIn(body);
  stack.push(p);
  return p;
}
