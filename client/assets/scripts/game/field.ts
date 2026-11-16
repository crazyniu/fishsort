// 局内场地：气泡、气泡里的鱼、障碍（锁链、冰封、迷雾、结伴）、掉落。
// 布局沿用 Godot 版：没有遮挡的关卡把气泡放大到铺满场地再推开重叠；有遮挡的关卡按关卡数据摆。
// 鱼的显示尺寸按气泡大小算，不小于 field.fishMin（用户 2026-11-16：鱼不能小，要好点）。
import { Color, EventTouch, Label, Node, Sprite, Tween, UITransform, Vec3, tween } from 'cc';
import { FIELD_H } from '../core/gen/levelGen';
import { GameState, REMOVED } from '../core/model/gameState';
import { LevelData } from '../core/model/levelData';
import * as Rules from '../core/rules/rules';
import { App } from '../services/app';
import { bob, ring, sparkle } from '../ui/fx';
import { at, box, img, opacity, setImg, text } from '../ui/kit';

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
  private freeLayout = false;
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
    this.freeLayout = !covered;
    this.layered = covered;
    if (!covered) {
      const onField = this.lv.fieldCap > 0 ? this.lv.fieldCap : radii.length;
      this.fit(centers, radii, Math.min(onField, radii.length));
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
    bob(body, 4, 2.6 + (i % 5) * 0.3, (i % 7) * 0.2);
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
    if (!n.active) {
      n.destroy();
      return;
    }
    ring(this.node, n.position.x, n.position.y, v.r, v.r * 2.6, new Color(200, 245, 255, 255));
    sparkle(this.node, n.position.x, n.position.y, 10, v.r * 1.2);
    tween(n).to(0.12, { scale: new Vec3(1.18, 1.18, 1) }).to(0.1, { scale: new Vec3(0.2, 0.2, 1) }).call(() => n.destroy()).start();
    tween(opacity(n)).delay(0.12).to(0.1, { opacity: 0 }).start();
  }

  /** 掉落关：候场队头落到空出来的位置（freed 是刚破的气泡） */
  dropIn(b: number, freed: number, delay: number): void {
    const v = this.views[b];
    v.queued = false;
    if (freed >= 0) v.home = [...this.views[freed].home];
    if (this.freeLayout) this.replace(b);
    const cfg = App.config.ui.drop;
    v.node.active = true;
    at(v.node, v.home[0], this.h / 2 + v.r + 60);
    v.node.setSiblingIndex(this.node.children.length - 1);
    tween(v.node)
      .delay(delay + cfg.delay)
      .to(cfg.fallSeconds, { position: new Vec3(v.home[0], v.home[1], 0) }, { easing: 'quadIn' })
      .to(0.1, { scale: new Vec3(1.08, 0.92, 1) })
      .to(0.14, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
      .start();
  }

  /** 以 b 的位置为起点，对场上气泡重新推开；动的气泡缓动过去 */
  private replace(b: number): void {
    const ids: number[] = [];
    const c: [number, number][] = [];
    const r: number[] = [];
    for (let i = 0; i < this.views.length; i++) {
      const v = this.views[i];
      if (i !== b && (v.gone || v.queued)) continue;
      ids.push(i);
      c.push([...v.home]);
      r.push(v.r);
    }
    this.relax(c, r, ids.length, []);
    ids.forEach((i, n) => {
      const v = this.views[i];
      v.home = c[n];
      if (i === b) return;
      tween(v.node).to(App.config.ui.drop.relaxSeconds, { position: new Vec3(c[n][0], c[n][1], 0) }, { easing: 'sineOut' }).start();
    });
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
