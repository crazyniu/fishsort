// 竖直滚动区：拖动 + 松手惯性 + 越界回弹，超出视口的内容裁掉。
// 内容坐标：content 的 (0,0) 在视口顶边正中，子节点往下摆（y 为负）。
// 列表里的按钮照常用 onTap：手指滑动超过 TAP_SLOP 就不算点（kit.onTap 里判断）。
import { EventTouch, Mask, Node, Tween, tween } from 'cc';
import { box } from './kit';

export class Scroller {
  readonly node: Node;
  readonly content: Node;
  private offset = 0;
  private maxOffset = 0;
  private dragging = false;
  private vel = 0;
  private last = 0;
  private anim = { v: 0 };

  constructor(parent: Node, readonly w: number, readonly h: number) {
    this.node = box('scroll', parent, w, h);
    const mask = this.node.addComponent(Mask);
    mask.type = Mask.Type.GRAPHICS_RECT;
    this.content = box('content', this.node, w, 0);
    this.place();
    this.node.on(Node.EventType.TOUCH_START, () => this.down());
    this.node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => this.move(e));
    this.node.on(Node.EventType.TOUCH_END, () => this.up());
    this.node.on(Node.EventType.TOUCH_CANCEL, () => this.up());
  }

  /** 内容总高（设计单位）变了就调 */
  setContentHeight(ch: number): void {
    this.maxOffset = Math.max(0, ch - this.h);
    this.offset = Math.min(this.offset, this.maxOffset);
    this.place();
  }

  scrollTo(offset: number, animate = false): void {
    const t = Math.max(0, Math.min(this.maxOffset, offset));
    Tween.stopAllByTarget(this.anim);
    if (!animate) {
      this.offset = t;
      this.place();
      return;
    }
    this.anim.v = this.offset;
    tween(this.anim)
      .to(0.4, { v: t }, { easing: 'quartOut', onUpdate: () => ((this.offset = this.anim.v), this.place()) })
      .start();
  }

  /** 现在滚到哪了（页面重画后用 scrollTo 放回去） */
  get offsetNow(): number {
    return Math.max(0, Math.min(this.maxOffset, this.offset));
  }

  stop(): void {
    Tween.stopAllByTarget(this.anim);
  }

  private place(): void {
    // 页面重建时整块滚动区会被销毁，惯性动画可能还在跑
    if (!this.content.isValid) {
      this.stop();
      return;
    }
    this.content.setPosition(0, this.h / 2 + this.offset, 0);
  }

  private down(): void {
    Tween.stopAllByTarget(this.anim);
    this.dragging = true;
    this.vel = 0;
    this.last = Date.now();
  }

  private move(e: EventTouch): void {
    if (!this.dragging) return;
    const dy = e.getUIDelta().y;
    const t = Date.now();
    const dt = Math.max(1, t - this.last) / 1000;
    this.vel = this.vel * 0.3 + (dy / dt) * 0.7;
    this.last = t;
    const out = this.offset < 0 || this.offset > this.maxOffset;
    this.offset += out ? dy * 0.35 : dy;
    this.place();
  }

  private up(): void {
    if (!this.dragging) return;
    this.dragging = false;
    const v = (Date.now() - this.last) / 1000 > 0.1 ? 0 : this.vel;
    const target = Math.max(0, Math.min(this.maxOffset, this.offset + v * 0.35));
    if (Math.abs(target - this.offset) < 0.5) return;
    const dur = Math.min(0.9, 0.25 + Math.abs(target - this.offset) / 2500);
    this.anim.v = this.offset;
    tween(this.anim)
      .to(dur, { v: target }, { easing: 'quartOut', onUpdate: () => ((this.offset = this.anim.v), this.place()) })
      .start();
  }
}
