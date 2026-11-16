// 界面外壳：分层、页面切换、底栏、顶栏、提示条。
// 底栏固定 商店 · 家园 · 主页 · 收藏 · 排行（docs/01 5.3）；顶栏按需显示：主页、商店（docs/01 5.3）。
import { Label, Node, Sprite, Tween, UITransform, Vec3, tween } from 'cc';
import * as Album from '../core/meta/album';
import * as Dex from '../core/meta/dex';
import * as Features from '../core/meta/features';
import * as PlayerData from '../core/meta/playerData';
import * as HomeBase from '../core/meta/homeBase';
import * as Lives from '../core/meta/lives';
import * as WeeklyGoal from '../core/meta/weeklyGoal';
import { App } from '../services/app';
import { now, today } from '../services/clock';
import { breathe, fadeIn, popIn, ring, sparkle } from './fx';
import { tr } from './i18n';
import { COLOR, at, hex, blockInput, box, fmt, img, keyButton, onTap, opacity, plate, redDot, setImg, slice, text, tint } from './kit';
import { closeAllPopups, initPopups } from './popup';
import { Screen } from './screen';

export type Tab = 'shop' | 'base' | 'home' | 'collect' | 'rank';
export const TABS: Tab[] = ['shop', 'base', 'home', 'collect', 'rank'];
/** 页签对应的功能开放项；商店、主页一开始就有 */
const TAB_FEATURE: Record<Tab, string | null> = { shop: null, base: 'homeBase', home: null, collect: 'album', rank: 'rank' };
const TAB_ICON: Record<Tab, string> = {
  shop: 'icon/tab_shop',
  base: 'icon/tab_base',
  home: 'icon/tab_home',
  collect: 'icon/tab_collect',
  rank: 'icon/tab_rank',
};
const TAB_LABEL: Record<Tab, string> = {
  shop: 'UI_TAB_SHOP',
  base: 'UI_TAB_BASE',
  home: 'UI_TAB_MAIN',
  collect: 'UI_TAB_COLLECTION',
  rank: 'UI_TAB_RANK',
};
export const TABBAR_H = 164;
/** 页签文字都是白的（定版图 01）；选中靠亮色方块和放大的图标区分 */
const TAB_DIM = COLOR.white;

export abstract class Page {
  node!: Node;
  /** 页签页给出所属页签；子页面（选关、抽奖、每日挑战、局内）为 null，不显示底栏 */
  abstract readonly tab: Tab | null;
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

const PAGE_TAG = 9104;

class TabBar {
  node: Node;
  private sel: Node;
  private cells = new Map<Tab, { node: Node; icon: Node; label: Label; dot: Node; lock: Node }>();
  private current: Tab = 'home';

  constructor(parent: Node, private readonly onSelect: (t: Tab) => void) {
    // 宝蓝亮面底栏；选中的页签垫一块亮青色方块（略高出底栏），图标放大（docs/03 第 2 节、定版图 01）
    const w = Screen.W - 12;
    this.node = plate(parent, 'skin/j_bar_tab', w, TABBAR_H, 'tabbar');
    at(this.node, 0, -Screen.H / 2 + TABBAR_H / 2 + Math.max(6, Screen.safeBottom));
    blockInput(this.node);
    const cw = (w - 28) / TABS.length;
    for (let i = 1; i < TABS.length; i++) {
      const line = tint(this.node, 3, 84, hex('#0A2A8A'), 'sep');
      opacity(line).opacity = 90;
      at(line, -w / 2 + 14 + cw * i, 0);
    }
    this.sel = img(this.node, 'skin/j_tile', cw + 2, ((cw + 2) * 512) / 420, 'sel');
    TABS.forEach((t, i) => {
      const x = -w / 2 + 14 + cw * (i + 0.5);
      const cell = box(t, this.node, cw, TABBAR_H);
      at(cell, x, 0);
      const icon = img(cell, TAB_ICON[t], 92, 92, 'icon');
      at(icon, 0, 22);
      const label = text(cell, tr(TAB_LABEL[t]), 34, { color: TAB_DIM });
      at(label.node, 0, -50);
      const dot = redDot(cell, 42, 60, 28);
      const lock = img(cell, 'kit/ic_lock', 40, 40, 'lock');
      at(lock, 32, -2);
      this.cells.set(t, { node: cell, icon, label, dot, lock });
      onTap(cell, () => this.onSelect(t), { press: 0.94, sound: 'tab' });
    });
    this.select('home', false);
  }

  /**
   * 切页签的动效（用户 2026-11-16）：选中块带着过冲滑过去、路上横向拉长一点；新图标先缩一下再弹起来、左右晃一下落定，
   * 脚下冒一圈光和几颗星光；字弹一下变白；旧图标缩回去
   */
  select(t: Tab, animate = true): void {
    const prev = this.cells.get(this.current);
    const same = this.current === t;
    if (prev && !same) {
      Tween.stopAllByTarget(prev.icon);
      prev.icon.angle = 0;
      prev.label.color = TAB_DIM;
      if (animate) tween(prev.icon).to(0.14, { scale: new Vec3(1, 1, 1), position: new Vec3(0, 22, 0) }, { easing: 'quadOut' }).start();
      else {
        prev.icon.setScale(1, 1, 1);
        at(prev.icon, 0, 22);
      }
    }
    this.current = t;
    const c = this.cells.get(t) as { node: Node; icon: Node; label: Label };
    const x = c.node.position.x;
    c.label.color = COLOR.white;
    Tween.stopAllByTarget(this.sel);
    Tween.stopAllByTarget(c.icon);
    Tween.stopAllByTarget(c.label.node);
    c.label.node.setScale(1, 1, 1);
    if (!animate || same) {
      at(this.sel, x, 9);
      this.sel.setScale(1, 1, 1);
      c.icon.angle = 0;
      c.icon.setScale(1.14, 1.14, 1);
      at(c.icon, 0, 30);
      return;
    }
    tween(this.sel)
      .to(0.1, { scale: new Vec3(1.14, 0.94, 1) }, { easing: 'quadOut' })
      .to(0.16, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
    tween(this.sel).to(0.24, { position: new Vec3(x, 9, 0) }, { easing: 'backOut' }).start();
    c.icon.setScale(0.86, 0.86, 1);
    tween(c.icon)
      .to(0.14, { scale: new Vec3(1.3, 1.3, 1), position: new Vec3(0, 46, 0), angle: -9 }, { easing: 'quadOut' })
      .to(0.1, { scale: new Vec3(1.1, 1.18, 1), position: new Vec3(0, 28, 0), angle: 7 }, { easing: 'quadIn' })
      .to(0.12, { scale: new Vec3(1.14, 1.14, 1), position: new Vec3(0, 30, 0), angle: 0 }, { easing: 'backOut' })
      .start();
    c.label.node.setScale(1.22, 1.22, 1);
    tween(c.label.node).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    ring(this.node, x, 24, 70, 190, hex('#BFF2FF'));
    sparkle(this.node, x, 30, 6, 86, hex('#E6FBFF'), 24);
  }

  refresh(): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const day = today();
    for (const t of TABS) {
      const c = this.cells.get(t);
      if (!c) continue;
      const f = TAB_FEATURE[t];
      const locked = f !== null && !Features.isUnlocked(eco, f, s.level);
      c.lock.active = locked;
      (c.icon.getComponent(Sprite) as Sprite).grayscale = locked;
      opacity(c.icon).opacity = locked ? 120 : 255;
      let dot = false;
      if (!locked) {
        if (t === 'collect') dot = Album.claimable(s, eco) + Dex.claimable(s, eco) > 0;
        if (t === 'rank') dot = WeeklyGoal.claimable(s, eco, day) > 0;
        if (t === 'base') dot = HomeBase.canBuild(s, eco);
      }
      c.dot.active = dot;
    }
  }

  relabel(): void {
    for (const t of TABS) this.cells.get(t)?.label && ((this.cells.get(t) as { label: Label }).label.string = tr(TAB_LABEL[t]));
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
  private heart: Node;
  private avatar: Node;
  private frame: Node;
  private shownCoins = -1;
  private shownAvatar = '';

  constructor(parent: Node, actions: { coins: () => void; lives: () => void; settings: () => void; profile: () => void }) {
    this.node = box('topbar', parent, Screen.W, 120);
    at(this.node, 0, Screen.top - 76);
    const fade = img(this.node, 'kit/fade_down', Screen.W, 220, 'fade');
    fade.angle = 180;
    opacity(fade).opacity = 90;
    at(fade, 0, 40);
    const BW = Screen.W - 40;
    plate(this.node, 'skin/j_bar_top', BW, 92, 'bar');
    const L = -BW / 2;
    // 凹槽：从头像框右边到设置键左边
    const x1 = L + 118;
    const x2 = BW / 2 - 96;
    const well = plate(this.node, 'skin/j_inset', x2 - x1, 64, 'well');
    at(well, (x1 + x2) / 2, 1);
    // 金币：图标 + 数字（最多 7 位，不加逗号）+ 绿色加号
    // 去掉逗号后金币这一格可以窄一点，让给生命后面的倒计时（不然倒计时顶到设置键）
    const CW = 284;
    const coinTap = box('coins', this.node, CW, 92);
    at(coinTap, x1 + CW / 2, 0);
    this.coinIcon = img(coinTap, 'icon/coin', 62, 62, 'icon');
    at(this.coinIcon, -CW / 2 + 36, 2);
    this.coins = text(coinTap, '0', 38, { align: 'left' });
    at(this.coins.node, -CW / 2 + 72, 1);
    at(keyButton(coinTap, 'green', 'kit/ic_plus', 52, null, 0.62), CW / 2 - 32, 2);
    onTap(coinTap, actions.coins);
    const sep = tint(this.node, 3, 40, hex('#7FC4FF'), 'sep');
    opacity(sep).opacity = 110;
    at(sep, x1 + CW + 6, 1);
    // 生命：图标 + 数量，回满前后面跟一个小号倒计时
    const lw = x2 - x1 - CW - 10;
    const lifeTap = box('lives', this.node, lw, 92);
    at(lifeTap, x1 + CW + 10 + lw / 2, 0);
    this.heart = img(lifeTap, 'icon/heart', 62, 62, 'icon');
    at(this.heart, -lw / 2 + 36, 2);
    this.lives = text(lifeTap, '5/5', 38, { align: 'left' });
    at(this.lives.node, -lw / 2 + 72, 1);
    this.timer = text(lifeTap, '', 26, { align: 'left', color: hex('#CFE7FF') });
    onTap(lifeTap, actions.lives);
    at(keyButton(this.node, 'blue', 'skin/g_gear', 72, actions.settings), BW / 2 - 12 - 36, 1);
    // 头像框最后放，压在条的左端上
    this.frame = img(this.node, 'skin/j_avatar', 118, 115, 'avatarFrame');
    at(this.frame, L + 52, 0);
    this.avatar = img(this.frame, 'icon/avatar', 82, 82, 'avatar');
    onTap(this.frame, actions.profile);
  }

  refresh(): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const t = now();
    if (this.shownCoins !== s.coins) {
      const str = fmt(s.coins);
      this.coins.fontSize = str.length > 7 ? 32 : 38;
      this.coins.string = str;
      if (this.shownCoins >= 0) popIn(this.coins.node, 0, 0.2);
      this.shownCoins = s.coins;
    }
    // 集齐收藏的头像框：换成金色
    setImg(this.frame, Album.hasFrame(s) ? 'skin/j_avatar_gold' : 'skin/j_avatar', 118, 115);
    // 头像换成收藏生物（docs/01 5.9）
    const av = PlayerData.avatarOf(s);
    if (av !== this.shownAvatar) {
      this.shownAvatar = av;
      setImg(this.avatar, av ? `fish/${av}` : 'icon/avatar', 82, 82);
    }
    const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    let tail = '';
    if (Lives.isUnlimited(s, t)) {
      setImg(this.heart, 'icon/heart_inf', 62, 62);
      this.lives.string = '∞';
      tail = mmss(Lives.unlimitedLeft(s, t));
    } else {
      setImg(this.heart, 'icon/heart', 62, 62);
      const n = Lives.count(s, eco, t);
      const full = n >= eco.lives.max;
      this.lives.string = full ? `${n}/${eco.lives.max}` : String(n);
      if (!full) tail = mmss(Lives.secondsToNext(s, eco, t));
    }
    this.timer.string = tail;
    this.lives.updateRenderData(true);
    const lw = (this.lives.node.getComponent(UITransform) as UITransform).width;
    at(this.timer.node, this.lives.node.position.x + lw + 8, -3);
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
  tabbar!: TabBar;
  topbar!: TopBar;
  private registry = new Map<string, () => Page>();
  private built = new Map<string, Page>();
  private current: { name: string; page: Page } | null = null;
  private history: string[] = [];
  private lastTab: Tab = 'home';
  /** 没开放的页签显示的锁页（pages/lock.ts 提供，避免 ui 层引用页面层） */
  lockedTab: ((tab: Tab, feature: string) => Page) | null = null;

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
    this.tabbar = new TabBar(this.bars, (t) => this.go(t));
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

  /** 切页面。页签页互相切不进历史；子页面进历史，返回键回到上一页 */
  go(name: string, arg?: unknown): void {
    // 没开放的页签：换成这个页签的锁页（docs/01 5.3：灰的带锁，但可以点进去看锁页）
    const f = (TABS as string[]).includes(name) ? TAB_FEATURE[name as Tab] : null;
    if (f && this.lockedTab && !Features.isUnlocked(App.config.eco, f, App.save.data.level)) {
      const key = `${name}@lock`;
      const make = this.lockedTab;
      if (!this.registry.has(key)) this.register(key, () => make(name as Tab, f));
      name = key;
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
      if (next.tab === null) this.history.push(prev.name);
    }
    if (next.tab !== null) this.history = [];
    this.current = { name, page: next };
    next.node.active = true;
    next.show(arg);
    fadeIn(next.node, 0.15);
    // 页签之间切换：新页面从略大一点收回原大（和底栏的切换动效一起，有「切过来」的感觉；只放大不位移，边上不露底）
    Tween.stopAllByTag(PAGE_TAG, next.node);
    next.node.setScale(1, 1, 1);
    if (prev && next.tab !== null && prev.page.tab !== null) {
      next.node.setScale(1.035, 1.035, 1);
      tween(next.node).tag(PAGE_TAG).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'quadOut' }).start();
    }
    this.tabbar.node.active = next.tab !== null;
    this.topbar.node.active = next.topBar;
    if (next.tab !== null) {
      this.tabbar.select(next.tab);
      this.lastTab = next.tab;
    }
    this.refresh();
  }

  back(): void {
    if (!this.current || !this.current.page.back()) return;
    const prev = this.history.pop();
    this.go(prev ?? this.lastTab);
  }

  /** 存档变了以后调：当前页、顶栏、底栏红点一起刷新 */
  refresh(): void {
    // 各自兜住：一块出错不连累别的
    for (const [name, f] of [
      ['page', () => this.current?.page.refresh()],
      ['topbar', () => this.topbar.node.active && this.topbar.refresh()],
      ['tabbar', () => this.tabbar.node.active && this.tabbar.refresh()],
    ] as const) {
      try {
        f();
      } catch (e) {
        reportError(`${name}.refresh`, e);
      }
    }
  }

  /** 换语言：页面全部按新文案重建，回到当前页 */
  rebuild(topActions: ConstructorParameters<typeof TopBar>[1]): void {
    const name = this.current?.name ?? 'home';
    closeAllPopups();
    for (const p of this.built.values()) p.node.destroy();
    this.built.clear();
    this.current = null;
    this.history = [];
    this.topbar.node.destroy();
    this.tabbar.node.destroy();
    this.topbar = new TopBar(this.bars, topActions);
    this.tabbar = new TabBar(this.bars, (t) => this.go(t));
    this.go(name === 'game' || name === 'result' ? 'home' : name.replace('@lock', ''));
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

export function mainButtonBreath(n: Node): void {
  breathe(n, 0.03, 1.4);
}

export function width(n: Node): number {
  return (n.getComponent(UITransform) as UITransform).width;
}
