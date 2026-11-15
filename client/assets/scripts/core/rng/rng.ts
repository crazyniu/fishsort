/**
 * 可播种的确定性随机数（mulberry32）。只用 32 位整数运算，与 Godot 版 src/core/rng/rng.gd 逐位一致。
 */
export class Rng {
  private a: number;

  constructor(seed: number) {
    this.a = seed >>> 0;
  }

  nextU32(): number {
    this.a = (this.a + 0x6d2b79f5) >>> 0;
    let t = this.a;
    t = Math.imul(t ^ (t >>> 15), t | 1) >>> 0;
    t = (t ^ ((t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0)) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** 闭区间 [lo, hi] */
  rangeI(lo: number, hi: number): number {
    return lo + (this.nextU32() % (hi - lo + 1));
  }

  randf(): number {
    return this.nextU32() / 4294967296;
  }

  pick<T>(arr: readonly T[]): T {
    if (arr.length === 0) throw new Error('Rng.pick: 空数组');
    return arr[this.nextU32() % arr.length];
  }

  shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.nextU32() % (i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
  }
}
