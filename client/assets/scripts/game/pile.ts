// 气泡堆的重力模拟（只管画面，不影响规则：遮挡关系在关卡数据里是写死的，docs/02 第 3 节）。
// 用户 2026-11-16：气泡要有正常的重力——从上面掉下来落在堆上，沿着别的气泡滚下去；下面的破了，上面的压下来；
// 堆要压实，不能东一块西一块留着空。
//
// 做法（基于位置的动力学，圆对圆）：
// - 每个气泡是一个圆，各自受重力、各自运动。
// - 有遮挡关系的一对（一个压着另一个）不互相碰撞，改用一条「弹性带」连着：两个圆心的距离只能在
//   [rest × linkMin, rest] 之间（rest 是关卡里设计的距离）。这样压着的始终压着，画面上的遮挡和规则一致；
//   但这一对可以转、可以挪，能滚进空当里压实。原先整组焊死成一块平移，一组大了就卡在一个支点上转不动，堆里留空。
// - 每一小步：受重力下落 → 反复把重叠的圆推开、把弹性带拉回范围、把出界的推回场地 → 用实际位移反推速度。
// - 全部慢下来一会儿就「睡着」，不再算；有气泡破了、新气泡落下时再叫醒。
// - 原本就叠在一起、又没有遮挡关系的两个圆不会被一下子弹开：记下当时叠了多少当作「宽限」，
//   宽限按 separate 的速度收回，两个圆慢慢分开；推开重叠得到的速度有上限，不会把气泡崩飞。
// 这个文件不依赖引擎，方便单独验证。

export interface PileCfg {
  /** 重力加速度（设计单位 / 秒²） */
  gravity: number;
  /** 速度阻尼（每秒衰减的比例系数）：越大越快停稳 */
  damping: number;
  /** 每帧分几小步、每小步推开重叠迭代几次 */
  substeps: number;
  iterations: number;
  /** 气泡之间、气泡和场地边留的缝 */
  gap: number;
  /** 速度低于它、持续 sleepTime 秒就睡着 */
  sleepSpeed: number;
  sleepTime: number;
  /** 下落速度超过它、被挡住的那一刻算一次「落地」（回调给画面压一下、响一声） */
  landSpeed: number;
  /** 原本叠在一起的两个圆分开的速度（设计单位 / 秒） */
  separate: number;
  /** 遮挡的一对最近能靠到设计距离的多少（0–1）：越小压得越实，太小上面的会把下面的整个盖住 */
  linkMin: number;
}

interface Body {
  id: number;
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  /** 这一小步里被推了多少 */
  dx: number;
  dy: number;
  /** 质量的倒数（按面积） */
  w: number;
}

/** 遮挡的一对：圆心距离保持在 [min, max] */
interface Link {
  a: Body;
  b: Body;
  min: number;
  max: number;
}

const pairKey = (a: number, b: number) => (a < b ? `${a}_${b}` : `${b}_${a}`);

export class Pile {
  private bodies = new Map<number, Body>();
  private links: Link[] = [];
  /** 连着弹性带的对：不互相碰撞 */
  private linked = new Set<string>();
  /** 每一对遮挡第一次见到时的距离（设计距离），之后重新连带都按它 */
  private rest = new Map<string, number>();
  private calm = 0;
  /** 成对的宽限：键是「小 id_大 id」，值是还允许叠多少 */
  private slack = new Map<string, number>();
  awake = false;
  /** 落地回调：气泡 id、落地前的下落速度 */
  onLand: ((id: number, speed: number) => void) | null = null;

  /** 场地：x ∈ [-w/2, w/2]，地面 y = -h/2，上面不封顶 */
  constructor(
    private readonly w: number,
    private readonly h: number,
    private readonly cfg: PileCfg,
  ) {}

  has(id: number): boolean {
    return this.bodies.has(id);
  }

  add(id: number, x: number, y: number, r: number): void {
    this.bodies.set(id, { id, x, y, r, vx: 0, vy: 0, dx: 0, dy: 0, w: 1 / (r * r) });
    this.forgive();
    this.wake();
  }

  /** 给现在就叠着的、没连弹性带的每一对记上宽限（已有的宽限只增不减） */
  private forgive(): void {
    const list = Array.from(this.bodies.values());
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const key = pairKey(a.id, b.id);
        if (this.linked.has(key)) continue;
        const pen = a.r + b.r + this.cfg.gap - Math.hypot(b.x - a.x, b.y - a.y);
        if (pen <= 0) continue;
        this.slack.set(key, Math.max(this.slack.get(key) ?? 0, pen));
      }
    }
  }

  remove(id: number): void {
    if (!this.bodies.delete(id)) return;
    this.links = this.links.filter((l) => l.a.id !== id && l.b.id !== id);
    this.wake();
  }

  /**
   * 按遮挡关系连弹性带：links 里每一对 [a, b] 表示这两个气泡一个压着另一个。
   * 第一次见到的一对按现在的距离记成设计距离；破掉的气泡连着的带自然没了，上面的就往下落
   */
  regroup(links: [number, number][]): void {
    this.links = [];
    this.linked.clear();
    for (const [ia, ib] of links) {
      const a = this.bodies.get(ia);
      const b = this.bodies.get(ib);
      if (!a || !b) continue;
      const key = pairKey(ia, ib);
      if (this.linked.has(key)) continue;
      let d = this.rest.get(key);
      if (d === undefined) {
        // 设计上几乎同心的一对也留一点距离，不然方向不定
        d = Math.max(Math.hypot(b.x - a.x, b.y - a.y), Math.min(a.r, b.r) * 0.2);
        this.rest.set(key, d);
      }
      this.linked.add(key);
      this.slack.delete(key);
      this.links.push({ a, b, min: d * this.cfg.linkMin, max: d });
    }
    this.forgive();
    this.wake();
  }

  wake(): void {
    this.awake = true;
    this.calm = 0;
  }

  pos(id: number): [number, number] | null {
    const b = this.bodies.get(id);
    return b ? [b.x, b.y] : null;
  }

  /** 推进 dt 秒。睡着时什么都不做 */
  step(dt: number): void {
    if (!this.awake) return;
    const c = this.cfg;
    const n = Math.max(1, c.substeps);
    const h = Math.min(dt, 1 / 30) / n;
    const list = Array.from(this.bodies.values());
    let fastest = 0;
    // 宽限按时间收回
    if (this.slack.size > 0) {
      const back = c.separate * Math.min(dt, 1 / 30);
      for (const key of Array.from(this.slack.keys())) {
        const left = (this.slack.get(key) as number) - back;
        if (left <= 0) this.slack.delete(key);
        else this.slack.set(key, left);
      }
    }
    for (let s = 0; s < n; s++) {
      const k = Math.max(0, 1 - c.damping * h);
      for (const b of list) {
        b.vy -= c.gravity * h;
        b.vx *= k;
        b.vy *= k;
        b.dx = b.vx * h;
        b.dy = b.vy * h;
        b.x += b.dx;
        b.y += b.dy;
      }
      for (let it = 0; it < c.iterations; it++) {
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            let need = a.r + b.r + c.gap;
            const d2 = dx * dx + dy * dy;
            if (d2 >= need * need) continue;
            const key = pairKey(a.id, b.id);
            if (this.linked.has(key)) continue;
            if (this.slack.size > 0) {
              need -= this.slack.get(key) ?? 0;
              if (need <= 0 || d2 >= need * need) continue;
            }
            this.part(a, b, dx, dy, Math.sqrt(d2), need);
          }
        }
        // 弹性带：太远拉回来，太近推开
        for (const l of this.links) {
          const dx = l.b.x - l.a.x;
          const dy = l.b.y - l.a.y;
          const d = Math.hypot(dx, dy);
          if (d > l.max) this.part(l.a, l.b, dx, dy, d, l.max);
          else if (d < l.min) this.part(l.a, l.b, dx, dy, d, l.min);
        }
        for (const b of list) {
          const m = b.r + c.gap;
          if (b.x < -this.w / 2 + m) this.shift(b, -this.w / 2 + m - b.x, 0);
          else if (b.x > this.w / 2 - m) this.shift(b, this.w / 2 - m - b.x, 0);
          if (b.y < -this.h / 2 + m) this.shift(b, 0, -this.h / 2 + m - b.y);
        }
      }
      for (const b of list) {
        const before = b.vy;
        const cap = Math.max(Math.hypot(b.vx, b.vy), 700);
        b.vx = b.dx / h;
        b.vy = b.dy / h;
        // 推开重叠得到的速度不超过原来的速度（至少 700）：不会被崩飞
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > cap) {
          b.vx *= cap / sp;
          b.vy *= cap / sp;
        }
        // 下落得很快、这一步被挡住了：落地
        if (before < -c.landSpeed && b.vy > before * 0.4 && this.onLand) this.onLand(b.id, -before);
        fastest = Math.max(fastest, Math.hypot(b.vx, b.vy));
      }
    }
    if (fastest < c.sleepSpeed) {
      this.calm += dt;
      if (this.calm >= c.sleepTime) {
        this.awake = false;
        for (const b of list) {
          b.vx = 0;
          b.vy = 0;
        }
      }
    } else this.calm = 0;
  }

  /** 把 a、b 沿连线挪到距离 target：按质量分摊，重的挪得少 */
  private part(a: Body, b: Body, dx: number, dy: number, d: number, target: number): void {
    // 圆心几乎重合时给一个固定方向，免得除以零
    const ux = d > 0.01 ? dx / d : Math.cos(a.id * 2.4);
    const uy = d > 0.01 ? dy / d : Math.sin(a.id * 2.4);
    const pen = target - d;
    const sum = a.w + b.w;
    this.shift(a, (-ux * pen * a.w) / sum, (-uy * pen * a.w) / sum);
    this.shift(b, (ux * pen * b.w) / sum, (uy * pen * b.w) / sum);
  }

  private shift(b: Body, dx: number, dy: number): void {
    b.dx += dx;
    b.dy += dy;
    b.x += dx;
    b.y += dy;
  }
}
