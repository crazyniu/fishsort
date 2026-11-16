// 关卡静态数据，格式见 docs/02-关卡设计.md 第 3 节。对应 Godot 版 src/core/model/level_data.gd。

export interface OrderData {
  /** 鱼种槽位 */
  s: number;
  /** 容量 */
  cap: number;
  /** 秒，0 = 不限时 */
  timer: number;
}

export interface BubbleData {
  id: number;
  x: number;
  y: number;
  r: number;
  layer: number;
  fish: number[];
  under: number[];
  chain: number;
  fog: boolean;
  ice: number[];
  pairs: number[][];
}

/** [气泡, 鱼下标] */
export type Tap = [number, number];

type Raw = Record<string, unknown>;

function int(v: unknown, def = 0): number {
  return v === undefined || v === null ? def : Math.trunc(Number(v));
}

function num(v: unknown, def: number): number {
  return v === undefined || v === null ? def : Number(v);
}

// 注意：Cocos 3.8 构建用的 Babel 不认「as 后面跟联合类型」（as X[] | undefined），会在打包脚本这一步报错，
// 所以这里用函数收窄，不用这种写法。
function list<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function ints(v: unknown): number[] {
  return Array.isArray(v) ? v.map((x) => Math.trunc(Number(x))) : [];
}

/** 写文件时浮点只保留 14 位有效数字，和 Godot 的 JSON.stringify 输出一致（0.286 而不是 0.28600000000000003） */
function short(v: number): number {
  return Number.isInteger(v) ? v : Number(v.toPrecision(14));
}

export class LevelData {
  id = 0;
  levelSeed = 0;
  challenge = false;
  buffer = 5;
  bowlSlots = 2;
  /** 掉落关的场上容量；0 = 不掉落，全部在场 */
  fieldCap = 0;
  palette = 0;
  orders: OrderData[] = [];
  bubbles: BubbleData[] = [];
  /** 参考解：回放它即可证明可解 */
  ref: Tap[] = [];
  variants: string[] = [];

  static fromDict(d: Raw): LevelData {
    const lv = new LevelData();
    lv.id = int(d.id);
    lv.levelSeed = int(d.seed);
    lv.challenge = Boolean(d.challenge ?? false);
    lv.buffer = int(d.buffer, 5);
    lv.bowlSlots = int(d.bowlSlots, 2);
    lv.fieldCap = int(d.fieldCap);
    lv.palette = int(d.palette);
    for (const o of list<Raw>(d.orders)) {
      lv.orders.push({ s: int(o.s), cap: int(o.cap, 3), timer: int(o.timer) });
    }
    for (const b of list<Raw>(d.bubbles)) {
      lv.bubbles.push({
        id: int(b.id),
        x: num(b.x, 0),
        y: num(b.y, 0),
        r: num(b.r, 0.1),
        layer: int(b.layer),
        fish: ints(b.fish),
        under: ints(b.under),
        chain: int(b.chain),
        fog: Boolean(b.fog ?? false),
        ice: ints(b.ice),
        pairs: list<unknown>(b.pairs).map(ints),
      });
    }
    for (const t of list<unknown>(d.ref)) {
      const p = ints(t);
      lv.ref.push([p[0], p[1]]);
    }
    lv.variants = list<unknown>(d.variants).map(String);
    return lv;
  }

  static fromJson(text: string): LevelData | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return null;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return LevelData.fromDict(parsed as Raw);
  }

  /** 字段顺序与 Godot 版 to_dict 一致，生成的关卡文件逐字节相同 */
  toDict(): Record<string, unknown> {
    return {
      id: this.id,
      seed: this.levelSeed,
      challenge: this.challenge,
      buffer: this.buffer,
      bowlSlots: this.bowlSlots,
      fieldCap: this.fieldCap,
      palette: this.palette,
      orders: this.orders.map((o) => ({ s: o.s, cap: o.cap, timer: o.timer })),
      bubbles: this.bubbles.map((b) => ({
        id: b.id,
        x: short(b.x),
        y: short(b.y),
        r: short(b.r),
        layer: b.layer,
        fish: b.fish,
        under: b.under,
        chain: b.chain,
        fog: b.fog,
        ice: b.ice,
        pairs: b.pairs,
      })),
      ref: this.ref,
      variants: this.variants,
    };
  }

  toJson(): string {
    return JSON.stringify(this.toDict());
  }
}
