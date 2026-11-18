// 屏幕尺寸：设计分辨率 750×1334 竖屏，原点在屏幕中心。
// 普通手机适配宽度（宽 750，可见高度随机型变 1334 ~ 1624+）；比 750:1334 还宽的屏（平板、折叠屏、电脑上的小游戏窗口）
// 改成适配高度（高 1334，宽度大于 750），不然高度不够、版面挤坏（Boot 里按屏幕比例选，docs/04 第 9 节）。
// 安全区：刘海 / 灵动岛 / 状态栏占掉顶上一截，手势条占掉底下一截；微信小游戏右上角还有胶囊按钮，顶栏整体压到它下面。
import { sys, view } from 'cc';
import type { PlatformBase, WindowRect } from '../platform/platformBase';

/** 胶囊按钮下面再空多少（设计单位） */
const CAPSULE_GAP = 10;
/** 页头那一行的中线离「页头基准线」多远（和 shell.ts 的 HEAD_Y、主页顶栏一致） */
const HEAD_ROW = 76;

/** 微信胶囊按钮在设计坐标里的范围（原点在屏幕中心，y 向上） */
export interface CapsuleRect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const Screen = {
  W: 750,
  H: 1334,
  /** 顶上被刘海、状态栏、胶囊按钮占掉的高度（设计单位） */
  safeTop: 0,
  /** 底下被手势条占掉的高度（设计单位） */
  safeBottom: 0,
  /**
   * 微信小游戏右上角的胶囊按钮；没有（App、浏览器）是 null。
   * 有胶囊时页头（返回键、标题、金币，主页顶栏，局内顶栏）挪到胶囊那一行，不再空着（用户 2026-11-18）
   */
  cap: noCapsule(),
  get top(): number {
    return this.H / 2 - this.safeTop;
  },
  get bottom(): number {
    return -this.H / 2 + this.safeBottom;
  },
  /** 页头那一行的中线：有胶囊时和胶囊对齐，没有时在 top 往下 76 */
  get headY(): number {
    return this.cap ? (this.cap.top + this.cap.bottom) / 2 : this.top - HEAD_ROW;
  },
  /**
   * 页头基准线：有页头的页面（主页、各子页面）按它往下排（替代 top）。有胶囊时比 top 高，页头在胶囊那一行，
   * 下面的内容跟着上移；没有胶囊时就是 top
   */
  get headTop(): number {
    return this.headY + HEAD_ROW;
  },
  /** 页头一行里的东西多高：有胶囊时和胶囊一样高（限在 56–72），没有时返回 0（各处用自己原来的尺寸） */
  get headH(): number {
    return this.cap ? Math.max(56, Math.min(72, this.cap.top - this.cap.bottom)) : 0;
  },
  /**
   * 页头一行右边能放到哪（x）：有胶囊时停在胶囊左边，还要让出胶囊左边一个圆按钮的位置
   * （微信在那里放了一个和胶囊一样高的圆按钮，开发者工具里能看到），没有胶囊时到屏幕右边留 24
   */
  get headRight(): number {
    if (!this.cap) return this.W / 2 - 24;
    const h = this.cap.top - this.cap.bottom;
    return this.cap.left - CAPSULE_GAP * 1.6 - h - CAPSULE_GAP * 1.6;
  },
  /** 屏幕比设计稿还宽（宽高比大于 750:1334）时返回 true，Boot 用它选适配高度 */
  wide(): boolean {
    const f = view.getFrameSize();
    return f.height > 0 && f.width / f.height > 750 / 1334 + 0.01;
  },
  /** 引擎的安全区：sys.getSafeAreaRect() 已经是设计单位 */
  init(): void {
    const v = view.getVisibleSize();
    this.W = v.width;
    this.H = v.height;
    try {
      const r = sys.getSafeAreaRect();
      this.safeTop = clampInset(v.height - (r.y + r.height), 240);
      this.safeBottom = clampInset(r.y, 160);
    } catch {
      this.safeTop = 0;
      this.safeBottom = 0;
    }
  },
  /** 平台给的安全区和胶囊按钮（平台创建以后、搭界面之前调一次） */
  applyPlatform(p: PlatformBase): void {
    const safe = p.safeArea();
    if (safe) {
      const k = this.W / safe.windowWidth;
      this.safeTop = clampInset(safe.top * k, 240);
      this.safeBottom = clampInset((safe.windowHeight - safe.bottom) * k, 160);
    }
    const cap: WindowRect | null = p.menuButton();
    this.cap = null;
    if (cap) {
      const k = this.W / cap.windowWidth;
      this.safeTop = Math.max(this.safeTop, clampInset(cap.bottom * k + CAPSULE_GAP, 260));
      this.cap = { left: cap.left * k - this.W / 2, right: cap.right * k - this.W / 2, top: this.H / 2 - cap.top * k, bottom: this.H / 2 - cap.bottom * k };
    }
  },
};

/** 初始值「没有胶囊」（Cocos 构建用的 Babel 不认 as X | Y，用函数给类型） */
function noCapsule(): CapsuleRect | null {
  return null;
}

function clampInset(v: number, max: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(max, Math.round(v))) : 0;
}
