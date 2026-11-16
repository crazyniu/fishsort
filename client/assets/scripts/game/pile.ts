// 气泡堆的重力模拟（只管画面，不影响规则：遮挡关系在关卡数据里是写死的，docs/02 第 3 节）。
// 用户 2026-11-16：气泡要有正常的重力——从上面掉下来落在堆上，沿着别的气泡滚下去；下面的破了，上面的压下来。
//
// 做法（基于位置的动力学，圆对圆）：
// - 每个气泡是一个圆。有遮挡关系的气泡（一个压着另一个）绑成一「组」，整组一起平移、互相不碰撞——
//   这样压着的还压着，画面上的遮挡和规则里的遮挡始终一致；没有遮挡关系的气泡各自一组。
// - 每一小步：各组受重力下落 → 反复把不同组之间重叠的圆推开、把出界的推回场地 → 用这一步实际走的位移反推速度。
// - 全部慢下来一会儿就「睡着」，不再算；有气泡破了、新气泡落下时再叫醒。
// - 原本就叠在一起的两个圆（刚拆开的两组、落点正好压着别人）不会被一下子弹开：记下当时叠了多少当作「宽限」，
//   宽限按 separate 的速度收回，两个圆慢慢分开；另外推开重叠得到的速度有上限，不会把气泡崩飞。
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
}

interface Body {
  id: number;
  x: number;
  y: number;
  r: number;
  g: Group;
}

interface Group {
  vx: number;
  vy: number;
  /** 这一小步里整组被推了多少 */
  dx: number;
  dy: number;
  mass: number;
  members: Body[];
}

export class Pile {
  private bodies = new Map<number, Body>();
  private groups: Group[] = [];
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
    const g: Group = { vx: 0, vy: 0, dx: 0, dy: 0, mass: r * r, members: [] };
    const b: Body = { id, x, y, r, g };
    g.members.push(b);
    this.bodies.set(id, b);
    this.groups.push(g);
    this.forgive();
    this.wake();
  }

  /** 给现在就叠着的、不同组的每一对记上宽限（已有的宽限只增不减） */
  private forgive(): void {
    const list = Array.from(this.bodies.values());
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        if (a.g === b.g) continue;
        const pen = a.r + b.r + this.cfg.gap - Math.hypot(b.x - a.x, b.y - a.y);
        if (pen <= 0) continue;
        const key = a.id < b.id ? `${a.id}_${b.id}` : `${b.id}_${a.id}`;
        this.slack.set(key, Math.max(this.slack.get(key) ?? 0, pen));
      }
    }
  }

  remove(id: number): void {
    const b = this.bodies.get(id);
    if (!b) return;
    this.bodies.delete(id);
    b.g.members = b.g.members.filter((m) => m !== b);
    this.wake();
  }

  /**
   * 按遮挡关系重新分组：links 里每一对 [a, b] 表示这两个气泡绑在一起。
   * 新的组沿用原来成员的速度（按质量平均），破掉一个气泡后拆开的两半各自往下落
   */
  regroup(links: [number, number][]): void {
    const parent = new Map<number, number>();
    const find = (i: number): number => {
      let p = parent.get(i) ?? i;
      if (p !== i) {
        p = find(p);
        parent.set(i, p);
      }
      return p;
    };
    for (const id of Array.from(this.bodies.keys())) parent.set(id, id);
    for (const [a, b] of links) if (this.bodies.has(a) && this.bodies.has(b)) parent.set(find(a), find(b));
    const made = new Map<number, Group>();
    for (const b of Array.from(this.bodies.values())) {
      const root = find(b.id);
      let g = made.get(root);
      if (!g) {
        g = { vx: 0, vy: 0, dx: 0, dy: 0, mass: 0, members: [] };
        made.set(root, g);
      }
      const m = b.r * b.r;
      g.vx += b.g.vx * m;
      g.vy += b.g.vy * m;
      g.mass += m;
      g.members.push(b);
    }
    this.groups = Array.from(made.values());
    for (const g of this.groups) {
      g.vx /= g.mass;
      g.vy /= g.mass;
      for (const b of g.members) b.g = g;
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
    this.groups = this.groups.filter((g) => g.members.length > 0);
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
      for (const g of this.groups) {
        g.vy -= c.gravity * h;
        const k = Math.max(0, 1 - c.damping * h);
        g.vx *= k;
        g.vy *= k;
        g.dx = g.vx * h;
        g.dy = g.vy * h;
        for (const b of g.members) {
          b.x += g.dx;
          b.y += g.dy;
        }
      }
      for (let it = 0; it < c.iterations; it++) {
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j];
            if (a.g === b.g) continue;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            let need = a.r + b.r + c.gap;
            const d2 = dx * dx + dy * dy;
            if (d2 >= need * need) continue;
            if (this.slack.size > 0) {
              need -= this.slack.get(a.id < b.id ? `${a.id}_${b.id}` : `${b.id}_${a.id}`) ?? 0;
              if (need <= 0 || d2 >= need * need) continue;
            }
            const d = Math.sqrt(d2);
            // 圆心几乎重合时给一个固定方向，免得除以零
            const ux = d > 0.01 ? dx / d : Math.cos(a.id * 2.4);
            const uy = d > 0.01 ? dy / d : Math.sin(a.id * 2.4);
            const pen = need - d;
            const wa = 1 / a.g.mass;
            const wb = 1 / b.g.mass;
            this.shift(a.g, (-ux * pen * wa) / (wa + wb), (-uy * pen * wa) / (wa + wb));
            this.shift(b.g, (ux * pen * wb) / (wa + wb), (uy * pen * wb) / (wa + wb));
          }
        }
        for (const b of list) {
          const m = b.r + c.gap;
          if (b.x < -this.w / 2 + m) this.shift(b.g, -this.w / 2 + m - b.x, 0);
          else if (b.x > this.w / 2 - m) this.shift(b.g, this.w / 2 - m - b.x, 0);
          if (b.y < -this.h / 2 + m) this.shift(b.g, 0, -this.h / 2 + m - b.y);
        }
      }
      for (const g of this.groups) {
        const before = g.vy;
        const cap = Math.max(Math.hypot(g.vx, g.vy), 700);
        g.vx = g.dx / h;
        g.vy = g.dy / h;
        // 推开重叠得到的速度不超过原来的速度（至少 700）：不会被崩飞
        const sp = Math.hypot(g.vx, g.vy);
        if (sp > cap) {
          g.vx *= cap / sp;
          g.vy *= cap / sp;
        }
        // 下落得很快、这一步被挡住了：落地
        if (before < -c.landSpeed && g.vy > before * 0.4 && this.onLand) this.onLand(g.members[0].id, -before);
        fastest = Math.max(fastest, Math.hypot(g.vx, g.vy));
      }
    }
    if (fastest < c.sleepSpeed) {
      this.calm += dt;
      if (this.calm >= c.sleepTime) {
        this.awake = false;
        for (const g of this.groups) {
          g.vx = 0;
          g.vy = 0;
        }
      }
    } else this.calm = 0;
  }

  private shift(g: Group, dx: number, dy: number): void {
    g.dx += dx;
    g.dy += dy;
    for (const b of g.members) {
      b.x += dx;
      b.y += dy;
    }
  }
}
