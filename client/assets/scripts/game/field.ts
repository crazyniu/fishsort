// 局内场地：气泡、气泡里的鱼、障碍（锁链、冰封、迷雾、结伴）、掉落。
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
  links: Node[];
  /** 已破 */
  gone: boolean;
  /** 还在候场队列里（掉落关） */
  queued: boolean;
}

const SILHOUETTE = new Color(30, 50, 90, 255);
const WHITE = new Color(255, 255, 255, 255);
/** 下层（被压住、还不能点）的气泡和鱼 */
const UNDER_BUBBLE = new Color(70, 105, 180, 255);
const UNDER_FISH = new Color(120, 135, 170, 255);
const FROST = new Color(225, 247, 255, 255);

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
  /** 重力模拟 */
  private pile!: Pile;
  private simOn = false;
  private lastLand = 0;

  get isLayered(): boolean {
    return this.layered;
  }

  spriteFor(sp: number): string {
    return `fish/${this.species[sp] ?? this.species[0]}`;
  }

  build(s: GameState): void {
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
    const onField = Math.min(this.lv.fieldCap > 0 ? this.lv.fieldCap : radii.length, radii.length);
    if (!covered) {
      this.fit(centers, radii, onField);
      this.shrinkToFit(radii, onField);
    } else {
      // 有遮挡的关卡：整体等比放大、居中，用满场地（相对位置和遮挡关系不变；用户 2026-11-16：场地尽量大）
      this.fillBox(centers, radii, centers.length);
      // 叠层关卡气泡本来就互相压着：半径再放大一点，鱼更大更好点（位置不动，遮挡关系照旧按层画）
      const boost = App.config.ui.field.layerBoost ?? 1;
      for (let i = 0; i < radii.length; i++) radii[i] *= boost;
    }
    // 下层先画
    const order = this.lv.bubbles.map((_, i) => i).sort((a, b) => this.lv.bubbles[a].layer - this.lv.bubbles[b].layer || a - b);
    this.views = new Array(this.lv.bubbles.length);
    for (const i of order) this.views[i] = this.make(i, centers[i], radii[i], s);
    this.sync(s, false);
    this.pile = this.newPile();
    this.pile.onLand = (id, speed) => this.landed(id, speed);
    if (covered) {
      // 有遮挡：按设计位置摆好，松手让重力接管（互相压着的绑成一组）
      this.views.forEach((v, i) => this.pile.add(i, v.home[0], v.home[1], v.r));
      this.regroup();
      this.run();
    } else {
      // 没遮挡：开局在场的气泡先藏在场地上沿外面，从低到高一个接一个放下来
      const first = this.views.map((_, i) => i).filter((i) => !this.views[i].queued).sort((a, b) => this.views[a].home[1] - this.views[b].home[1]);
      first.forEach((i, k) => {
        const v = this.views[i];
        at(v.node, v.home[0], this.h / 2 + v.r + 10);
        opacity(v.node).opacity = 0;
        tween(v.node)
          .delay(0.1 + k * App.config.ui.pile.stagger)
          .call(() => this.release(i, v.home[0]))
          .start();
      });
    }
  }

  private newPile(): Pile {
    const p = App.config.ui.pile;
    return new Pile(this.w, this.h, { gravity: p.gravity, damping: p.damping, substeps: p.substeps, iterations: p.iterations, gap: App.config.ui.field.gap / 2, sleepSpeed: p.sleepSpeed, sleepTime: p.sleepTime, landSpeed: p.landSpeed, separate: p.separate });
  }

  /** 把气泡 i 从场地上沿放下来（x 是横向位置），交给重力 */
  private release(i: number, x: number): void {
    const v = this.views[i];
    if (v.gone) return;
    const m = v.r + App.config.ui.field.gap;
    const px = Math.min(Math.max(x, -this.w / 2 + m), this.w / 2 - m);
    v.node.active = true;
    at(v.node, px, this.h / 2 + v.r + 10);
    const op = opacity(v.node);
    Tween.stopAllByTarget(op);
    op.opacity = 0;
    tween(op).to(0.12, { opacity: 255 }).start();
    this.pile.add(i, px, this.h / 2 + v.r + 10, v.r);
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

  /**
   * 没遮挡的关卡：先在内存里把同时在场的气泡（取最大的那几个）扔下去试一遍，堆得比场地高就把所有气泡等比缩小再试，
   * 保证真玩的时候堆不出场地
   */
  private shrinkToFit(radii: number[], n: number): void {
    const cfg = App.config.ui.pile;
    const limit = -this.h / 2 + this.h * cfg.maxHeight;
    for (let attempt = 0; attempt < 10; attempt++) {
      const big = [...radii].sort((a, b) => b - a).slice(0, n);
      const p = this.newPile();
      let top = -Infinity;
      // 一个接一个放（每 4 帧一个），放完再多等一会让它停稳
      for (let f = 0; f < n * 4 + 240 && (f < n * 4 || p.awake); f++) {
        if (f % 4 === 0 && f / 4 < n) {
          const i = f / 4;
          const m = big[i] + App.config.ui.field.gap;
          // 横向位置错开：用黄金角序列，不随机（同一关每次结果一样）
          const x = (((i * 0.618034) % 1) - 0.5) * (this.w - 2 * m);
          p.add(i, x, this.h / 2 + big[i] + 10, big[i]);
        }
        p.step(1 / 60);
      }
      for (let i = 0; i < n; i++) {
        const q = p.pos(i);
        if (q) top = Math.max(top, q[1] + big[i]);
      }
      if (top <= limit) return;
      for (let i = 0; i < radii.length; i++) radii[i] *= 0.95;
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
    const fill = img(body, 'kit/circle_white', r * 1.92, r * 1.92, 'fill');
    (fill.getComponent(Sprite) as Sprite).color = FROST;
    opacity(fill).opacity = 0;
    const skin = img(body, 'kit/bubble', r * 2, r * 2, 'skin');
    const n = d.fish.length;
    const fs = this.fishSize(n, r);
    const offs = this.offsets(n, r);
    const fish: (Node | null)[] = [];
    for (let k = 0; k < n; k++) {
      const sp = s.bubbles[i].fish[k];
      if (sp < 0) {
        fish.push(null);
        continue;
      }
      const f = img(body, this.spriteFor(sp), fs, fs, `fish${k}`);
      at(f, offs[k][0], offs[k][1]);
      f.setScale(k % 2 === 0 ? 1 : -1, 1, 1);
      this.swim(f, k);
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
      links: [],
      gone: false,
      queued: !s.bubbles[i].onField,
    };
    this.drawLinks(v, s.bubbles[i].pairs);
    if (d.chain > 0) {
      v.chain = img(body, 'skin/j_chain', r * 2.0, r * 1.7, 'chain');
      const badge = img(v.chain, 'kit/round_red', 64, 64, 'badge');
      at(badge, r * 0.62, -r * 0.62);
      v.chainLabel = text(badge, String(d.chain), 36);
    }
    if (d.ice.length > 0) {
      v.ice = img(body, 'icon/ice', r * 1.7, r * 1.7, 'ice');
      opacity(v.ice).opacity = 170;
    }
    // 气泡互相挨着，漂浮幅度小一点
    bob(body, 2.5, 2.6 + (i % 5) * 0.3, (i % 7) * 0.2);
    node.active = !v.queued;
    return v;
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

  /** 鱼在气泡里摆尾、轻轻游（docs/03 第 5 节界面动画约定） */
  private swim(f: Node, k: number): void {
    const sx = f.scale.x;
    tween(f)
      .delay((k % 4) * 0.25)
      .repeatForever(
        tween(f)
          .to(0.7, { scale: new Vec3(sx * 1.04, 0.96, 1), angle: 4 }, { easing: 'sineInOut' })
          .to(0.7, { scale: new Vec3(sx, 1, 1), angle: -3 }, { easing: 'sineInOut' }),
      )
      .start();
  }

  /** 状态变了以后同步：能不能点（被压住的压暗）、锁链数字、冰封、迷雾剪影 */
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
      opacity(v.fill).opacity = dimmed || !this.layered ? 0 : 150;
      for (const f of v.fish) {
        if (!f) continue;
        (f.getComponent(Sprite) as Sprite).color = b.fog && !isOpen ? SILHOUETTE : dimmed ? UNDER_FISH : WHITE;
      }
      if (v.chain) {
        if (b.chain > 0) {
          if (v.chainLabel) v.chainLabel.string = String(b.chain);
        } else this.breakChain(v);
      }
      if (v.ice && !b.frozen) this.melt(v);
    }
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

  private melt(v: View): void {
    const ice = v.ice;
    if (!ice) return;
    v.ice = null;
    tween(opacity(ice)).to(0.35, { opacity: 0 }).call(() => ice.destroy()).start();
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

  /** 掉落关：候场队头从场地上沿落下来（落点在刚破的那个气泡上方附近），掉在堆上，沿着别的气泡滚到位 */
  dropIn(b: number, freed: number, delay: number): void {
    const v = this.views[b];
    v.queued = false;
    const m = v.r + App.config.ui.field.gap;
    const fx0 = freed >= 0 ? this.views[freed].node.position.x : 0;
    const x = Math.min(Math.max(fx0 + (Math.random() - 0.5) * 60, -this.w / 2 + m), this.w / 2 - m);
    v.home = [x, this.h / 2 + v.r + 10];
    v.node.active = true;
    at(v.node, x, this.h / 2 + v.r + 10);
    opacity(v.node).opacity = 0;
    v.node.setSiblingIndex(this.node.children.length - 1);
    tween(v.node)
      .delay(delay + App.config.ui.drop.delay)
      .call(() => this.release(b, x))
      .start();
  }

  /** 洗牌：所有气泡转一圈，鱼换成新分布 */
  reshuffle(s: GameState): void {
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i];
      if (v.gone) continue;
      tween(v.body).by(0.5, { angle: 360 }, { easing: 'quadInOut' }).start();
      const n = v.fish.length;
      const fs = this.fishSize(n, v.r);
      for (let k = 0; k < n; k++) {
        const sp = s.bubbles[i].fish[k];
        const f = v.fish[k];
        if (sp === REMOVED || !f) continue;
        setImg(f, this.spriteFor(sp), fs, fs);
      }
      this.drawLinks(v, s.bubbles[i].pairs);
    }
    this.sync(s);
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
    this.onTapFish(i, best);
    void this.onBlocked;
  }

  blocked(b: number): void {
    this.onBlocked(b);
  }
}
