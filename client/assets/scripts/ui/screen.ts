// 屏幕尺寸：设计分辨率 750 宽、适配宽度，可见高度随机型变（1334 ~ 1624+）。原点在屏幕中心。
import { sys, view } from 'cc';

export const Screen = {
  W: 750,
  H: 1334,
  /** 刘海、状态栏占掉的高度（设计单位） */
  safeTop: 0,
  safeBottom: 0,
  get top(): number {
    return this.H / 2 - this.safeTop;
  },
  get bottom(): number {
    return -this.H / 2 + this.safeBottom;
  },
  init(): void {
    const v = view.getVisibleSize();
    this.W = v.width;
    this.H = v.height;
    try {
      const r = sys.getSafeAreaRect();
      this.safeTop = Math.max(0, Math.min(120, v.height - (r.y + r.height)));
      this.safeBottom = Math.max(0, Math.min(80, r.y));
    } catch {
      this.safeTop = 0;
    }
  },
};
