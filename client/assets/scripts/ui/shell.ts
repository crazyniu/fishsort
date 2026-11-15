// 界面外壳：分层、页面切换、底栏、顶栏、提示条。
// 底栏固定 商店 · 家园 · 主页 · 收藏 · 排行（docs/01 5.3）；顶栏只在主页（docs/09 第 4 节）。
import { Label, Node, Sprite, Tween, UITransform, Vec3, tween } from 'cc';
import * as Album from '../core/meta/album';
import * as Dex from '../core/meta/dex';
import * as Features from '../core/meta/features';
import * as HomeBase from '../core/meta/homeBase';
import * as Lives from '../core/meta/lives';
import * as WeeklyGoal from '../core/meta/weeklyGoal';
import { App } from '../services/app';
import { now, today } from '../services/clock';
import { breathe, fadeIn, popIn } from './fx';
import { tr } from './i18n';
import { COLOR, Capsule, at, blockInput, box, capsule, img, onTap, opacity, redDot, setImg, slice, text, tint } from './kit';
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
export const TABBAR_H = 150;

export abstract class Page {
  node!: Node;
  /** 页签页给出所属页签；子页面（选关、抽奖、每日挑战、局内）为 null，不显示底栏 */
  abstract readonly tab: Tab | null;
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

class TabBar {
  node: Node;
  private sel: Node;
  private cells = new Map<Tab, { node: Node; icon: Node; label: Label; dot: Node; lock: Node }>();
  private current: Tab = 'home';

  constructor(parent: Node, private readonly onSelect: (t: Tab) => void) {
    const w = Screen.W - 16;
    this.node = slice(parent, 'kit/tabbar', w, TABBAR_H, 'tabbar');
    at(this.node, 0, -Screen.H / 2 + TABBAR_H / 2 + Math.max(4, Screen.safeBottom));
    blockInput(this.node);
    const cw = w / TABS.length;
    this.sel = slice(this.node, 'kit/tab_sel', cw + 6, TABBAR_H + 18, 'sel');
    TABS.forEach((t, i) => {
      const x = -w / 2 + cw * (i + 0.5);
      if (i > 0) at(img(this.node, 'kit/tab_divider', 4, 80, 'div'), -w / 2 + cw * i, 0);
      const cell = box(t, this.node, cw, TABBAR_H);
      at(cell, x, 0);
      const icon = img(cell, TAB_ICON[t], 84, 84, 'icon');
      at(icon, 0, 16);
      const label = text(cell, tr(TAB_LABEL[t]), 28);
      at(label.node, 0, -46);
      const dot = redDot(cell, 38, 50);
      const lock = img(cell, 'kit/ic_lock', 40, 40, 'lock');
      at(lock, 30, -6);
      this.cells.set(t, { node: cell, icon, label, dot, lock });
      onTap(cell, () => this.onSelect(t), { press: 0.92 });
    });
    this.select('home', false);
  }

  select(t: Tab, animate = true): void {
    const prev = this.cells.get(this.current);
    if (prev) {
      Tween.stopAllByTarget(prev.icon);
      prev.icon.setScale(1, 1, 1);
      at(prev.icon, 0, 16);
    }
    this.current = t;
    const c = this.cells.get(t) as { node: Node; icon: Node };
    const x = c.node.position.x;
    Tween.stopAllByTarget(this.sel);
    if (animate) tween(this.sel).to(0.18, { position: new Vec3(x, 6, 0) }, { easing: 'quadOut' }).start();
    else at(this.sel, x, 6);
    tween(c.icon).to(0.18, { scale: new Vec3(1.3, 1.3, 1), position: new Vec3(0, 34, 0) }, { easing: 'backOut' }).start();
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

/** 主页顶栏：头像 · 金币「＋」· 生命 · 设置。没有整条底板，各项悬浮，顶上垫一层淡渐变（docs/01 5.3） */
class TopBar {
  node: Node;
  private coins: Capsule;
  private lives: Capsule;
  private avatar: Node;
  private frame: Node;
  private shownCoins = -1;

  constructor(parent: Node, actions: { coins: () => void; lives: () => void; settings: () => void; profile: () => void }) {
    this.node = box('topbar', parent, Screen.W, 120);
    at(this.node, 0, Screen.top - 64);
    const fade = img(this.node, 'kit/fade_down', Screen.W, 200, 'fade');
    fade.angle = 180;
    opacity(fade).opacity = 70;
    at(fade, 0, 30);
    this.avatar = img(this.node, 'icon/avatar', 104, 104, 'avatar');
    at(this.avatar, -Screen.W / 2 + 76, 0);
    this.frame = img(this.avatar, 'kit/fx_ring', 118, 118, 'frame');
    (this.frame.getComponent(Sprite) as Sprite).color = COLOR.yellow;
    onTap(this.avatar, actions.profile);
    this.coins = capsule(this.node, 230, 64, 'icon/coin', '0');
    at(this.coins.node, -95, 0);
    const plus = img(this.coins.node, 'kit/round_green', 54, 54, 'plus');
    img(plus, 'kit/ic_plus', 34, 34, 'glyph');
    at(plus, 104, 0);
    onTap(this.coins.node, actions.coins);
    this.lives = capsule(this.node, 190, 64, 'icon/heart', '5/5');
    at(this.lives.node, 160, 0);
    onTap(this.lives.node, actions.lives);
    const gear = img(this.node, 'kit/round_blue', 86, 86, 'gear');
    img(gear, 'kit/ic_gear', 50, 50, 'glyph');
    at(gear, Screen.W / 2 - 62, 0);
    onTap(gear, actions.settings);
  }

  refresh(): void {
    const s = App.save.data;
    const eco = App.config.eco;
    const t = now();
    if (this.shownCoins !== s.coins) {
      this.coins.set(String(s.coins));
      if (this.shownCoins >= 0) popIn(this.coins.label.node, 0, 0.2);
      this.shownCoins = s.coins;
    }
    this.frame.active = Album.hasFrame(s);
    if (Lives.isUnlimited(s, t)) {
      const left = Lives.unlimitedLeft(s, t);
      this.lives.set(`∞ ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
      if (this.lives.icon) setImg(this.lives.icon, 'icon/heart_inf', 66, 66);
    } else {
      if (this.lives.icon) setImg(this.lives.icon, 'icon/heart', 66, 66);
      const n = Lives.count(s, eco, t);
      const next = Lives.secondsToNext(s, eco, t);
      this.lives.set(n >= eco.lives.max ? `${n}/${eco.lives.max}` : `${n} · ${Math.floor(next / 60)}:${String(next % 60).padStart(2, '0')}`);
    }
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
    this.tabbar.node.active = next.tab !== null;
    this.topbar.node.active = name === 'home';
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
    this.go(name === 'game' || name === 'result' ? 'home' : name);
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
