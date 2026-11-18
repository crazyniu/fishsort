// 选关（docs/01 5.7）。一页就是一个海域（20 关，4 列 × 5 行的格子）：标题是海域名，背景是这片海域的局内背景，
// 左右翻页就是换海域（用户 2026-11-17；原来是一条从下往上的长路线，关卡多了不好翻）。
// 已过关蓝色 + 绿勾；当前关绿色、会呼吸 +「当前」；挑战关紫色 + 小旗；没到的灰色带锁。打开时停在当前关那一页。
import { EventTouch, Label, Node, Tween, Vec3, tween } from 'cc';
import * as Daily from '../core/meta/daily';
import * as LevelCurve from '../core/gen/levelCurve';
import * as Meta from '../core/meta/meta';
import * as Seas from '../core/meta/seas';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { today } from '../services/clock';
import * as Flow from '../game/flow';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { at, box, capsule, fit, img, keyButton, lazyImg, onTap, opacity, slice, text } from '../ui/kit';
import { Screen } from '../ui/screen';
import { HEAD_BOTTOM, PAGE_BOTTOM, Page, pageHead, ui } from '../ui/shell';

const COLS = 4;
const ROWS = 5;
const PER_PAGE = COLS * ROWS;
/** 一格多大、关卡圆牌多大 */
const CELL = 158;
const NODE = 122;
/** 面板顶上写重玩次数的那一行多高 */
const HEAD_ROW = 48;
/** 手指横着划过这么远就翻页 */
const SWIPE = 70;

/** show 的参数里的 sea（从海图点进来时有）；Cocos 的 Babel 不认 as X | Y，用函数收窄 */
function seaArg(arg: unknown): number | undefined {
  if (typeof arg !== 'object' || arg === null) return undefined;
  const v = (arg as Record<string, unknown>).sea;
  return typeof v === 'number' ? v : undefined;
}

export class LevelsPage extends Page {
  private bg!: Node;
  private sea = '';
  private root!: Node;
  private view: Node | null = null;
  private replay: Label | null = null;
  private pageNo = 0;
  private downX = 0;

  build(root: Node): void {
    this.root = root;
    this.bg = box('bg', root);
    root.on(Node.EventType.TOUCH_START, (e: EventTouch) => (this.downX = e.getUILocation().x));
    root.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
      const dx = e.getUILocation().x - this.downX;
      if (Math.abs(dx) >= SWIPE) this.turn(dx < 0 ? 1 : -1);
    });
  }

  /** 一共几页：到当前关那一页为止，再往后多给一页（让人看到后面还有），不超过总关数 */
  private get pages(): number {
    const all = Math.ceil(App.config.levelCount / PER_PAGE);
    return Math.min(all, Math.floor((App.reach() - 1) / PER_PAGE) + 2);
  }

  /** arg.sea：从海图点进来的那个海域，停在它那一页；不给就停在当前关那一页 */
  override show(arg?: unknown): void {
    const sea = seaArg(arg);
    const from = sea !== undefined ? App.config.eco.seas?.[sea]?.levelFrom : undefined;
    this.pageNo = from !== undefined ? Math.floor((from - 1) / PER_PAGE) : Math.floor((App.save.data.level - 1) / PER_PAGE);
    this.pageNo = Math.min(this.pageNo, this.pages - 1);
    this.render(0);
  }

  /** 这一页是哪个海域（第 121 关起关卡文件在后半段循环，海域跟着关卡文件走） */
  private seaOf(first: number): number {
    const eco = App.config.eco;
    return Seas.forLevel(eco, Meta.levelFile(first, App.config.levelCount));
  }

  override refresh(): void {
    const s = App.save.data;
    Daily.roll(s, today());
    const left = Math.max(0, App.config.eco.replay.rewardedPerDay - s.daily.replay);
    if (this.replay?.isValid) this.replay.string = tr('LV_REPLAY_LEFT', left, App.config.eco.replay.rewardedPerDay);
  }

  private turn(d: number): void {
    const next = Math.max(0, Math.min(this.pages - 1, this.pageNo + d));
    if (next === this.pageNo) return;
    this.pageNo = next;
    sfx('tab');
    this.render(d);
  }

  /** 画这一页；dir 是翻页方向（1 往后、-1 往前、0 刚打开），新的一页从那一边滑进来 */
  private render(dir: number): void {
    this.view?.destroy();
    const v = box('view', this.root, Screen.W, Screen.H);
    this.view = v;
    const s = App.save.data;
    const first = this.pageNo * PER_PAGE + 1;
    // 页头写海域名；背景换成这片海域的局内背景
    const seaIdx = this.seaOf(first);
    const sea = App.config.eco.seas?.[seaIdx]?.id ?? 'shore';
    if (sea !== this.sea) {
      this.sea = sea;
      this.bg.destroyAllChildren();
      const bgH = Math.max(Screen.H, Screen.W * 1.5);
      lazyImg(this.bg, `bg/sea_${sea}`, (bgH * 1024) / 1536, bgH);
    }
    pageHead(v, tr(`ALBUM_BOOK_${seaIdx + 1}`));
    // 版面：页头下面到翻页键上面，是一块白色面板；面板顶上一行写今日重玩奖励还剩几次（原来是浮在面板上面的一根细条），
    // 下面是格子
    const navY = Screen.bottom + PAGE_BOTTOM + 50;
    const top = Screen.headTop - HEAD_BOTTOM - 16;
    const bottom = navY + 70;
    const panelH = Math.min(ROWS * CELL + 44 + HEAD_ROW, top - bottom);
    const rowH = (panelH - 44 - HEAD_ROW) / ROWS;
    const panelW = COLS * CELL + 44;
    const panel = slice(v, 'kit/panel_glass', panelW, panelH, 'grid');
    at(panel, 0, (top + bottom) / 2);
    this.replay = text(panel, '', 28);
    at(this.replay.node, 0, panelH / 2 - 22 - HEAD_ROW / 2 + 6);
    this.refresh();
    for (let i = 0; i < PER_PAGE; i++) {
      const cell = this.cell(panel, first + i);
      at(cell, (i % COLS - (COLS - 1) / 2) * CELL, panelH / 2 - 22 - HEAD_ROW - rowH * (Math.floor(i / COLS) + 0.5));
      if (first + i === s.level) fx.breathe(cell, 0.05, 1.2);
    }
    // 翻页：左右两个键，中间写这一页是第几关到第几关
    const range = capsule(v, 240, 64, null, `${first} - ${first + PER_PAGE - 1}`, 32);
    at(range.node, 0, navY);
    const prev = keyButton(v, 'blue', 'kit/ic_back', 84, () => this.turn(-1));
    at(prev, -190, navY);
    const next = keyButton(v, 'blue', 'kit/ic_back', 84, () => this.turn(1));
    at(next, 190, navY);
    (next.getChildByName('glyph') as Node).setScale(-1, 1, 1);
    for (const [key, off] of [[prev, this.pageNo === 0], [next, this.pageNo >= this.pages - 1]] as const) {
      if (!off) continue;
      // 翻到头了：键留着占位，变淡、点了没反应
      opacity(key).opacity = 90;
    }
    if (dir !== 0) {
      panel.setPosition(dir * 90, panel.position.y, 0);
      tween(panel).to(0.18, { position: new Vec3(0, panel.position.y, 0) }, { easing: 'quadOut' }).start();
      fx.fadeIn(panel, 0.18);
    } else {
      fx.popIn(panel, 0, 0.25);
    }
  }

  /** 一关的格子：圆牌 + 关卡号，上面的小标记说明状态 */
  private cell(parent: Node, n: number): Node {
    const s = App.save.data;
    const hard = LevelCurve.isChallenge(App.config.curve, Meta.levelFile(n, App.config.levelCount));
    const done = n < s.level;
    const cur = n === s.level;
    // 试玩模式下后面没打的关也能点开（App.reach）：和打过的一样上色，不打勾、不上锁
    const open = n <= App.reach();
    const holder = box(`lv${n}`, parent, CELL, CELL);
    const skin = cur ? 'skin/f_node_green' : !open ? 'skin/f_node_gray' : hard ? 'skin/f_node_purple' : 'skin/f_node_blue';
    const ball = img(holder, skin, NODE, NODE, 'ball');
    const num = text(ball, String(n), open ? 44 : 34);
    at(num.node, 0, open ? 8 : 24);
    fit(num, NODE - 30, open ? 44 : 34, 22);
    if (hard) {
      // 挑战关：左上角插一面小旗（没到的也插，提前看得到哪一关难）
      const flag = img(holder, 'skin/j_flag', 40, 43, 'flag');
      at(flag, -NODE * 0.36, NODE * 0.36);
    }
    if (done) {
      at(img(holder, 'kit/ic_check', 40, 40, 'check'), NODE * 0.36, NODE * 0.36);
    } else if (cur) {
      const tag = slice(holder, 'kit/btn_yellow', 96, 40, 'current');
      at(tag, 0, -NODE * 0.5 + 2);
      const l = text(tag, tr('LV_CURRENT'), 22);
      at(l.node, 0, 2);
      fit(l, 80, 22, 14);
    } else if (!open) {
      at(img(ball, 'kit/ic_lock', 32, 32, 'lock'), 0, -14);
    }
    onTap(holder, () => this.open(n, ball), { sound: null });
    return holder;
  }

  private open(n: number, ball: Node): void {
    if (n > App.reach()) {
      fx.shake(ball, 8);
      sfx('blocked');
      ui.toast(tr('LV_LOCKED'));
      return;
    }
    sfx('tap');
    Tween.stopAllByTarget(ball);
    Flow.startLevel(n);
  }
}
