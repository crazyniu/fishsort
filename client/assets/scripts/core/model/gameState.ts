// 一局游戏的全部可变状态。只由 Rules 修改。对应 Godot 版 src/core/model/game_state.gd。
import { LevelData, OrderData } from './levelData';

export const Status = { PLAYING: 0, WON: 1, LOST: 2 } as const;
export type Status = (typeof Status)[keyof typeof Status];

/** CLOCK：整关的倒计时用完（docs/01 第 4 节「限时关」，2026-11-17 加） */
export const LoseReason = { NONE: 0, BUFFER_FULL: 1, TIMEOUT: 2, STUCK: 3, CLOCK: 4 } as const;
export type LoseReason = (typeof LoseReason)[keyof typeof LoseReason];

export const REMOVED = -1;
/** 生成器专用：位置上有鱼但种类未定 */
export const UNASSIGNED = -2;
/** 回流位（吹泡产生的气泡）的气泡编号 */
export const RETURN_BUBBLE = -1;
export const MAX_SLOTS = 4;
export const NO_TIMER = -1.0;

export class Bubble {
  fish: number[] = [];
  under: number[] = [];
  chain = 0;
  ice: number[] = [];
  frozen = false;
  /** 厚冰：连着的气泡全部破了才解冻（docs/01 第 4 节）；false = 任何一个破了就解冻 */
  iceAll = false;
  /** 迷雾还差几次显形（在场后每破一个别的气泡减 1），0 = 看得见 */
  fog = 0;
  pairs: number[][] = [];
  /** 排队泡：里面的鱼排着队，只有排头（还在的鱼里下标最大的那条）能点，后面的看得见、点不到（docs/01 第 4 节） */
  queue = false;
  /** 已在场上。掉落关里还在候场队列的气泡为 false */
  onField = true;

  count(): number {
    let n = 0;
    for (const f of this.fish) if (f !== REMOVED) n++;
    return n;
  }

  /** 排头：还在的鱼里下标最大的那条，空泡返回 -1 */
  front(): number {
    for (let k = this.fish.length - 1; k >= 0; k--) if (this.fish[k] !== REMOVED) return k;
    return -1;
  }

  /** 第 k 条现在能不能点（不管气泡本身开不开放）：鱼还在；排队泡只有排头能点 */
  canTake(k: number): boolean {
    if (k < 0 || k >= this.fish.length || this.fish[k] === REMOVED) return false;
    return !this.queue || k === this.front();
  }

  partnerOf(k: number): number {
    for (const p of this.pairs) {
      if (p[0] === k) return p[1];
      if (p[1] === k) return p[0];
    }
    return -1;
  }

  clone(): Bubble {
    const b = new Bubble();
    b.fish = this.fish.slice();
    b.under = this.under;
    b.chain = this.chain;
    b.ice = this.ice;
    b.frozen = this.frozen;
    b.iceAll = this.iceAll;
    b.fog = this.fog;
    b.pairs = this.pairs.slice();
    b.queue = this.queue;
    b.onField = this.onField;
    return b;
  }
}

export class Bowl {
  species = 0;
  cap = 3;
  count = 0;
  timer = NO_TIMER;
  order = 0;

  clone(): Bowl {
    const b = new Bowl();
    b.species = this.species;
    b.cap = this.cap;
    b.count = this.count;
    b.timer = this.timer;
    b.order = this.order;
    return b;
  }
}

export class GameState {
  bubbles: Bubble[] = [];
  orders: OrderData[] = [];
  nextOrder = 0;
  /** 长度固定为 MAX_SLOTS */
  slots: (Bowl | null)[] = [null, null, null, null];
  openSlots = 2;
  /**
   * 加开的缸只装一缸（docs/01 2.4，2026-11-18）：true 时，局内用 unlockBowl 加开的缸位装满一缸就收走，要再用得再开。
   * 默认 false = 开了整关有效（Godot 版的规则，黄金数据按它录的）
   */
  bowlOnce = false;
  /** 开局就开着的缸位数（默认的 2 个，加上连败送的）：这些一直有效。Rules.start 时记下 */
  baseSlots = 2;
  /** 加开的缸位还能再上几张订单（下标 = 缸位号） */
  extraFills: number[] = [0, 0, 0, 0];
  buffer: number[] = [];
  bufferCap = 5;
  returnFish: number[] = [];
  status: Status = Status.PLAYING;
  loseReason: LoseReason = LoseReason.NONE;
  bowlsDone = 0;
  revived = false;
  /** 掉落关：下一个要落到场上的气泡下标（候场队列的队头）。不掉落时等于气泡总数 */
  nextDrop = 0;
  /** 限时关：整关还剩几秒（NO_TIMER = 不限时）。由界面按 LevelCurve.clockFor 设，规则只负责倒数 */
  clock = NO_TIMER;

  static fromLevel(level: LevelData): GameState {
    const s = new GameState();
    s.orders = level.orders;
    s.openSlots = level.bowlSlots;
    s.bufferCap = level.buffer;
    // 开局占格：这几条一开始就在暂存槽里（开局 settle 时有缸要就自己进缸）
    s.buffer = level.prefill.slice();
    const cap = level.fieldCap;
    for (const d of level.bubbles) {
      const b = new Bubble();
      b.fish = d.fish.slice();
      b.under = d.under.slice();
      b.chain = d.chain;
      b.ice = d.ice.slice();
      // 候场的冰封泡落下时再按依赖泡的情况定（Rules.drop）
      b.frozen = b.ice.length > 0;
      b.iceAll = d.iceAll === true;
      b.fog = d.fog;
      b.pairs = d.pairs.map((p) => p.slice());
      b.queue = d.queue === true;
      b.onField = cap <= 0 || s.bubbles.length < cap;
      s.bubbles.push(b);
    }
    s.nextDrop = cap <= 0 ? s.bubbles.length : Math.min(cap, s.bubbles.length);
    return s;
  }

  clone(): GameState {
    const s = new GameState();
    for (const b of this.bubbles) s.bubbles.push(b.clone());
    s.orders = this.orders;
    s.nextOrder = this.nextOrder;
    for (let i = 0; i < MAX_SLOTS; i++) {
      const b = this.slots[i];
      s.slots[i] = b !== null ? b.clone() : null;
    }
    s.openSlots = this.openSlots;
    s.bowlOnce = this.bowlOnce;
    s.baseSlots = this.baseSlots;
    s.extraFills = this.extraFills.slice();
    s.buffer = this.buffer.slice();
    s.bufferCap = this.bufferCap;
    s.returnFish = this.returnFish.slice();
    s.status = this.status;
    s.loseReason = this.loseReason;
    s.bowlsDone = this.bowlsDone;
    s.revived = this.revived;
    s.nextDrop = this.nextDrop;
    s.clock = this.clock;
    return s;
  }

  fishLeft(): number {
    let n = this.returnFish.length + this.buffer.length;
    for (const b of this.bubbles) n += b.count();
    return n;
  }

  /** 候场队列里还有几个没落下的气泡 */
  queuedCount(): number {
    let n = 0;
    for (const b of this.bubbles) if (!b.onField && b.count() > 0) n++;
    return n;
  }

  /** 与 Godot 版一致的状态快照（黄金数据对比、调试用） */
  snapshot(): Record<string, unknown> {
    return {
      bubbles: this.bubbles.map((b) => ({
        fish: b.fish,
        chain: b.chain,
        frozen: b.frozen,
        pairs: b.pairs,
        on_field: b.onField,
      })),
      next_order: this.nextOrder,
      slots: this.slots.map((b) =>
        b === null ? null : { species: b.species, cap: b.cap, count: b.count, timer: b.timer, order: b.order },
      ),
      open_slots: this.openSlots,
      buffer: this.buffer,
      return_fish: this.returnFish,
      status: this.status,
      lose_reason: this.loseReason,
      bowls_done: this.bowlsDone,
      revived: this.revived,
      next_drop: this.nextDrop,
    };
  }
}
