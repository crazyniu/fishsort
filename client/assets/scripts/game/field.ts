// 局内场地：气泡、气泡里的鱼、障碍（锁链、冰封、迷雾、结伴）、掉落。
// 迷雾泡：鱼全显示成问号、蒙一层雾、角上的数字是「再破几个别的气泡显形」；冰封泡：向它依赖的气泡画冰晶连线（docs/01 第 4 节）。
// 气泡受重力（用户 2026-11-16）：位置每帧由 game/pile.ts 的模拟给出。没有遮挡的关卡，气泡开局一个接一个从上面落下堆起来，
// 破一个上面的就压下来，新气泡落在堆上；有遮挡的关卡按关卡数据摆好再松手，互相压着的气泡绑成一组一起动（遮挡关系不变）。
// 鱼的显示尺寸按气泡大小算，不小于 field.fishMin（用户 2026-11-16：鱼不能小，要好点）。
import { Color, EventTouch, Label, Node, Sprite, Tween, UITransform, Vec3, game, tween } from 'cc';
import { FIELD_H } from '../core/gen/levelGen';
import { GameState, REMOVED } from '../core/model/gameState';
import { LevelData } from '../core/model/levelData';
import * as Rules from '../core/rules/rules';
import { App } from '../services/app';
import { sfx } from '../services/audio';
import * as Alive from '../ui/alive';
import { CARD_ASPECT, miniCard } from '../ui/popups';
import { bob, ring, sparkle } from '../ui/fx';
import { at, box, img, opacity, setImg, text } from '../ui/kit';
import { Pile } from './pile';

interface View {
  node: Node;
  body: Node;
  skin: Node;
  /** 磨砂底：上层（能点）的气泡垫一层浅色，把下层透上来的鱼挡掉一些 */
  fill: Node;
  fish: (Node | null)[];
  offsets: [number, number][];
  r: number;
  home: [number, number];
  layer: number;
  chain: Node | null;
  chainLabel: Label | null;
  ice: Node | null;
  /** 厚冰（docs/01 9.3）：连着几个气泡；底下一排小冰晶，一颗代表一个还没破的（破一个少一颗） */
  iceAll: boolean;
  iceTotal: number;
  icePegs: Node[];
  /** 冰晶连线：连到每个依赖的气泡的一串冰晶，咬住依赖泡的那头是一簇冰刺；位置每帧跟着两头走 */
  iceLinks: { beads: Node[]; clamp: Node | null; dep: number }[];
  /** 迷雾：雾团、每条鱼位上的问号球、底下一排小泡泡（还要破几个别的气泡，一个小泡泡代表一个） */
  fog: Node | null;
  fogMarks: (Node | null)[];
  fogPips: Node[];
  fogMax: number;
  links: Node[];
  /** 已破 */
  gone: boolean;
  /** 还在候场队列里（掉落关） */
  queued: boolean;
}

const WHITE = new Color(255, 255, 255, 255);
/** 下层（被压住、还不能点）的气泡和鱼 */
const UNDER_BUBBLE = new Color(70, 105, 180, 255);
const UNDER_FISH = new Color(120, 135, 170, 255);
/** 排队泡里还没轮到的鱼：压暗一点，和排头分开 */
const WAIT_FISH = new Color(150, 165, 195, 255);
const FROST = new Color(225, 247, 255, 255);
/** 泡膜上转动的那层流光的颜色 */
const SHEEN = new Color(255, 200, 240, 255);
/** 幸运泡身后的金光 */
const LUCKY = new Color(255, 214, 90, 255);
/** 迷雾计数小泡泡的底色 */
const PIP = new Color(150, 205, 255, 255);
/** 冰晶连线：一节冰晶的长、宽（图是 120×68），相邻两节的间距（比长度短一点，首尾相接），咬住依赖泡的冰刺的大小 */
const ICE_BEAD = 40;
const ICE_BEAD_H = (ICE_BEAD * 68) / 120;
const ICE_GAP = 34;
const ICE_CLAMP = 44;

export class Field {
  node: Node;
  views: View[] = [];
  /** 场地的可用区域（本节点坐标，原点在中心） */
  private w: number;
  private h: number;
  private fishMin: number;
  private fishMax: number;

  constructor(
    parent: Node,
    w: number,
    h: number,
    private readonly lv: LevelData,
    private readonly species: string[],
    private readonly onTapFish: (b: number, k: number) => void,
    private readonly onBlocked: (b: number) => void,
  ) {
    this.w = w;
    this.h = h;
    this.node = box('field', parent, w, h);
    this.fishMin = App.config.ui.field.fishMin;
    this.fishMax = App.config.ui.field.fishMax;
    this.node.on(Node.EventType.TOUCH_END, (e: EventTouch) => this.touch(e));
  }

  /** 这关有叠层：上层气泡垫磨砂底 */
  private layered = false;
  /** 冰晶连线画在所有气泡上面的一层 */
  private linkLayer!: Node;
  /** 重力模拟 */
  private pile!: Pile;
  private simOn = false;
  private lastLand = 0;

  get isLayered(): boolean {
    return this.layered;
  }

  /** 第 sp 种鱼的生物 id */
  idFor(sp: number): string {
    return this.species[sp] ?? this.species[0];
  }

  spriteFor(sp: number): string {
    return `fish/${this.species[sp] ?? this.species[0]}`;
  }

  /**
   * restore = 撤销时按存下来的局面重画（docs/ux/route-2026-11-19.md 第 4 节）：每个气泡当时在哪（positions() 存的），
   * 破掉的不画、在场的直接摆回原位，不播开局落下来的进场
   */
  build(s: GameState, restore: ([number, number] | null)[] | null = null): void {
    const fw = Math.min(this.w, this.h / FIELD_H);
    const centers: [number, number][] = [];
    const radii: number[] = [];
    let covered = false;
    for (const d of this.lv.bubbles) {
      radii.push(d.r * fw);
      centers.push([(d.x - 0.5) * fw, (FIELD_H / 2 - d.y) * fw]);
      covered = covered || d.under.length > 0;
    }
    this.layered = covered;
    if (!covered) {
      // 掉落关：气泡大小的差别压小一半（1 条鱼的泡不那么小、5 条鱼的不那么大）。气泡的大小是按「最大的那几个同时在场」
      // 定的，差别大时平时在场的都偏小，场地上面空一截（用户 2026-11-17：开局气泡少、上面空）
      const k = App.config.ui.field.radiusSpread ?? 1;
      const mean = radii.reduce((x, y) => x + y, 0) / Math.max(1, radii.length);
      for (let i = 0; i < radii.length; i++) radii[i] = mean + (radii[i] - mean) * k;
    }
    const onField = Math.min(this.lv.fieldCap > 0 ? this.lv.fieldCap : radii.length, radii.length);
    if (!covered) {
      this.fit(centers, radii, onField);
    } else {
      // 有遮挡的关卡：整体等比放大、居中，用满场地（相对位置和遮挡关系不变；用户 2026-11-16：场地尽量大）
      this.fillBox(centers, radii, centers.length);
      // 叠层关卡气泡本来就互相压着：半径再放大一点，鱼更大更好点（位置不动，遮挡关系照旧按层画）
      const boost = App.config.ui.field.layerBoost ?? 1;
      for (let i = 0; i < radii.length; i++) radii[i] *= boost;
    }
    // 气泡受重力会沉到底：先在内存里试算，把气泡整体放大或缩小到「堆起来刚好占满场地」（用户 2026-11-16：上面不要空着）
    this.fillHeight(centers, radii, onField, covered);
    // 下层先画
    const order = this.lv.bubbles.map((_, i) => i).sort((a, b) => this.lv.bubbles[a].layer - this.lv.bubbles[b].layer || a - b);
    this.views = new Array(this.lv.bubbles.length);
    for (const i of order) this.views[i] = this.make(i, centers[i], radii[i], s);
    this.linkLayer = box('iceLinks', this.node, this.w, this.h);
    this.sync(s, false);
    this.twinkle();
    this.pile = this.newPile();
    this.pile.onLand = (id, speed) => this.landed(id, speed);
    if (restore) {
      this.views.forEach((v, i) => {
        if (v.gone || v.queued) return;
        const p = restore[i] ?? v.home;
        at(v.node, p[0], p[1]);
        this.pile.add(i, p[0], p[1], v.r);
      });
      if (covered) this.regroup();
      this.run();
    } else if (covered) {
      // 有遮挡：按设计位置摆好，松手让重力接管（互相压着的绑成一组）
      this.views.forEach((v, i) => this.pile.add(i, v.home[0], v.home[1], v.r));
      this.regroup();
      this.run();
    } else {
      // 没遮挡：开局在场的气泡先藏在场地上沿（只露出一点，不盖住上面的鱼缸），从低到高一个接一个放下来
      const first = this.views.map((_, i) => i).filter((i) => !this.views[i].queued).sort((a, b) => this.views[a].home[1] - this.views[b].home[1]);
      first.forEach((i, k) => {
        const v = this.views[i];
        at(v.node, v.home[0], this.h / 2 + v.r * 0.3);
        opacity(v.node).opacity = 0;
        tween(v.node)
          .delay(0.1 + k * App.config.ui.pile.stagger)
          .call(() => this.release(i, v.home[0]))
          .start();
      });
    }
  }

  /** 每个气泡现在在哪（本节点坐标）；破了的、还在候场的是 null。撤销时交回给 build */
  positions(): ([number, number] | null)[] {
    return this.views.map((v) => (v.gone || v.queued || !v.node.active ? null : [v.node.position.x, v.node.position.y]));
  }

  /** 隔一两秒，随便挑一个在场、能看清的气泡，在左上角的高光上闪一颗小星 */
  private twinkle(): void {
    tween(this.node)
      .delay(0.9 + Math.random() * 1.4)
      .call(() => {
        if (!this.node.isValid) return;
        const live = this.views.filter((v) => v && !v.gone && v.node.active && opacity(v.body).opacity > 240);
        if (live.length > 0) {
          const v = live[Math.floor(Math.random() * live.length)];
          const x = v.node.position.x + v.body.position.x - v.r * 0.5;
          const y = v.node.position.y + v.body.position.y + v.r * 0.52;
          sparkle(this.node, x, y, 2, v.r * 0.12, WHITE, Math.max(18, v.r * 0.22));
        }
        this.twinkle();
      })
      .start();
  }

  private newPile(): Pile {
    const p = App.config.ui.pile;
    return new Pile(this.w, this.h, { gravity: p.gravity, damping: p.damping, substeps: p.substeps, iterations: p.iterations, gap: App.config.ui.field.gap / 2, sleepSpeed: p.sleepSpeed, sleepTime: p.sleepTime, landSpeed: p.landSpeed, separate: p.separate, linkMin: p.linkMin, maxAwake: p.maxAwake });
  }

  /** 把气泡 i 从场地上沿放下来（x 是横向位置），交给重力 */
  private release(i: number, x: number): void {
    const v = this.views[i];
    if (v.gone) return;
    const m = v.r + App.config.ui.field.gap;
    const px = Math.min(Math.max(x, -this.w / 2 + m), this.w / 2 - m);
    v.node.active = true;
    at(v.node, px, this.h / 2 + v.r * 0.3);
    const op = opacity(v.node);
    Tween.stopAllByTarget(op);
    op.opacity = 0;
    tween(op).to(0.12, { opacity: 255 }).start();
    this.pile.add(i, px, this.h / 2 + v.r * 0.3, v.r);
    this.run();
  }

  /** 互相压着的气泡（关卡数据里的 under）绑成一组；破掉的不算 */
  private regroup(): void {
    const links: [number, number][] = [];
    this.lv.bubbles.forEach((d, i) => {
      for (const u of d.under) if (!this.views[i].gone && !this.views[u].gone) links.push([i, u]);
    });
    this.pile.regroup(links);
  }

  /** 模拟醒着的时候每帧推进一步，把气泡节点摆到算出来的位置；停稳了就停 */
  private run(): void {
    this.pile.wake();
    if (this.simOn) return;
    this.simOn = true;
    const p = { v: 0 };
    const tw = tween(p)
      .repeatForever(
        tween(p).to(1, { v: 1 }, {
          onUpdate: () => {
            if (!this.node.isValid) {
              tw.stop();
              return;
            }
            this.pile.step(Math.min(0.05, game.deltaTime));
            for (let i = 0; i < this.views.length; i++) {
              const v = this.views[i];
              if (v.gone) continue;
              const q = this.pile.pos(i);
              if (q) v.node.setPosition(q[0], q[1], 0);
            }
            this.placeIceLinks();
            if (!this.pile.awake) {
              this.simOn = false;
              tw.stop();
            }
          },
        }),
      )
      .start();
  }

  /** 气泡落地（落在地上或别的气泡上）：壳压扁一下再弹回，轻轻「咚」一声（隔太近的不重复响） */
  private landed(id: number, speed: number): void {
    const v = this.views[id];
    if (!v || v.gone) return;
    const k = Math.min(0.12, speed / 12000);
    Tween.stopAllByTarget(v.skin);
    v.skin.angle = 0;
    v.skin.setScale(1 + k, 1 - k, 1);
    tween(v.skin).to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' }).start();
    const now = Date.now();
    if (now - this.lastLand > 90) {
      this.lastLand = now;
      sfx('land', 0, Math.min(0.7, 0.25 + speed / 3000));
    }
  }

  /** 试算：气泡按 f 倍大小放进场地、让重力压实，返回堆的最高点（本节点坐标） */
  private settledTop(centers: [number, number][], radii: number[], n: number, covered: boolean, f: number): number {
    const p = this.newPile();
    const gap = App.config.ui.field.gap;
    let count = n;
    let r: number[];
    if (covered) {
      // 有遮挡：全部按设计位置（以场地中心为原点等比缩放）放好，互相压着的绑成组，松手
      r = radii.map((x) => x * f);
      count = r.length;
      centers.forEach((c, i) => p.add(i, c[0] * f, c[1] * f, r[i]));
      const links: [number, number][] = [];
      this.lv.bubbles.forEach((d, i) => d.under.forEach((u) => links.push([i, u])));
      p.regroup(links);
      for (let k = 0; k < 360 && p.awake; k++) p.step(1 / 60);
    } else {
      // 没遮挡：同时在场的取最大的那几个，一个接一个从上沿放下来（每 4 帧一个），放完等它停稳。
      // 横向位置用黄金分割序列错开，不用随机数：同一关每次结果一样
      r = [...radii]
        .sort((a, b) => b - a)
        .slice(0, n)
        .map((x) => x * f);
      for (let k = 0; k < n * 4 + 300 && (k < n * 4 || p.awake); k++) {
        if (k % 4 === 0 && k / 4 < n) {
          const i = k / 4;
          const m = r[i] + gap;
          p.add(i, (((i * 0.618034) % 1) - 0.5) * Math.max(0, this.w - 2 * m), this.h / 2 + r[i] * 0.3, r[i]);
        }
        p.step(1 / 60);
      }
    }
    let top = -Infinity;
    for (let i = 0; i < count; i++) {
      const q = p.pos(i);
      if (q) top = Math.max(top, q[1] + r[i]);
    }
    return top;
  }

  /**
   * 把气泡整体放大或缩小，让压实后的堆高刚好到场地高度的 pile.maxHeight：二分找倍数。
   * 上限是气泡半径不超过 field.maxRadius（气泡少的关卡不会无限放大），以及最大的气泡不超过半个场地宽
   */
  private fillHeight(centers: [number, number][], radii: number[], n: number, covered: boolean): void {
    const cfg = App.config.ui;
    const limit = -this.h / 2 + this.h * cfg.pile.maxHeight;
    const biggest = radii.reduce((m, x) => Math.max(m, x), 1);
    const cap = Math.min(cfg.field.maxRadius, this.w * 0.24) / biggest;
    let lo = 0.5;
    let hi = Math.max(lo, cap);
    if (this.settledTop(centers, radii, n, covered, hi) > limit) {
      for (let k = 0; k < 7; k++) {
        const mid = (lo + hi) / 2;
        if (this.settledTop(centers, radii, n, covered, mid) > limit) hi = mid;
        else lo = mid;
      }
      hi = lo;
    }
    for (let i = 0; i < radii.length; i++) {
      radii[i] *= hi;
      if (covered) centers[i] = [centers[i][0] * hi, centers[i][1] * hi];
    }
  }

  /** 前 n 个气泡的外接框等比放大到场地大小（不超过 maxScale 倍）并居中 */
  private fillBox(c: [number, number][], r: number[], n: number, stretch = false): void {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < n; i++) {
      x0 = Math.min(x0, c[i][0] - r[i]);
      x1 = Math.max(x1, c[i][0] + r[i]);
      y0 = Math.min(y0, c[i][1] - r[i]);
      y1 = Math.max(y1, c[i][1] + r[i]);
    }
    if (!isFinite(x0)) return;
    const pad = App.config.ui.field.gap * 2;
    const k = Math.min((this.w - pad) / (x1 - x0), (this.h - pad) / (y1 - y0), App.config.ui.field.maxScale);
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    for (let i = 0; i < c.length; i++) {
      c[i] = [(c[i][0] - mx) * k, (c[i][1] - my) * k];
      r[i] *= k;
    }
    if (!stretch) return;
    // 自由摆放的关卡：宽度先顶满时，再把气泡在竖直方向拉开铺满剩下的高度（半径不变，位置关系不要紧）
    let top = -Infinity;
    let bot = Infinity;
    for (let i = 0; i < n; i++) {
      top = Math.max(top, c[i][1] + r[i]);
      bot = Math.min(bot, c[i][1] - r[i]);
    }
    const spanC = top - bot;
    const room = this.h - pad;
    if (spanC >= room) return;
    let cTop = -Infinity;
    let cBot = Infinity;
    for (let i = 0; i < n; i++) {
      cTop = Math.max(cTop, c[i][1]);
      cBot = Math.min(cBot, c[i][1]);
    }
    if (cTop - cBot < 1) return;
    const ky = (cTop - cBot + room - spanC) / (cTop - cBot);
    for (let i = 0; i < c.length; i++) c[i] = [c[i][0], c[i][1] * ky];
  }

  /** 放大气泡让开局在场的 n 个占掉场地的 fill 比例，然后推开重叠 */
  private fit(centers: [number, number][], radii: number[], n: number): void {
    const cfg = App.config.ui.field;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += Math.PI * radii[i] * radii[i];
    if (sum <= 0) return;
    const k = Math.min(Math.max(Math.sqrt((cfg.fill * this.w * this.h) / sum), 1), cfg.maxScale);
    for (let i = 0; i < radii.length; i++) radii[i] *= k;
    this.relax(centers, radii, n, []);
    this.fillBox(centers, radii, n, true);
    this.relax(centers, radii, n, []);
  }

  private relax(c: [number, number][], r: number[], n: number, pinned: number[]): void {
    const cfg = App.config.ui.field;
    for (let step = 0; step < cfg.relaxSteps; step++) {
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const dx = c[j][0] - c[i][0];
          const dy = c[j][1] - c[i][1];
          const dist = Math.hypot(dx, dy);
          const need = r[i] + r[j] + cfg.gap;
          if (dist >= need) continue;
          const [ux, uy] = dist > 0.01 ? [dx / dist, dy / dist] : [Math.cos(i * 2.4), Math.sin(i * 2.4)];
          const push = need - dist;
          const fi = pinned.includes(i);
          const fj = pinned.includes(j);
          if (fi && fj) continue;
          const ki = fi ? 0 : fj ? 1 : 0.5;
          const kj = fj ? 0 : fi ? 1 : 0.5;
          c[i] = [c[i][0] - ux * push * ki, c[i][1] - uy * push * ki];
          c[j] = [c[j][0] + ux * push * kj, c[j][1] + uy * push * kj];
        }
      }
      for (let i = 0; i < n; i++) {
        if (pinned.includes(i)) continue;
        const m = r[i] + cfg.gap;
        c[i] = [Math.min(Math.max(c[i][0], -this.w / 2 + m), this.w / 2 - m), Math.min(Math.max(c[i][1], -this.h / 2 + m), this.h / 2 - m)];
      }
    }
  }

  private fishSize(n: number, r: number): number {
    const k = n === 1 ? 1.0 : n === 2 ? 0.92 : n === 3 ? 0.84 : n === 4 ? 0.76 : 0.7;
    return Math.min(Math.max(r * k, this.fishMin), this.fishMax);
  }

  private offsets(n: number, r: number): [number, number][] {
    if (n === 1) return [[0, 0]];
    const d = r * (n === 2 ? 0.4 : n === 3 ? 0.46 : 0.5);
    return Array.from({ length: n }, (_, k) => {
      const a = (Math.PI * 2 * k) / n + (n === 2 ? 0 : Math.PI / 2);
      return [Math.cos(a) * d, Math.sin(a) * d * (n === 2 ? 0.55 : 1)];
    });
  }

  private make(i: number, c: [number, number], r: number, s: GameState): View {
    const d = this.lv.bubbles[i];
    const node = box(`bubble${i}`, this.node, r * 2, r * 2);
    at(node, c[0], c[1]);
    // 漂浮只动 body：node 的位置留给掉落、推开
    const body = box('body', node, r * 2, r * 2);
    // 泡膜（磨砂底 + 气泡皮 + 流光）放在 shell 里一起软软地晃；里面的鱼另外自己游，不跟着变形
    const shell = box('shell', body, r * 2, r * 2);
    const fill = img(shell, 'kit/circle_white', r * 1.92, r * 1.92, 'fill');
    (fill.getComponent(Sprite) as Sprite).color = FROST;
    opacity(fill).opacity = 0;
    const skin = img(shell, 'kit/bubble', r * 2, r * 2, 'skin');
    // 流光：再叠一层淡淡染色的气泡皮慢慢转，彩虹边和高光沿着泡边流动
    const sheen = img(shell, 'kit/bubble', r * 2, r * 2, 'sheen');
    (sheen.getComponent(Sprite) as Sprite).color = SHEEN;
    opacity(sheen).opacity = 80;
    sheen.angle = (i * 47) % 360;
    tween(sheen)
      .repeatForever(tween(sheen).by(9 + (i % 4) * 1.5, { angle: i % 2 === 0 ? 360 : -360 }))
      .start();
    const n = d.fish.length;
    const fs = this.fishSize(n, r);
    const queue = d.queue === true && n > 1;
    // 排队泡：鱼从左上到右下叠成一串，下标最大的（排头）在最右下、画在最上面；后面的被前面的压住一点，看得出先后
    const offs: [number, number][] = queue ? Array.from({ length: n }, (_, k) => [((k / (n - 1)) * 2 - 1) * r * (n === 2 ? 0.26 : 0.38), -((k / (n - 1)) * 2 - 1) * r * (n === 2 ? 0.2 : 0.3)]) : this.offsets(n, r);
    const fish: (Node | null)[] = [];
    for (let k = 0; k < n; k++) {
      const sp = s.bubbles[i].fish[k];
      if (sp < 0) {
        fish.push(null);
        continue;
      }
      const f = img(body, this.spriteFor(sp), fs, fs, `fish${k}`);
      at(f, offs[k][0], offs[k][1]);
      f.setScale(queue || k % 2 === 0 ? 1 : -1, 1, 1);
      // 按轮廓类的小动作（一直在动：鱼摆尾、螃蟹摇着摇着夹两下、水母一缩一伸……），都会眨眼（ui/alive.ts）
      const id = this.species[sp] ?? this.species[0];
      Alive.idle(f, Alive.shapeOf(id), k);
      Alive.blink(f, id, fs);
      fish.push(f);
    }
    const v: View = {
      node,
      body,
      skin,
      fill,
      fish,
      offsets: offs,
      r,
      home: [c[0], c[1]],
      layer: d.layer,
      chain: null,
      chainLabel: null,
      ice: null,
      iceAll: d.iceAll === true,
      iceTotal: d.ice.length,
      icePegs: [],
      iceLinks: [],
      fog: null,
      fogMarks: [],
      fogPips: [],
      fogMax: Math.max(1, d.fog),
      links: [],
      // 鱼已经取光的气泡（撤销重画时才会有）：不画
      gone: s.bubbles[i].count() === 0,
      queued: !s.bubbles[i].onField,
    };
    this.drawLinks(v, s.bubbles[i].pairs);
    // 锁链、冰都按局面画（开局和关卡数据一样；撤销重画时锁链可能已经少了几环、冰已经裂了几道）
    const st = s.bubbles[i];
    if (st.chain > 0) {
      v.chain = img(body, 'skin/j_chain', r * 2.0, r * 1.7, 'chain');
      const badge = img(v.chain, 'kit/round_red', 64, 64, 'badge');
      at(badge, r * 0.62, -r * 0.62);
      v.chainLabel = text(badge, String(st.chain), 36);
    }
    if (d.ice.length > 0 && st.frozen) {
      // 厚冰：全部连着的气泡破了才化，冰更厚（不那么透），按裂了几道换图（art/briefs/ui_skin/thick_ice.txt）
      const left = v.iceAll ? Rules.iceLeft(s, st) : d.ice.length;
      const broken = Math.min(2, Math.max(0, d.ice.length - left));
      v.ice = img(body, v.iceAll ? `icon/ice_thick${broken}` : 'icon/ice', r * 1.7, r * 1.7, 'ice');
      opacity(v.ice).opacity = v.iceAll ? 215 : 170;
      for (const dep of d.ice) v.iceLinks.push({ beads: [], clamp: null, dep });
      if (v.iceAll) {
        const n = left;
        for (let k = 0; k < n; k++) {
          const peg = img(body, 'skin/j_ice_bead', 44, 25, 'icePeg');
          at(peg, (k - (n - 1) / 2) * 48, -r * 0.92);
          v.icePegs.push(peg);
        }
      }
    }
    if (s.bubbles[i].fog > 0) this.addFog(v, s.bubbles[i].fog);
    // 气泡互相挨着，漂浮幅度小一点；泡膜像果冻一样慢慢鼓一下、扁一下（每个错开，不齐步）
    bob(body, 1.5, 2.6 + (i % 5) * 0.3, (i % 7) * 0.2);
    const t = 1.5 + (i % 5) * 0.17;
    tween(shell)
      .delay((i % 6) * 0.23)
      .repeatForever(
        tween(shell)
          .to(t, { scale: new Vec3(1.025, 0.975, 1) }, { easing: 'sineInOut' })
          .to(t, { scale: new Vec3(0.98, 1.02, 1) }, { easing: 'sineInOut' }),
      )
      .start();
    node.active = !v.queued && !v.gone;
    return v;
  }

  /** 迷雾：鱼藏起来，气泡里蒙一团雾，每条鱼的位置放一个一模一样的问号球，右下角是还差几次显形（docs/ux/game.md） */
  private addFog(v: View, left: number): void {
    const fs = this.fishSize(v.fish.length, v.r);
    v.fog = img(v.body, 'skin/j_fog', v.r * 2.12, v.r * 2.12, 'fog');
    opacity(v.fog).opacity = this.fogOpacity(v, left);
    v.fogMarks = v.fish.map((f, k) => {
      if (!f) return null;
      opacity(f).opacity = 0;
      // 问号画在图里（Codex 出图），不再叠字
      const m = img(v.body, 'skin/j_mystery', fs * 0.86, fs * 0.86, `fogMark${k}`);
      at(m, v.offsets[k][0], v.offsets[k][1]);
      return m;
    });
    // 还差几次显形：气泡下沿一排小泡泡，别处每破一个气泡，这里就破一个（用户 2026-11-16：数字角标看不懂）
    // 小泡泡要一眼看得见：实心浅蓝圆点上叠气泡的高光，骑在气泡下沿，画在问号球上面
    const size = Math.min(34, Math.max(24, v.r * 0.26));
    const step = size * 1.18;
    for (let i = 0; i < left; i++) {
      const pip = img(v.body, 'kit/circle_white', size, size, `fogPip${i}`);
      (pip.getComponent(Sprite) as Sprite).color = PIP;
      img(pip, 'skin/j_bubble', size * 1.08, size * 1.08, 'shine');
      at(pip, (i - (left - 1) / 2) * step, -v.r * 0.86);
      bob(pip, 2, 1.4 + i * 0.2, i * 0.3);
      v.fogPips.push(pip);
    }
  }

  /** 雾随计数变淡：数字越小越透 */
  private fogOpacity(v: View, left: number): number {
    return Math.round(255 * (0.42 + 0.58 * Math.min(1, left / v.fogMax)));
  }

  /** 迷雾每淡一层：数字跳一下、雾变薄；数到 0 显形：雾散开，问号一个个翻成真的鱼 */
  private syncFog(v: View, left: number, animate: boolean): void {
    if (!v.fog) return;
    // 多出来的小泡泡一个个破掉（从右往左）
    while (v.fogPips.length > left) {
      const pip = v.fogPips.pop() as Node;
      Tween.stopAllByTarget(pip);
      if (!animate) {
        pip.destroy();
        continue;
      }
      tween(pip).to(0.1, { scale: new Vec3(1.5, 1.5, 1) }, { easing: 'quadOut' }).call(() => pip.destroy()).start();
      tween(opacity(pip)).to(0.1, { opacity: 0 }).start();
      if (v.node.active) {
        const px = v.node.position.x + v.body.position.x + pip.position.x;
        const py = v.node.position.y + v.body.position.y + pip.position.y;
        sparkle(this.node, px, py, 5, 26, new Color(235, 245, 255, 255), 18);
      }
    }
    if (left > 0) {
      tween(opacity(v.fog)).to(animate ? 0.25 : 0, { opacity: this.fogOpacity(v, left) }).start();
      return;
    }
    const fog = v.fog;
    v.fog = null;
    tween(fog).to(0.3, { scale: new Vec3(1.25, 1.25, 1) }, { easing: 'quadOut' }).call(() => fog.destroy()).start();
    tween(opacity(fog)).to(0.3, { opacity: 0 }).start();
    v.fogMarks.forEach((m, k) => {
      const f = v.fish[k];
      if (m) {
        tween(m).delay(k * 0.05).to(0.14, { scale: new Vec3(0, 1, 1) }).call(() => m.destroy()).start();
      }
      if (f) {
        const sx = f.scale.x;
        tween(opacity(f)).delay(0.12 + k * 0.05).to(0.12, { opacity: 255 }).start();
        tween(f).delay(0.12 + k * 0.05).to(0.1, { scale: new Vec3(sx * 1.25, 1.25, 1) }).to(0.16, { scale: new Vec3(sx, 1, 1) }, { easing: 'backOut' }).start();
      }
    });
    v.fogMarks = [];
    if (v.node.active) sparkle(this.node, v.node.position.x, v.node.position.y, 10, v.r, new Color(235, 240, 255, 255));
  }

  /**
   * 冰晶连线：一串冰晶，从冰封泡的边排到依赖泡的边，咬住依赖泡的那头是一簇冰刺（看得出「这头连的是谁」）；
   * 两头的气泡动了就跟着动；解冻或任一头不在场就收起
   */
  private placeIceLinks(): void {
    for (const v of this.views) {
      if (!v || v.iceLinks.length === 0) continue;
      for (const l of v.iceLinks) {
        const o = this.views[l.dep];
        const on = !v.gone && v.node.active && !!v.ice && !!o && !o.gone && o.node.active;
        if (!on) {
          for (const b of l.beads) b.active = false;
          if (l.clamp) l.clamp.active = false;
          continue;
        }
        const ax = v.node.position.x;
        const ay = v.node.position.y;
        const dx = o.node.position.x - ax;
        const dy = o.node.position.y - ay;
        const dist = Math.hypot(dx, dy) || 1;
        const ux = dx / dist;
        const uy = dy / dist;
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        // 冰晶从冰封泡的边排到依赖泡的边，顺着连线方向首尾相接；冰刺骑在依赖泡的边上
        const from = v.r * 0.9;
        const to = dist - o.r * 0.92;
        const len = Math.max(ICE_GAP, to - from - ICE_CLAMP * 0.3);
        const n = Math.min(16, Math.max(1, Math.round(len / ICE_GAP)));
        while (l.beads.length < n) l.beads.push(img(this.linkLayer, 'skin/j_ice_bead', ICE_BEAD, ICE_BEAD_H, 'iceBead'));
        l.beads.forEach((bead, k) => {
          bead.active = k < n;
          if (k >= n) return;
          const t = from + (len * (k + 0.5)) / n;
          bead.setPosition(ax + ux * t, ay + uy * t, 0);
          bead.angle = angle;
        });
        if (!l.clamp) l.clamp = img(this.linkLayer, 'skin/j_frost', ICE_CLAMP, (ICE_CLAMP * 128) / 120, 'iceClamp');
        l.clamp.active = true;
        l.clamp.setPosition(ax + ux * to, ay + uy * to, 0);
      }
    }
  }

  private drawLinks(v: View, pairs: number[][]): void {
    for (const l of v.links) l.destroy();
    v.links = [];
    for (const [a, b] of pairs) {
      const [ax, ay] = v.offsets[a];
      const [bx, by] = v.offsets[b];
      const len = Math.hypot(bx - ax, by - ay);
      const link = img(v.body, 'kit/round_white', len, 10, 'link');
      (link.getComponent(Sprite) as Sprite).color = new Color(255, 120, 190, 230);
      at(link, (ax + bx) / 2, (ay + by) / 2);
      link.angle = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
      link.setSiblingIndex(1);
      v.links.push(link);
    }
  }

  /** 状态变了以后同步：能不能点（被压住的压暗）、锁链数字、冰封与连线、迷雾计数 */
  sync(s: GameState, animate = true): void {
    const open = new Set(Rules.openBubbles(s));
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i];
      if (v.gone) continue;
      const b = s.bubbles[i];
      const isOpen = open.has(i);
      // 被压住的（下层）：气泡染成深一点的蓝、鱼压暗、整颗缩小一点，和能点的上层一眼分开（用户 2026-11-16）
      const dimmed = !isOpen && b.onField;
      const op = opacity(v.body);
      const target = dimmed ? 215 : 255;
      const sc = dimmed ? 0.93 : 1;
      Tween.stopAllByTarget(op);
      if (animate) {
        tween(op).to(0.2, { opacity: target }).start();
        tween(v.body).to(0.2, { scale: new Vec3(sc, sc, 1) }, { easing: 'quadOut' }).start();
      } else {
        op.opacity = target;
        v.body.setScale(sc, sc, 1);
      }
      (v.skin.getComponent(Sprite) as Sprite).color = dimmed ? UNDER_BUBBLE : WHITE;
      // 被压住的不带流光，和能点的一眼分开
      const sheen = v.skin.parent?.getChildByName('sheen');
      if (sheen) opacity(sheen).opacity = dimmed ? 0 : 80;
      opacity(v.fill).opacity = dimmed || !this.layered ? 0 : 150;
      const front = b.queue ? b.front() : -1;
      v.fish.forEach((f, k) => {
        if (!f) return;
        (f.getComponent(Sprite) as Sprite).color = dimmed ? UNDER_FISH : front >= 0 && k !== front ? WAIT_FISH : WHITE;
      });
      if (v.chain) {
        if (b.chain > 0) {
          if (v.chainLabel) v.chainLabel.string = String(b.chain);
        } else this.breakChain(v);
      }
      if (v.ice && !b.frozen) this.melt(v);
      this.syncFog(v, b.fog, animate);
    }
    this.placeIceLinks();
  }

  private breakChain(v: View): void {
    const c = v.chain;
    if (!c) return;
    v.chain = null;
    v.chainLabel = null;
    tween(c).to(0.25, { scale: new Vec3(1.3, 1.3, 1) }).call(() => c.destroy()).start();
    tween(opacity(c)).to(0.25, { opacity: 0 }).start();
    sparkle(this.node, v.node.position.x, v.node.position.y, 8, v.r, new Color(200, 210, 230, 255));
  }

  private dropIceLinks(v: View): void {
    for (const l of v.iceLinks) {
      for (const bead of l.beads) bead.destroy();
      if (l.clamp) l.clamp.destroy();
    }
    v.iceLinks = [];
  }

  /**
   * 厚冰裂一层（连着的气泡破了一个，还没全破；left = 还差几个）：换成裂了几道的冰面图、底下的小冰晶少一颗、
   * 冰面缩一下弹回、掉几粒冰碴
   */
  crackIce(b: number, delay: number, left: number): void {
    const v = this.views[b];
    if (!v || v.gone || !v.ice) return;
    const ice = v.ice;
    const broken = Math.min(2, Math.max(1, v.iceTotal - left));
    tween(ice)
      .delay(delay)
      .call(() => {
        if (!ice.isValid) return;
        setImg(ice, `icon/ice_thick${broken}`, v.r * 1.7, v.r * 1.7);
        while (v.icePegs.length > left) {
          const peg = v.icePegs.pop() as Node;
          tween(peg).to(0.18, { scale: new Vec3(0.2, 0.2, 1) }).call(() => peg.destroy()).start();
        }
        sparkle(this.node, v.node.position.x, v.node.position.y, 5, v.r * 0.8, new Color(200, 245, 255, 255));
      })
      .to(0.08, { scale: new Vec3(0.9, 0.9, 1) })
      .to(0.2, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  }

  private melt(v: View): void {
    const ice = v.ice;
    if (!ice) return;
    v.ice = null;
    for (const peg of v.icePegs) peg.destroy();
    v.icePegs = [];
    tween(opacity(ice)).to(0.35, { opacity: 0 }).call(() => ice.destroy()).start();
    this.dropIceLinks(v);
    sparkle(this.node, v.node.position.x, v.node.position.y, 10, v.r, new Color(180, 240, 255, 255));
  }

  /** 鱼在本节点坐标系里的位置 */
  fishPos(b: number, k: number): [number, number] {
    const v = this.views[b];
    if (!v.node.active) return [v.home[0], this.h / 2 + 80];
    const o = v.offsets[k] ?? [0, 0];
    return [v.node.position.x + v.body.position.x + o[0], v.node.position.y + v.body.position.y + o[1]];
  }

  /** 把一条鱼从气泡里拿出来（交给飞行层）；候场里的气泡没有画面，就在场地上方新做一条 */
  take(b: number, k: number, sp: number): { node: Node; fromField: boolean } {
    const v = this.views[b];
    const f = v.fish[k];
    v.fish[k] = null;
    for (const l of v.links) l.destroy();
    v.links = [];
    // 迷雾里的鱼：点了才知道是什么，问号撤掉、鱼现出来
    const mark = v.fogMarks[k];
    if (mark) {
      mark.destroy();
      v.fogMarks[k] = null;
    }
    if (f) opacity(f).opacity = 255;
    if (f && v.node.active) {
      Tween.stopAllByTarget(f);
      return { node: f, fromField: true };
    }
    f?.destroy();
    const fs = this.fishSize(1, v.r);
    const n = img(null, this.spriteFor(sp), fs * 0.8, fs * 0.8, 'fish');
    return { node: n, fromField: false };
  }

  /** 点中气泡里的鱼：气泡被「拔」一下，扁一下再弹回（不打断它别的位移动画） */
  wobble(b: number): void {
    const v = this.views[b];
    if (!v || v.gone || !v.node.active) return;
    tween(v.node)
      .to(0.05, { scale: new Vec3(1.07, 0.93, 1) })
      .to(0.18, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  }

  /** 一圈波纹：从 (cx, cy) 往外，气泡壳依次鼓一下（连击升档时全场跟着动；只动壳，不碰位置和鱼） */
  ripple(cx: number, cy: number, amp = 0.12, speed = 1500): void {
    for (const v of this.views) {
      if (v.gone || !v.node.active) continue;
      const d = Math.hypot(v.node.position.x - cx, v.node.position.y - cy);
      const k = 1 + amp;
      tween(v.skin)
        .delay(d / speed)
        .to(0.09, { scale: new Vec3(k, k, 1) }, { easing: 'quadOut' })
        .to(0.22, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
        .start();
    }
  }

  pop(b: number): void {
    const v = this.views[b];
    v.gone = true;
    this.dropIceLinks(v);
    const n = v.node;
    // 从重力模拟里拿掉：压在它上面的气泡这就往下落；原来和它绑在一起的重新分组
    if (this.pile.has(b)) {
      this.pile.remove(b);
      this.regroup();
      this.run();
    }
    if (!n.active) {
      n.destroy();
      return;
    }
    ring(this.node, n.position.x, n.position.y, v.r, v.r * 2.6, new Color(200, 245, 255, 255));
    sparkle(this.node, n.position.x, n.position.y, 10, v.r * 1.2);
    tween(n).to(0.12, { scale: new Vec3(1.18, 1.18, 1) }).to(0.1, { scale: new Vec3(0.2, 0.2, 1) }).call(() => n.destroy()).start();
    tween(opacity(n)).delay(0.12).to(0.1, { opacity: 0 }).start();
  }

  /**
   * 稀客（docs/01 3.4）：这关宝箱要给的那张收藏卡，做成一张小卡（稀有度框 + 生物，身后一圈稀有度颜色的光）钉在第 i 个气泡的边上。
   * 画在场地最上层（被压着的气泡也看得见这张卡），每帧跟着气泡走（guestFollow）。不放进气泡里和鱼挤在一起：
   * 普通卡的生物本来就是局内的鱼，放进去分不出哪条是卡（2026-11-17 出图时发现）。气泡破了由 GameView 放它出来
   */
  addGuest(i: number, id: string, rarity: string, glow: Color): Node {
    const v = this.views[i];
    const w = Math.max(84, v.r * 0.74);
    const h = w * CARD_ASPECT;
    const holder = box('guest', this.node, w, h);
    const g = img(holder, 'kit/fx_glow', w * 2.1, w * 2.1, 'glow');
    (g.getComponent(Sprite) as Sprite).color = glow;
    opacity(g).opacity = 220;
    tween(g)
      .repeatForever(tween(g).to(0.8, { scale: new Vec3(1.15, 1.15, 1) }, { easing: 'sineInOut' }).to(0.8, { scale: new Vec3(1, 1, 1) }, { easing: 'sineInOut' }))
      .start();
    // Codex 画的小卡框（和奖品格里的卡同一套），原点在卡的下沿
    const card = miniCard(holder, id, rarity, w);
    at(card, 0, -h / 2);
    holder.angle = -8;
    tween(holder)
      .repeatForever(tween(holder).to(1, { angle: 8 }, { easing: 'sineInOut' }).to(1, { angle: -8 }, { easing: 'sineInOut' }))
      .start();
    this.guestFollow(holder, i);
    return holder;
  }

  /** 稀客小卡跟着气泡：钉在气泡右上沿；气泡还在候场（没落到场上）时先藏起来 */
  guestFollow(holder: Node, i: number): void {
    const v = this.views[i];
    if (!v || v.gone) return;
    holder.active = v.node.active;
    const p = v.node.position;
    holder.setPosition(p.x + v.r * 0.62, p.y + v.r * 0.55, 0);
    holder.setSiblingIndex(this.node.children.length - 1);
  }

  /** 掉落关：候场队头从场地上沿落下来（落点在刚破的那个气泡上方附近），掉在堆上，沿着别的气泡滚到位 */
  dropIn(b: number, freed: number, delay: number): void {
    const v = this.views[b];
    v.queued = false;
    const m = v.r + App.config.ui.field.gap;
    // 冰封泡落在它依赖的气泡上方，挨着好画连线；别的落在刚破的那个气泡上方附近
    const dep = this.lv.bubbles[b].ice.map((d) => this.views[d]).filter((o) => o && !o.gone && o.node.active)[0];
    const fx0 = dep ? dep.node.position.x : freed >= 0 ? this.views[freed].node.position.x : 0;
    const x = Math.min(Math.max(fx0 + (Math.random() - 0.5) * 60, -this.w / 2 + m), this.w / 2 - m);
    v.home = [x, this.h / 2 + v.r * 0.3];
    v.node.active = true;
    at(v.node, x, this.h / 2 + v.r * 0.3);
    opacity(v.node).opacity = 0;
    v.node.setSiblingIndex(this.node.children.length - 1);
    this.linkLayer.setSiblingIndex(this.node.children.length - 1);
    tween(v.node)
      .delay(delay + App.config.ui.drop.delay)
      .call(() => this.release(b, x))
      .start();
  }

  /** 洗牌：所有气泡转一圈，鱼换成新分布 */
  /** 洗牌动画中：气泡在转，鱼正在换，先不收点击 */
  spinning = false;

  /**
   * 洗牌（用户 2026-11-17：气泡疯狂旋转，然后停止）：所有气泡一起越转越快（约 0.35 秒转一圈半），
   * 转到最快时把鱼换成洗好的，再越转越慢、过头一点晃回来停住，一共约 1 秒；音效也截成 1 秒（tools/audio/kenney.py）
   */
  reshuffle(s: GameState): void {
    const live = this.views.map((v, i) => [v, i] as const).filter(([v]) => v && !v.gone);
    this.spinning = true;
    for (const [v] of live) {
      Tween.stopAllByTarget(v.body);
      v.body.angle = 0;
      v.body.setPosition(0, 0, 0);
      bob(v.body, 1.5, 2.6, 0);
    }
    const swap = () => {
      for (const [v, i] of live) {
        const n = v.fish.length;
        const fs = this.fishSize(n, v.r);
        for (let k = 0; k < n; k++) {
          const sp = s.bubbles[i].fish[k];
          const f = v.fish[k];
          if (sp === REMOVED || !f) continue;
          setImg(f, this.spriteFor(sp), fs, fs);
          // 换了鱼：眼皮和小动作也跟着换
          const flip = f.scale.x < 0 ? -1 : 1;
          Tween.stopAllByTarget(f);
          for (const c of f.children.slice()) if (c.name === 'lid') { Tween.stopAllByTarget(c); c.destroy(); }
          f.setScale(flip, 1, 1);
          f.angle = 0;
          const id = this.species[sp] ?? this.species[0];
          Alive.idle(f, Alive.shapeOf(id), k);
          Alive.blink(f, id, fs);
        }
        this.drawLinks(v, s.bubbles[i].pairs);
      }
      this.sync(s);
    };
    live.forEach(([v], j) => {
      const dir = j % 2 === 0 ? 1 : -1;
      // 用一个代理对象转角度，不和气泡身上别的动画（浮动）抢
      const spin = { a: 0 };
      tween(spin)
        .to(0.35, { a: 540 * dir }, { easing: 'quadIn', onUpdate: () => (v.body.angle = spin.a) })
        .call(() => {
          if (j === 0) swap();
        })
        .to(0.45, { a: 1080 * dir + 14 * dir }, { easing: 'quadOut', onUpdate: () => (v.body.angle = spin.a) })
        .to(0.12, { a: 1080 * dir - 6 * dir }, { easing: 'sineInOut', onUpdate: () => (v.body.angle = spin.a) })
        .to(0.1, { a: 1080 * dir }, { easing: 'sineOut', onUpdate: () => (v.body.angle = spin.a) })
        .call(() => {
          v.body.angle = 0;
          if (j === 0) this.spinning = false;
        })
        .start();
    });
    if (live.length === 0) {
      swap();
      this.spinning = false;
    }
  }

  /** 提示：给一条鱼套光圈 */
  hint(b: number, k: number): Node | null {
    const v = this.views[b];
    if (!v || v.gone || !v.node.active) return null;
    const o = v.offsets[k] ?? [0, 0];
    const fs = this.fishSize(v.fish.length, v.r);
    const h = img(v.body, 'kit/hint_ring', fs * 1.5, fs * 1.5, 'hint');
    at(h, o[0], o[1]);
    tween(h)
      .repeatForever(tween(h).to(0.45, { scale: new Vec3(1.15, 1.15, 1) }).to(0.45, { scale: new Vec3(1, 1, 1) }))
      .start();
    return h;
  }

  /**
   * 幸运泡（docs/01 9.3）：气泡外面套一圈慢慢转的金圈，带奖励的那条鱼头上一个小礼物。
   * 返回的节点挂在气泡上，气泡破了跟着没；点到那条鱼时由 GameView 收掉（unlucky）
   */
  addLucky(b: number, k: number): Node | null {
    const v = this.views[b];
    if (!v || v.gone) return null;
    const holder = box('lucky', v.body, v.r * 2, v.r * 2);
    const glow = img(holder, 'kit/fx_glow', v.r * 2.7, v.r * 2.7, 'glow');
    (glow.getComponent(Sprite) as Sprite).color = LUCKY;
    opacity(glow).opacity = 120;
    glow.setSiblingIndex(0);
    const ringNode = img(holder, 'icon/lucky_ring', v.r * 2.16, v.r * 2.16, 'ring');
    tween(ringNode)
      .repeatForever(tween(ringNode).by(14, { angle: -360 }))
      .start();
    tween(glow)
      .repeatForever(tween(glow).to(0.9, { scale: new Vec3(1.08, 1.08, 1) }, { easing: 'sineInOut' }).to(0.9, { scale: new Vec3(0.96, 0.96, 1) }, { easing: 'sineInOut' }))
      .start();
    const o = v.offsets[k] ?? [0, 0];
    const fs = this.fishSize(v.fish.length, v.r);
    const gs = Math.max(34, fs * 0.5);
    const gift = img(holder, 'icon/gift', gs, gs, 'gift');
    at(gift, o[0] + fs * 0.3, o[1] + fs * 0.34);
    bob(gift, 3, 1.2, 0);
    // 金圈垫在鱼后面（不挡鱼），礼物在最上面
    holder.setSiblingIndex(1);
    gift.removeFromParent();
    v.body.addChild(gift);
    gift.name = 'luckyGift';
    return holder;
  }

  /** 幸运泡的奖励拿走了：金圈、礼物收掉；返回礼物在本节点坐标系里的位置（奖励从这里飞出去） */
  unlucky(b: number): [number, number] {
    const v = this.views[b];
    const gift = v.body.getChildByName('luckyGift');
    const holder = v.body.getChildByName('lucky');
    const x = v.node.position.x + v.body.position.x + (gift ? gift.position.x : 0);
    const y = v.node.position.y + v.body.position.y + (gift ? gift.position.y : 0);
    gift?.destroy();
    if (holder) {
      tween(opacity(holder)).to(0.25, { opacity: 0 }).call(() => holder.destroy()).start();
    }
    return [x, y];
  }

  shakeBubble(b: number): void {
    const v = this.views[b];
    if (!v) return;
    Tween.stopAllByTarget(v.skin);
    v.skin.setScale(1, 1, 1);
    tween(v.skin).to(0.05, { angle: 6 }).to(0.08, { angle: -6 }).to(0.06, { angle: 3 }).to(0.05, { angle: 0 }).start();
  }

  /** 点在哪个气泡的哪条鱼上：圆形命中，上层优先；没开放的气泡交给 onBlocked */
  private touch(e: EventTouch): void {
    const p = e.getUILocation();
    const local = (this.node.getComponent(UITransform) as UITransform).convertToNodeSpaceAR(new Vec3(p.x, p.y, 0));
    const hits = this.views
      .map((v, i) => ({ v, i }))
      .filter(({ v }) => !v.gone && v.node.active)
      .filter(({ v }) => Math.hypot(local.x - v.node.position.x, local.y - v.node.position.y) <= v.r * 1.02)
      .sort((a, b) => b.v.layer - a.v.layer || b.i - a.i);
    if (hits.length === 0) return;
    const { v, i } = hits[0];
    let best = -1;
    let bestD = Infinity;
    v.fish.forEach((f, k) => {
      if (!f) return;
      const o = v.offsets[k];
      const d = Math.hypot(local.x - v.node.position.x - o[0], local.y - v.node.position.y - o[1]);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    });
    if (best < 0) return;
    // 排队泡：点在哪条上都算点排头（能取的只有它）
    if (this.lv.bubbles[i].queue === true) for (let k = v.fish.length - 1; k >= 0; k--) if (v.fish[k]) { best = k; break; }
    this.onTapFish(i, best);
    void this.onBlocked;
  }

  blocked(b: number): void {
    this.onBlocked(b);
  }
}
