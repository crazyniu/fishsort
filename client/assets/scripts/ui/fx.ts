// 常用动效：弹出、呼吸、轻晃、上下浮、弧线飞、数字滚动、彩纸、火花、闪屏（docs/09 第 6 节、docs/01 第 3 节）。
import { Color, Label, Node, Sprite, Tween, TweenEasing, Vec3, tween } from 'cc';
import { box, img, opacity, tint } from './kit';

const V = (x: number, y: number, z = 1) => new Vec3(x, y, z);

export function stop(n: Node): void {
  Tween.stopAllByTarget(n);
  const op = n.getComponent('cc.UIOpacity');
  if (op) Tween.stopAllByTarget(op);
}

/** 弹窗、奖品：从 0 弹出，过冲一点再回 1 */
export function popIn(n: Node, delay = 0, dur = 0.32, to = 1): void {
  n.setScale(0.01, 0.01, 1);
  tween(n).delay(delay).to(dur, { scale: V(to, to) }, { easing: 'backOut' }).start();
}

export function popOut(n: Node, dur = 0.16, done?: () => void): void {
  tween(n)
    .to(dur, { scale: V(0.01, 0.01) }, { easing: 'backIn' })
    .call(() => done?.())
    .start();
}

export function fadeIn(n: Node, dur = 0.2, delay = 0, to = 255): void {
  const op = opacity(n);
  op.opacity = 0;
  tween(op).delay(delay).to(dur, { opacity: to }).start();
}

export function fadeOut(n: Node, dur = 0.2, done?: () => void): void {
  tween(opacity(n))
    .to(dur, { opacity: 0 })
    .call(() => done?.())
    .start();
}

/** 呼吸：主按钮、「下一关」 */
export function breathe(n: Node, amp = 0.05, period = 1.2): void {
  const s = n.scale.x || 1;
  tween(n)
    .repeatForever(
      tween(n)
        .to(period / 2, { scale: V(s * (1 + amp), s * (1 + amp)) }, { easing: 'sineInOut' })
        .to(period / 2, { scale: V(s, s) }, { easing: 'sineInOut' }),
    )
    .start();
}

/** 轻晃：有红点的入口，隔一会晃一下 */
export function wiggle(n: Node, deg = 8, every = 2.4): void {
  tween(n)
    .repeatForever(
      tween(n)
        .delay(every)
        .to(0.08, { angle: deg })
        .to(0.12, { angle: -deg })
        .to(0.1, { angle: deg / 2 })
        .to(0.1, { angle: 0 }),
    )
    .start();
}

/** 上下浮动（气泡、鱼） */
export function bob(n: Node, amp = 6, period = 2.4, phase = 0): void {
  const y = n.position.y;
  const x = n.position.x;
  tween(n)
    .delay(phase)
    .repeatForever(
      tween(n)
        .to(period / 2, { position: V(x, y + amp, 0) }, { easing: 'sineInOut' })
        .to(period / 2, { position: V(x, y - amp, 0) }, { easing: 'sineInOut' }),
    )
    .start();
}

/** 左右抖（点了没用、金币不够） */
export function shake(n: Node, amp = 10): void {
  const x = n.position.x;
  const y = n.position.y;
  tween(n)
    .to(0.04, { position: V(x - amp, y, 0) })
    .to(0.06, { position: V(x + amp, y, 0) })
    .to(0.06, { position: V(x - amp / 2, y, 0) })
    .to(0.04, { position: V(x, y, 0) })
    .start();
}

/** 回弹（点鱼、按下） */
export function squash(n: Node, k = 0.85): void {
  const s = n.scale.x || 1;
  Tween.stopAllByTarget(n);
  tween(n)
    .to(0.06, { scale: V(s * (2 - k), s * k) })
    .to(0.14, { scale: V(s, s) }, { easing: 'backOut' })
    .start();
}

/**
 * 弧线飞：从 n 当前位置飞到 (tx, ty)（同一父节点坐标系），向上拱 arc。
 * 用一个 0→1 的代理对象推进，二次贝塞尔
 */
export function flyArc(n: Node, tx: number, ty: number, dur: number, arc = 120, easing: TweenEasing = 'quadIn', done?: () => void, scaleTo?: number): void {
  const sx = n.position.x;
  const sy = n.position.y;
  const cx = (sx + tx) / 2;
  const cy = Math.max(sy, ty) + arc;
  const s0 = n.scale.x || 1;
  const p = { t: 0 };
  tween(p)
    .to(
      dur,
      { t: 1 },
      {
        easing,
        onUpdate: () => {
          if (!n.isValid) return;
          const t = p.t;
          const u = 1 - t;
          n.setPosition(u * u * sx + 2 * u * t * cx + t * t * tx, u * u * sy + 2 * u * t * cy + t * t * ty, 0);
          if (scaleTo !== undefined) {
            const s = s0 + (scaleTo - s0) * t;
            n.setScale(s, s, 1);
          }
        },
      },
    )
    .call(() => done?.())
    .start();
}

/** 数字滚动 */
export function countUp(l: Label, from: number, to: number, dur: number, fmt: (v: number) => string = (v) => String(v), delay = 0): void {
  const p = { v: from };
  l.string = fmt(from);
  tween(p)
    .delay(delay)
    .to(dur, { v: to }, { easing: 'quadOut', onUpdate: () => l.isValid && (l.string = fmt(Math.round(p.v))) })
    .call(() => l.isValid && (l.string = fmt(to)))
    .start();
}

const CONFETTI = ['#FF5A4E', '#FFC21F', '#3DC21A', '#2F8BF5', '#A44DF5', '#FF8AD8'].map((h) => {
  const n = parseInt(h.slice(1), 16);
  return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, 255);
});

/** 彩纸：从 (x, y) 喷出，往下飘 */
export function confetti(layer: Node, x: number, y: number, count = 40, spread = 360): void {
  for (let i = 0; i < count; i++) {
    const c = img(layer, 'kit/confetti', 12, 18, 'confetti');
    (c.getComponent(Sprite) as Sprite).color = CONFETTI[i % CONFETTI.length];
    c.setPosition(x, y, 0);
    c.angle = Math.random() * 360;
    const a = Math.random() * Math.PI * 2;
    const r = spread * (0.4 + Math.random() * 0.6);
    const tx = x + Math.cos(a) * r;
    const ty = y + Math.sin(a) * r * 0.7 + 80;
    const dur = 0.9 + Math.random() * 0.7;
    tween(c)
      .to(0.35, { position: V(tx, ty, 0) }, { easing: 'quadOut' })
      .to(dur, { position: V(tx + (Math.random() - 0.5) * 120, ty - 500, 0), angle: c.angle + 540 }, { easing: 'sineIn' })
      .call(() => c.destroy())
      .start();
    tween(opacity(c)).delay(0.35 + dur * 0.6).to(dur * 0.4, { opacity: 0 }).start();
  }
}

/** 火花：一圈小星星往外散 */
export function sparkle(layer: Node, x: number, y: number, count = 10, r = 110, color?: Color, sizePx = 34): void {
  for (let i = 0; i < count; i++) {
    const s = img(layer, 'kit/fx_spark', sizePx, sizePx, 'spark');
    if (color) (s.getComponent(Sprite) as Sprite).color = color;
    s.setPosition(x, y, 0);
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const d = r * (0.6 + Math.random() * 0.5);
    s.setScale(0.3, 0.3, 1);
    tween(s)
      .to(0.45, { position: V(x + Math.cos(a) * d, y + Math.sin(a) * d, 0), scale: V(1, 1) }, { easing: 'quadOut' })
      .to(0.25, { scale: V(0.01, 0.01) })
      .call(() => s.destroy())
      .start();
  }
}

/** 光环扩散 */
export function ring(layer: Node, x: number, y: number, from = 60, to = 260, color?: Color): void {
  const r = img(layer, 'kit/fx_ring', from, from, 'ring');
  if (color) (r.getComponent(Sprite) as Sprite).color = color;
  r.setPosition(x, y, 0);
  const k = to / from;
  tween(r).to(0.45, { scale: V(k, k) }, { easing: 'quadOut' }).call(() => r.destroy()).start();
  tween(opacity(r)).to(0.45, { opacity: 0 }).start();
}

/** 全屏闪一下（升档、史诗卡） */
export function flash(layer: Node, w: number, h: number, peak = 180, color = new Color(255, 255, 255, 255)): void {
  const f = tint(layer, w, h, color, 'flash');
  const op = opacity(f);
  op.opacity = peak;
  tween(op).to(0.35, { opacity: 0 }).call(() => f.destroy()).start();
}

/** 转动的光芒（开奖、宝箱背后） */
export function rays(parent: Node, s: number): Node {
  const n = img(parent, 'kit/fx_rays', s, s, 'rays');
  tween(n).repeatForever(tween(n).by(6, { angle: 360 })).start();
  return n;
}

/** 飘字（夸奖词、金币 +N）：往上飘并淡出 */
export function floatUp(layer: Node, node: Node, x: number, y: number, dy = 90, dur = 0.9): void {
  layer.addChild(node);
  node.setPosition(x, y, 0);
  popIn(node, 0, 0.18);
  tween(node).delay(0.1).by(dur, { position: V(0, dy, 0) }, { easing: 'quadOut' }).call(() => node.destroy()).start();
  tween(opacity(node)).delay(dur * 0.55).to(dur * 0.45, { opacity: 0 }).start();
}

export function delay(owner: Node, sec: number, fn: () => void): void {
  tween(box('timer', owner)).delay(sec).call(fn).removeSelf().start();
}
