// 选关（定版图 02，docs/01 5.7、docs/09 第 4 节）。一条从下往上蜿蜒的路线：
// 已过关蓝色 + 绿勾 + 这关首通给的家园星星（普通 1、挑战关 2）；当前关绿色发光 +「当前」；
// 挑战关紫色奖杯台 +「挑战」旗；没到的灰色带锁。打开时自动滚到当前关。
// 路线可能有几百关，只给屏幕附近的关建节点（滚动时增删）。
import { EventTouch, Node, Sprite, Tween, UITransform, Vec3, tween } from 'cc';
import * as Daily from '../core/meta/daily';
import * as HomeBase from '../core/meta/homeBase';
import * as LevelCurve from '../core/gen/levelCurve';
import * as Meta from '../core/meta/meta';
import * as Seas from '../core/meta/seas';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import { today } from '../services/clock';
import * as Flow from '../game/flow';
import * as fx from '../ui/fx';
import { tr } from '../ui/i18n';
import { at, box, hex, iconButton, img, lazyImg, slice, text } from '../ui/kit';
import { Screen } from '../ui/screen';
import { Page, ui } from '../ui/shell';

/** 与 tools/art/kit.mjs 的 path_wave 一致：一个周期 4 关，每关 STEP 高，左右摆 AMP */
const STEP = 200;
const AMP = 150;
const PERIOD = 4;
const TILE_W = 420;
const NODE = 150;
/** 当前关之后再画几关（灰的） */
const AHEAD = 12;

export class LevelsPage extends Page {
  readonly tab = null;
  private content!: Node;
  private bg!: Node;
  private sea = '';
  private deco: Node[] = [];
  private pathLayer!: Node;
  private nodeLayer!: Node;
  private replayLabel!: ReturnType<typeof text>;
  private built = new Map<number, Node>();
  private tiles = new Map<number, Node>();
  private last = 1;
  private y = 0;
  private minY = 0;
  private maxY = 0;
  private dragging = false;
  private moved = 0;
  private vel = 0;
  private lastMove = 0;
  /** 惯性滚动的 tween 目标 */
  private scroll = { y: 0 };

  build(root: Node): void {
    this.bg = box('bg', root);
    this.content = box('content', root, Screen.W, Screen.H);
    this.pathLayer = box('path', this.content);
    this.nodeLayer = box('nodes', this.content);
    // 两边游的鱼（不跟着滚）
    for (const [id, x, y, sz] of [
      ['c03', -Screen.W / 2 + 90, -60, 150],
      ['c05', Screen.W / 2 - 90, 220, 120],
      ['c01', Screen.W / 2 - 100, -380, 170],
    ] as const) {
      const f = img(root, `fish/${id}`, sz, sz, `deco_${id}`);
      at(f, x, y);
      if (x > 0) f.setScale(-1, 1, 1);
      this.deco.push(f);
    }
    // 顶部：返回 + 标题 + 今日重玩奖励剩余
    const top = Screen.top;
    const head = box('head', root, Screen.W, 220);
    at(head, 0, top - 110);
    // 标题区垫一条和海面同色的底，往下淡出：路线上的关卡滚到这里就被盖住，不和标题、重玩条叠在一起
    const yTop = Screen.H / 2 - (top - 110);
    const yBot = -170;
    const band = img(head, 'kit/fade_white', Screen.W, yTop - yBot, 'band');
    at(band, 0, (yTop + yBot) / 2);
    (band.getComponent(Sprite) as Sprite).color = hex('#3A9CEB');
    const back = iconButton(head, 'kit/round_blue', 'kit/ic_back', 96, () => ui.back());
    at(back, -Screen.W / 2 + 70, 40);
    const title = slice(head, 'kit/title_page', 380, 100, 'title');
    at(title, 0, 40);
    at(text(title, tr('H_FEAT_LEVELS'), 56).node, 0, 4);
    const replay = slice(head, 'kit/capsule', 360, 56, 'replay');
    at(replay, 0, -40);
    this.replayLabel = text(replay, '', 28);

    root.on(Node.EventType.TOUCH_START, (e: EventTouch) => this.onDown(e));
    root.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => this.onMove(e));
    root.on(Node.EventType.TOUCH_END, (e: EventTouch) => this.onUp(e, true));
    root.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => this.onUp(e, false));
  }

  /** 第 n 关在路线坐标里的位置（第 1 关在原点，往上走） */
  private pos(n: number): [number, number] {
    const i = n - 1;
    return [AMP * Math.sin((2 * Math.PI * i) / PERIOD), i * STEP];
  }

  override show(): void {
    const s = App.save.data;
    // 背景跟当前关所在的海域
    const eco = App.config.eco;
    const sea = eco.seas?.[Seas.forLevel(eco, Meta.levelFile(s.level, App.config.levelCount))]?.id ?? 'shore';
    if (sea !== this.sea) {
      this.sea = sea;
      this.bg.destroyAllChildren();
      const bgH = Math.max(Screen.H, Screen.W * 1.5);
      lazyImg(this.bg, `bg/sea_${sea}`, (bgH * 1024) / 1536, bgH);
    }
    this.deco.forEach((f, i) => {
      Tween.stopAllByTarget(f);
      fx.bob(f, 14, 2.2 + i * 0.4, i * 0.5);
    });
    this.last = s.level + AHEAD;
    for (const n of this.built.values()) n.destroy();
    this.built.clear();
    for (const t of this.tiles.values()) t.destroy();
    this.tiles.clear();
    // 内容 y 偏移：第 1 关在屏幕下方 1/4 处；最上面一关不越过标题
    const bottom = Screen.bottom + 200;
    const topLimit = Screen.top - 330;
    this.maxY = bottom;
    this.minY = Math.min(bottom, topLimit - this.pos(this.last)[1]);
    // 自动滚到当前关：放在屏幕中间偏下
    const want = Screen.bottom + Screen.H * 0.4 - this.pos(s.level)[1];
    this.setY(Math.max(this.minY, Math.min(this.maxY, want)));
    this.refresh();
    // 当前关进场：弹一下，光环扩散
    const cur = this.built.get(s.level);
    if (cur) {
      fx.popIn(cur, 0.1, 0.35);
      fx.delay(this.node, 0.35, () => {
        const [x, y] = this.pos(s.level);
        fx.ring(this.nodeLayer, x, y, 80, 220);
      });
    }
  }

  override refresh(): void {
    const s = App.save.data;
    Daily.roll(s, today());
    const left = Math.max(0, App.config.eco.replay.rewardedPerDay - s.daily.replay);
    this.replayLabel.string = tr('LV_REPLAY_LEFT', left, App.config.eco.replay.rewardedPerDay);
  }

  override hide(): void {
    Tween.stopAllByTarget(this.scroll);
    for (const f of this.deco) Tween.stopAllByTarget(f);
  }

  private setY(y: number): void {
    this.y = y;
    this.content.setPosition(0, y, 0);
    this.cull();
  }

  /** 只留屏幕上下各多一屏范围里的节点和路线片 */
  private cull(): void {
    const lo = Screen.bottom - this.y - STEP * 2;
    const hi = Screen.top - this.y + STEP * 2;
    const first = Math.max(1, Math.floor(lo / STEP) + 1);
    const lastVisible = Math.min(this.last, Math.ceil(hi / STEP) + 1);
    for (const [n, node] of this.built) {
      if (n < first || n > lastVisible) {
        node.destroy();
        this.built.delete(n);
      }
    }
    for (let n = first; n <= lastVisible; n++) if (!this.built.has(n)) this.built.set(n, this.makeNode(n));
    // 路线片：每片管 PERIOD 关，从第 1 关往下多画半关当起点，最后一关往上收住
    const tileH = STEP * PERIOD;
    const tFirst = Math.max(0, Math.floor(lo / tileH));
    const tLast = Math.min(Math.floor((this.pos(this.last)[1] - 1) / tileH), Math.floor(hi / tileH));
    for (const [k, t] of this.tiles) {
      if (k < tFirst || k > tLast) {
        t.destroy();
        this.tiles.delete(k);
      }
    }
    for (let k = tFirst; k <= tLast; k++) {
      if (this.tiles.has(k)) continue;
      const t = img(this.pathLayer, 'kit/path_wave', TILE_W, tileH, `tile${k}`);
      at(t, 0, k * tileH + tileH / 2);
      this.tiles.set(k, t);
    }
  }

  private makeNode(n: number): Node {
    const s = App.save.data;
    const eco = App.config.eco;
    const hard = LevelCurve.isChallenge(App.config.curve, Meta.levelFile(n, App.config.levelCount));
    const done = n < s.level;
    const cur = n === s.level;
    const [x, y] = this.pos(n);
    const holder = box(`lv${n}`, this.nodeLayer, NODE, NODE);
    at(holder, x, y);
    const size = cur ? NODE * 1.2 : NODE;
    if (cur) {
      const glow = img(holder, 'kit/fx_glow', size * 1.9, size * 1.9, 'glow');
      fx.breathe(glow, 0.08, 1.4);
      const rays = fx.rays(holder, size * 2);
      rays.setSiblingIndex(0);
    }
    const skin = cur ? 'kit/node_current' : done ? (hard ? 'kit/node_challenge_done' : 'kit/node_done') : hard ? 'kit/node_challenge' : 'kit/node_locked';
    const ball = img(holder, skin, size, size, 'ball');
    const num = text(ball, String(n), cur ? 64 : 52, { outline: done || cur || hard ? undefined : hex('#5E6B7D') });
    at(num.node, 0, done ? 12 : 6);
    if (hard) {
      // 挑战关：插一面「挑战」旗
      const flag = box('flag', holder, 150, 90);
      at(flag, -size * 0.32, size * 0.55);
      const f = img(flag, 'kit/flag', 72, 81, 'pole');
      at(f, -30, 0);
      const tag = slice(flag, 'kit/btn_red', 110, 50, 'tag');
      at(tag, 30, 16);
      at(text(tag, tr('UI_CHALLENGE'), 28).node, 0, 3);
      fx.wiggle(flag, 4, 2.2);
    }
    if (done) {
      const check = img(holder, 'kit/round_green', 54, 54, 'check');
      at(check, size * 0.36, size * 0.34);
      img(check, 'kit/ic_check', 34, 34, 'ic');
      // 这关首通给了几颗家园星星
      const k = HomeBase.starsForLevel(eco, hard);
      for (let i = 0; i < k; i++) {
        const st = img(ball, 'icon/star', 36, 36, 'star');
        at(st, (i - (k - 1) / 2) * 34, -34);
      }
    } else if (cur) {
      const tag = slice(holder, 'kit/btn_yellow', 128, 54, 'current');
      at(tag, 0, -size * 0.5);
      at(text(tag, tr('LV_CURRENT'), 30).node, 0, 3);
    } else {
      const lock = img(ball, 'kit/ic_lock', 40, 40, 'lock');
      at(lock, 0, -36);
    }
    return holder;
  }

  // ---------------------------------------------------------------- 拖动、点关卡
  private onDown(_e: EventTouch): void {
    Tween.stopAllByTarget(this.scroll);
    this.dragging = true;
    this.moved = 0;
    this.vel = 0;
    this.lastMove = Date.now();
  }

  private onMove(e: EventTouch): void {
    if (!this.dragging) return;
    const dy = e.getUIDelta().y;
    this.moved += Math.abs(dy);
    const nowMs = Date.now();
    const dt = Math.max(1, nowMs - this.lastMove) / 1000;
    this.vel = this.vel * 0.3 + (dy / dt) * 0.7;
    this.lastMove = nowMs;
    // 越界时阻尼
    let y = this.y + dy;
    if (y > this.maxY) y = this.y + dy * 0.35;
    if (y < this.minY) y = this.y + dy * 0.35;
    this.setY(y);
  }

  private onUp(e: EventTouch, fire: boolean): void {
    if (!this.dragging) return;
    this.dragging = false;
    if (fire && this.moved < 12) {
      this.tapAt(e);
      return;
    }
    // 松手惯性 + 回弹
    const idle = (Date.now() - this.lastMove) / 1000;
    const v = idle > 0.1 ? 0 : this.vel;
    const target = Math.max(this.minY, Math.min(this.maxY, this.y + v * 0.35));
    const dur = Math.min(0.9, 0.25 + Math.abs(target - this.y) / 2500);
    this.scroll.y = this.y;
    tween(this.scroll)
      .to(dur, { y: target }, { easing: 'quartOut', onUpdate: () => this.setY(this.scroll.y) })
      .start();
  }

  private tapAt(e: EventTouch): void {
    const p = e.getUILocation();
    const local = this.nodeLayer.getComponent(UITransform);
    if (!local) return;
    const q = local.convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    for (const [n, node] of this.built) {
      const dx = q.x - node.position.x;
      const dy = q.y - node.position.y;
      if (dx * dx + dy * dy > (NODE * 0.6) ** 2) continue;
      this.open(n, node);
      return;
    }
  }

  private open(n: number, node: Node): void {
    const s = App.save.data;
    const ball = node.getChildByName('ball') ?? node;
    if (n > s.level) {
      fx.shake(ball, 8);
      sfx('blocked');
      ui.toast(tr('LV_LOCKED'));
      return;
    }
    sfx('tap');
    Tween.stopAllByTarget(ball);
    tween(ball)
      .to(0.06, { scale: new Vec3(0.92, 0.92, 1) })
      .to(0.1, { scale: new Vec3(1.05, 1.05, 1) })
      .to(0.06, { scale: new Vec3(1, 1, 1) })
      .call(() => Flow.startLevel(n))
      .start();
  }
}
