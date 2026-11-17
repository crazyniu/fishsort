// 界面外壳：分层、页面切换、顶栏、提示条。
// 没有底栏（用户 2026-11-16 定）：主页是总入口，别的页面都从主页点进去、左上角返回（docs/01 5.3）；顶栏按需显示：主页、商店。
import { Label, Node, UITransform, Vec3, tween } from 'cc';
import * as Album from '../core/meta/album';
import * as PlayerData from '../core/meta/playerData';
import * as Lives from '../core/meta/lives';
import { App } from '../services/app';
import { now } from '../services/clock';
import { fadeIn, popIn } from './fx';
import { COLOR, Capsule, at, hex, blockInput, box, capsule, fit, fmt, img, keyButton, onTap, opacity, pageTitle, plate, setImg, slice, text, tint } from './kit';
import { closeAllPopups, initPopups } from './popup';
import { Screen } from './screen';

/** 根页面：回到这里返回历史就清空 */
const HOME = 'home';
/** 按关开放的页面对应的功能开放项；没开放时点进去是锁页（docs/01 5.3） */
const PAGE_FEATURE: Record<string, string> = { collect: 'album', tasks: 'tasks', map: 'levelSelect' };
/** 页面最底下留的空（再加上机型的安全区，Screen.bottom 已经算进去了） */
export const PAGE_BOTTOM = 24;

/** 子页面页头的中线离屏幕顶多远、返回键多大、标题牌多高 */
export const HEAD_Y = 76;
const HEAD_KEY = 88;
const HEAD_TITLE = 76;
/** 页头下面的内容从这里开始（离屏幕顶） */
export const HEAD_BOTTOM = 136;

/**
 * 子页面的页头（各页同一个位置、同一个大小）：左上角返回键，标题牌居中；要花金币的页面右边再放一条金币数。
 * 返回金币条（没要就是 null），页面刷新时自己改数字
 */
export function pageHead(parent: Node, title: string, o: { onBack?: () => void; coins?: boolean } = {}): Capsule | null {
  const y = Screen.top - HEAD_Y;
  const back = keyButton(parent, 'blue', 'kit/ic_back', HEAD_KEY, o.onBack ?? (() => ui.back()));
  at(back, -Screen.W / 2 + 24 + HEAD_KEY / 2, y);
  back.name = 'back';
  at(pageTitle(parent, title, HEAD_TITLE), 0, y);
  if (!o.coins) return null;
  const c = capsule(parent, 196, 64, 'icon/coin', fmt(App.save.data.coins), 30);
  at(c.node, Screen.W / 2 - 24 - 98, y);
  return c;
}

export abstract class Page {
  node!: Node;
  /** 这一页要不要顶栏（金币、生命、设置）：用得到才放，见 docs/01 5.3 */
  readonly topBar: boolean = false;
  abstract build(root: Node): void;
  /** 每次切到这一页时调；arg 是 go() 传进来的参数 */
  show(_arg?: unknown): void {}
  hide(): void {}
  /** 存档变了（领奖、花钱）后重画数字、红点 */
  refresh(): void {}
  /** 返回键；返回 false 表示自己处理了 */
  back(): boolean {
    return true;
  }
}

/**
 * 主页顶栏（定版图 01）：一整条宝蓝亮面条——左端头像框压在条上，中间一道深色凹槽里放金币（带绿色加号）和生命，右端设置键。
 * 顶上垫一层淡渐变压住背景图
 */
class TopBar {
  node: Node;
  /** 金币数字和图标（别的页面飞金币时当落点） */
  readonly coins: Label;
  readonly coinIcon: Node;
  private lives: Label;
  private timer: Label;
  private lifeRoom = 0;
  private coinRoom = 0;
  private heart: Node;
  private avatar: Node;
  private frame: Node;
  private shownCoins = -1;
  private shownAvatar = '';

  constructor(parent: Node, actions: { coins: () => void; lives: () => void; settings: () => void; profile: () => void }) {
    this.node = box('topbar', parent, Screen.W, 120);
    at(this.node, 0, Screen.top - 76);
    // 平面顶栏（新设计，用户 2026-11-16）：不再有一整条底板，四块东西各自浮在场景上——
    // 头像方块 | 金币小条（带绿色加号）| 生命小条（回满前带倒计时）| 设置键。两条小条是不凸起的白色圆角块，字深蓝不描边（容器一律是白的）
    const BW = Screen.W - 40;
    const L = -BW / 2;
    const G = 14;
    const AV = 92;
    const KEY = 84;
    const PH = 72;
    // 头像
    this.frame = img(this.node, 'skin/f_avatar', AV, AV, 'avatarFrame');
    at(this.frame, L + AV / 2, 0);
    this.avatar = img(this.frame, 'icon/avatar', 70, 70, 'avatar');
    at(this.avatar, 0, 5);
    onTap(this.frame, actions.profile);
    // 设置
    at(keyButton(this.node, 'blue', 'kit/ic_gear', KEY, actions.settings), BW / 2 - KEY / 2, 0);
    // 两条小条平分头像和设置键之间的宽：金币略宽（最多 7 位数 + 加号）
    const room = BW - AV - KEY - G * 3;
    const CW = Math.round(room * 0.54);
    const lw = room - CW;
    const coinTap = plate(this.node, 'skin/f_dock', CW, PH, 'coins');
    at(coinTap, L + AV + G + CW / 2, 0);
    this.coinIcon = img(coinTap, 'icon/coin', 58, 58, 'icon');
    at(this.coinIcon, -CW / 2 + 38, 0);
    this.coins = text(coinTap, '0', 36, { align: 'left' });
    at(this.coins.node, -CW / 2 + 76, 1);
    at(keyButton(coinTap, 'green', 'kit/ic_plus', 50, null, 0.5), CW / 2 - 36, 0);
    this.coinRoom = CW - 76 - 36 - 25 - 10;
    onTap(coinTap, actions.coins);
    // 生命：图标 + 数量，回满前后面跟一个小号倒计时
    const lifeTap = plate(this.node, 'skin/f_dock', lw, PH, 'lives');
    this.lifeRoom = lw;
    at(lifeTap, L + AV + G + CW + G + lw / 2, 0);
    this.heart = img(lifeTap, 'icon/heart', 58, 58, 'icon');
    at(this.heart, -lw / 2 + 38, 0);
    this.lives = text(lifeTap, '5/5', 36, { align: 'left' });
    at(this.lives.node, -lw / 2 + 76, 1);
    this.timer = text(lifeTap, '', 24, { align: 'left', color: hex('#5E86C0') });
    onTap(lifeTap, actions.lives);
  }

  refresh(): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const t = now();
    if (this.shownCoins !== s.coins) {
      this.coins.string = fmt(s.coins);
      fit(this.coins, this.coinRoom, 36, 22);
      if (this.shownCoins >= 0) popIn(this.coins.node, 0, 0.2);
      this.shownCoins = s.coins;
    }
    // 集齐收藏的头像框：换成金色
    setImg(this.frame, Album.hasFrame(s) ? 'skin/f_avatar_gold' : 'skin/f_avatar', 92, 92);
    // 头像换成收藏生物（docs/01 5.9）
    const av = PlayerData.avatarOf(s);
    if (av !== this.shownAvatar) {
      this.shownAvatar = av;
      setImg(this.avatar, av ? `fish/${av}` : 'icon/avatar', 70, 70);
    }
    const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    let tail = '';
    if (Lives.isUnlimited(s, t)) {
      setImg(this.heart, 'icon/heart_inf', 58, 58);
      this.lives.string = '∞';
      tail = mmss(Lives.unlimitedLeft(s, t));
    } else {
      setImg(this.heart, 'icon/heart', 58, 58);
      const n = Lives.count(s, eco, t);
      const full = n >= eco.lives.max;
      this.lives.string = full ? `${n}/${eco.lives.max}` : String(n);
      if (!full) tail = mmss(Lives.secondsToNext(s, eco, t));
    }
    this.timer.string = tail;
    this.lives.updateRenderData(true);
    const lw = (this.lives.node.getComponent(UITransform) as UITransform).width;
    const tx = this.lives.node.position.x + lw + 8;
    at(this.timer.node, tx, -2);
    // 倒计时最多写到这一条的右边留 18 的地方
    fit(this.timer, this.lifeRoom / 2 - 18 - tx, 24, 18);
  }
}

export class Shell {
  root!: Node;
  bg!: Node;
  pages!: Node;
  bars!: Node;
  popups!: Node;
  toasts!: Node;
  fx!: Node;
  topbar!: TopBar;
  private registry = new Map<string, () => Page>();
  private built = new Map<string, Page>();
  private current: { name: string; page: Page } | null = null;
  /** 从主页一路点进来经过的页面，返回键照着它往回走 */
  private history: string[] = [];

  /** 当前页面的名字（没有页面时是空串） */
  get pageName(): string {
    return this.current?.name ?? '';
  }

  init(canvas: Node, topActions: ConstructorParameters<typeof TopBar>[1]): void {
    this.root = box('ui', canvas, Screen.W, Screen.H);
    this.bg = box('bg', this.root, Screen.W, Screen.H);
    this.pages = box('pages', this.root, Screen.W, Screen.H);
    this.bars = box('bars', this.root, Screen.W, Screen.H);
    this.popups = box('popups', this.root, Screen.W, Screen.H);
    this.fx = box('fx', this.root, Screen.W, Screen.H);
    this.toasts = box('toasts', this.root, Screen.W, Screen.H);
    initPopups(this.popups);
    this.topbar = new TopBar(this.bars, topActions);
  }

  register(name: string, make: () => Page): void {
    this.registry.set(name, make);
  }

  page<T extends Page>(name: string): T {
    let p = this.built.get(name);
    if (!p) {
      const make = this.registry.get(name);
      if (!make) throw new Error(`没有这个页面：${name}`);
      p = make();
      p.node = box(name, this.pages, Screen.W, Screen.H);
      p.build(p.node);
      p.node.active = false;
      this.built.set(name, p);
    }
    return p as T;
  }

  get currentName(): string {
    return this.current?.name ?? '';
  }

  /** 切页面。主页是根，别的页面进历史，返回键回到上一页；回到主页历史清空 */
  go(name: string, arg?: unknown): void {
    this.open(name, arg, true);
  }

  private open(name: string, arg: unknown, push: boolean): void {
    // 没开放的功能：换成锁页（docs/01 5.3：入口是灰的带锁，但可以点进去看锁页）
    const f = PAGE_FEATURE[name];
    if (f && !App.featureOpen(f)) {
      name = 'lock';
      arg = { feature: f };
    }
    const next = this.page(name);
    const prev = this.current;
    if (prev && prev.name === name) {
      next.show(arg);
      this.refresh();
      return;
    }
    closeAllPopups();
    if (prev) {
      prev.page.hide();
      prev.page.node.active = false;
    }
    // 要去的页面已经在历史里（如 局内 → 结算 → 下一关）：退回到那一层，历史不会越走越长
    const seen = this.history.indexOf(name);
    if (name === HOME) this.history = [];
    else if (seen >= 0) this.history.length = seen;
    else if (prev && push) this.history.push(prev.name);
    this.current = { name, page: next };
    next.node.active = true;
    next.show(arg);
    fadeIn(next.node, 0.15);
    this.topbar.node.active = next.topBar;
    this.refresh();
  }

  back(): void {
    if (!this.current || !this.current.page.back()) return;
    this.open(this.history.pop() ?? HOME, undefined, false);
  }

  /** 存档变了以后调：当前页、顶栏一起刷新 */
  refresh(): void {
    // 各自兜住：一块出错不连累别的
    for (const [name, f] of [
      ['page', () => this.current?.page.refresh()],
      ['topbar', () => this.topbar.node.active && this.topbar.refresh()],
    ] as const) {
      try {
        f();
      } catch (e) {
        reportError(`${name}.refresh`, e);
      }
    }
  }

  /** 换语言：页面全部按新文案重建，回到当前页（局内、结算、锁页回主页） */
  rebuild(topActions: ConstructorParameters<typeof TopBar>[1]): void {
    const name = this.current?.name ?? HOME;
    closeAllPopups();
    for (const p of this.built.values()) p.node.destroy();
    this.built.clear();
    this.current = null;
    this.history = [];
    this.topbar.node.destroy();
    this.topbar = new TopBar(this.bars, topActions);
    this.go(name === 'game' || name === 'result' || name === 'lock' ? HOME : name);
  }

  /** 屏幕中间偏上的一条提示，1.6 秒后消失 */
  toast(msg: string): void {
    const n = slice(this.toasts, 'kit/capsule', Math.min(Screen.W - 80, msg.length * 30 + 90), 80, 'toast');
    at(n, 0, 220);
    text(n, msg, 32);
    popIn(n, 0, 0.2);
    tween(n)
      .delay(1.4)
      .by(0.3, { position: new Vec3(0, 40, 0) })
      .call(() => n.destroy())
      .start();
    tween(opacity(n)).delay(1.4).to(0.3, { opacity: 0 }).start();
  }

  /** 全屏压暗挡住操作（广告、读关卡时） */
  busy(on: boolean): void {
    const old = this.toasts.getChildByName('busy');
    if (!on) {
      old?.destroy();
      return;
    }
    if (old) return;
    const b = tint(this.toasts, Screen.W, Screen.H, COLOR.dim, 'busy');
    blockInput(b);
    opacity(b).opacity = 120;
  }
}

export const ui = new Shell();

let errorSink: ((msg: string) => void) | null = null;
export function setErrorSink(f: (msg: string) => void): void {
  errorSink = f;
}
/** 调试构建把错误画在屏幕顶上（Mac 上截图就能看到），正式构建只写日志 */
export function reportError(where: string, e: unknown): void {
  const msg = `${where}: ${e instanceof Error ? `${e.message}\n${(e.stack ?? '').split('\n').slice(1, 4).join('\n')}` : String(e)}`;
  console.error(msg);
  errorSink?.(msg);
}

/** 进场：依次弹出（总时长 ≤ 0.8 秒，docs/09 第 6 节） */
export function enterStagger(nodes: Node[], step = 0.06): void {
  nodes.forEach((n, i) => popIn(n, Math.min(0.5, i * step), 0.3));
}

export function width(n: Node): number {
  return (n.getComponent(UITransform) as UITransform).width;
}
