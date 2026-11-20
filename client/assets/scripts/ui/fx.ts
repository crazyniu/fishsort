// 常用动效：弹出、呼吸、轻晃、上下浮、弧线飞、数字滚动、彩纸、火花、闪屏（docs/09 第 6 节、docs/01 第 3 节）。
import { Color, Label, Node, Sprite, Tween, TweenEasing, Vec3, game, tween } from 'cc';
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

// ---- 屏幕震动：累加的「冲击量」每帧衰减，位移 = 冲击量²（轻的几乎不动、重的才明显），几路正弦叠加（不是每帧乱跳）。
// 只动传进来的那个节点（局内是 stage，纯表现层），震完准确回到原位；多次触发是累加，不会互相打架
interface Shaker {
  trauma: number;
  t: number;
  x: number;
  y: number;
  max: number;
  on: boolean;
}
const shakers = new WeakMap<Node, Shaker>();

/** 加一次冲击：amount 0–1（轻 0.25、中 0.45、重 0.7+），max 是满冲击时的最大位移（设计单位） */
export function trauma(n: Node, amount: number, max = 18): void {
  let s = shakers.get(n);
  if (!s) {
    s = { trauma: 0, t: 0, x: n.position.x, y: n.position.y, max, on: false };
    shakers.set(n, s);
  }
  s.trauma = Math.min(1, s.trauma + amount);
  s.max = Math.max(max, s.on ? s.max : 0);
  if (s.on) return;
  s.on = true;
  const st = s;
  const p = { v: 0 };
  const tw = tween(p)
    .repeatForever(
      tween(p).to(1, { v: 1 }, {
        onUpdate: () => {
          if (!n.isValid) {
            tw.stop();
            return;
          }
          const dt = Math.min(0.05, game.deltaTime);
          st.trauma = Math.max(0, st.trauma - dt * 1.8);
          st.t += dt * 34;
          const k = st.trauma * st.trauma * st.max;
          n.setPosition(st.x + k * Math.sin(st.t * 1.7), st.y + k * 0.8 * Math.sin(st.t * 2.3 + 1.3), 0);
          n.angle = k * 0.03 * Math.sin(st.t * 1.1);
          if (st.trauma <= 0) {
            n.setPosition(st.x, st.y, 0);
            n.angle = 0;
            st.on = false;
            tw.stop();
          }
        },
      }),
    )
    .start();
}

const PUNCH_TAG = 9101;

/** 整块顿一下：瞬间放大到 k 再弹回 1（连击命中时整个场面跟着一跳）。只管缩放，和震动互不干扰 */
export function punch(n: Node, k = 1.02, dur = 0.16): void {
  Tween.stopAllByTag(PUNCH_TAG, n);
  n.setScale(k, k, 1);
  tween(n).tag(PUNCH_TAG).to(dur, { scale: V(1, 1) }, { easing: 'quadOut' }).start();
}

const SQUASH_TAG = 9103;

/** 回弹（点鱼、鱼进缸）：只管缩放，不打断这个节点上别的动画（比如鱼缸正在落下） */
export function squash(n: Node, k = 0.85): void {
  Tween.stopAllByTag(SQUASH_TAG, n);
  tween(n)
    .tag(SQUASH_TAG)
    .to(0.06, { scale: V(2 - k, k) })
    .to(0.14, { scale: V(1, 1) }, { easing: 'backOut' })
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

/**
 * 彩纸炮：从 (x, y) 朝 deg 方向（0 = 右，90 = 上）喷出一个扇面，飞到最高点后往下飘。
 * 用在屏幕两个下角往中间喷（升档、过关）
 */
export function cannon(layer: Node, x: number, y: number, deg: number, count = 30, power = 900, fan = 50): void {
  for (let i = 0; i < count; i++) {
    const c = img(layer, 'kit/confetti', 14, 20, 'confetti');
    (c.getComponent(Sprite) as Sprite).color = CONFETTI[i % CONFETTI.length];
    c.setPosition(x, y, 0);
    c.angle = Math.random() * 360;
    const a = ((deg + (Math.random() - 0.5) * fan) * Math.PI) / 180;
    const r = power * (0.45 + Math.random() * 0.55);
    const tx = x + Math.cos(a) * r;
    const ty = y + Math.sin(a) * r;
    const up = 0.32 + Math.random() * 0.18;
    const fall = 1.0 + Math.random() * 0.8;
    tween(c)
      .to(up, { position: V(tx, ty, 0), angle: c.angle + 300 }, { easing: 'quadOut' })
      .to(fall, { position: V(tx + (Math.random() - 0.5) * 160, ty - 520 - Math.random() * 200, 0), angle: c.angle + 900 }, { easing: 'sineIn' })
      .call(() => c.destroy())
      .start();
    tween(opacity(c)).delay(up + fall * 0.6).to(fall * 0.4, { opacity: 0 }).start();
  }
}

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

/**
 * 水花：从 (x, y) 往上喷一把小东西（小气泡、水珠），各自带初速度、受重力落回去、边飞边淡出。
 * 鱼进缸时缸口溅起来的那一下（同 Godot 版 Anim.burst 的 upward 模式）
 */
export function fountain(layer: Node, x: number, y: number, count: number, path: string, speed = 240, gravity = 900, sizeMin = 10, sizeMax = 20, life = 0.45): void {
  for (let i = 0; i < count; i++) {
    const s0 = sizeMin + Math.random() * (sizeMax - sizeMin);
    const b = img(layer, path, s0, s0, 'drop');
    b.setPosition(x, y, 0);
    // 朝上的扇面：27°–153°
    const a = Math.PI * (0.15 + Math.random() * 0.7);
    const v = speed * (0.6 + Math.random() * 0.6);
    const vx = Math.cos(a) * v;
    const vy = Math.sin(a) * v;
    const p = { t: 0 };
    tween(p)
      .to(life, { t: life }, {
        onUpdate: () => {
          if (b.isValid) b.setPosition(x + vx * p.t, y + vy * p.t - 0.5 * gravity * p.t * p.t, 0);
        },
      })
      .call(() => b.destroy())
      .start();
    tween(opacity(b)).to(life, { opacity: 0 }, { easing: 'quadIn' }).start();
  }
}

/** 扁的水波圈：从小放大成一个横着的椭圆、淡出（缸口的涟漪、点鱼处的水波） */
export function ripple(layer: Node, x: number, y: number, s = 90, to: [number, number] = [1.3, 0.5], dur = 0.25, delaySec = 0, peak = 180): void {
  const r = img(layer, 'kit/fx_ring', s, s, 'ripple');
  r.setPosition(x, y, 0);
  r.setScale(to[0] * 0.25, to[1] * 0.4, 1);
  const op = opacity(r);
  op.opacity = 0;
  tween(r).delay(delaySec).to(dur, { scale: V(to[0], to[1]) }, { easing: 'quadOut' }).call(() => r.destroy()).start();
  tween(op).delay(delaySec).set({ opacity: peak }).to(dur, { opacity: 0 }, { easing: 'quadIn' }).start();
}

/** 光环扩散 */
export function ring(layer: Node, x: number, y: number, from = 60, to = 260, color?: Color, dur = 0.45): void {
  const r = img(layer, 'kit/fx_ring', from, from, 'ring');
  if (color) (r.getComponent(Sprite) as Sprite).color = color;
  r.setPosition(x, y, 0);
  const k = to / from;
  tween(r).to(dur, { scale: V(k, k) }, { easing: 'quadOut' }).call(() => r.destroy()).start();
  tween(opacity(r)).delay(dur * 0.25).to(dur * 0.75, { opacity: 0 }).start();
}

/** 光芒炸开：一圈放射光从小放大到 to、边转边淡出（升档、开箱） */
export function rayBurst(layer: Node, x: number, y: number, to: number, color?: Color, dur = 0.6, peak = 200): void {
  const n = img(layer, 'kit/fx_rays', to, to, 'rayBurst');
  if (color) (n.getComponent(Sprite) as Sprite).color = color;
  n.setPosition(x, y, 0);
  n.setScale(0.15, 0.15, 1);
  n.angle = Math.random() * 360;
  const op = opacity(n);
  op.opacity = peak;
  tween(n).to(dur, { scale: V(1, 1), angle: n.angle + 50 }, { easing: 'quadOut' }).call(() => n.destroy()).start();
  tween(op).delay(dur * 0.35).to(dur * 0.65, { opacity: 0 }).start();
}

/** 一团柔光闪一下：从小放大、淡出 */
export function glowPop(layer: Node, x: number, y: number, s: number, color?: Color, dur = 0.35, peak = 255): void {
  const g = img(layer, 'kit/fx_glow', s, s, 'glowPop');
  if (color) (g.getComponent(Sprite) as Sprite).color = color;
  g.setPosition(x, y, 0);
  g.setScale(0.3, 0.3, 1);
  const op = opacity(g);
  op.opacity = peak;
  tween(g).to(dur, { scale: V(1, 1) }, { easing: 'quadOut' }).call(() => g.destroy()).start();
  tween(op).to(dur, { opacity: 0 }, { easing: 'quadIn' }).start();
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
  // 回调出错只报一次：tween 的 call 抛错时后面的 removeSelf 不执行，这一步下一帧还会再调，
  // 变成每帧报错、整帧中断（画面卡住，出错前的音效和震动每帧来一次；2026-11-20 微信真机）
  const once = (): void => {
    try {
      fn();
    } catch (e) {
      console.error(e);
    }
  };
  tween(box('timer', owner)).delay(sec).call(once).removeSelf().start();
}
