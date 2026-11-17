// 给一关挑生物：同一关里的几种要一眼能分清。
// 只从标了 inLevel 的生物里挑（16 种）。颜色按图上量出来的主色（species.json 的 rgb）算 Lab 色差，不看颜色名字——
// 名字不同的颜色可以几乎一样（橙和朱红、红和绯红、青和天蓝），用户 2026-11-16 指出一关里出现四种红橙色的鱼不好找。
import type { Species } from '../config';
import { Rng } from '../rng/rng';

type Lab = [number, number, number];

function toLab(rgb: readonly number[]): Lab {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const r = lin(rgb[0]);
  const g = lin(rgb[1]);
  const b = lin(rgb[2]);
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.9505);
  const fy = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
  const fz = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.089);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** 两种生物看着差多少（Lab 色差；没标颜色的当作差得很远） */
export function colorDistance(a: Species, b: Species): number {
  if (!a.rgb || !b.rgb) return 999;
  const p = toLab(a.rgb);
  const q = toLab(b.rgb);
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

/**
 * 按关卡种子洗牌后挑 count 种。每挑一种，都要和已经挑的每一种色差不小于 minGap：
 * 先在满足色差的里面找轮廓也不重复的；没有就只要求色差；还没有就挑「和已挑的最不像」的那一种（尽力而为）。
 * minGap 越大颜色越分得开（前面的关卡），越小越容易出现相近的颜色（后面的关卡），见 level_curve.json 的 colorGap。
 *
 * prefer 是按先后排的几组生物 id（docs/01 5.0：本海域的 → 前面海域的）：先在第一组里按上面的规矩挑，
 * 第一组里没有满足色差的才去下一组借；都没有就在这几组里挑「和已挑的最不像」的。其余局内生物只在这几组加起来不够 count 种时才用。
 * 不给 prefer 就是所有局内生物一组。
 */
export function pickSpecies(all: readonly Species[], levelSeed: number, count: number, minGap = 0, prefer: readonly (readonly string[])[] = []): string[] {
  const inLevel = all.filter((sp) => sp.inLevel === true);
  const rng = new Rng(levelSeed);
  const used = new Set<string>();
  const tiers: Species[][] = [];
  for (const ids of prefer) {
    const tier = inLevel.filter((sp) => ids.includes(sp.id) && !used.has(sp.id));
    for (const sp of tier) used.add(sp.id);
    if (tier.length > 0) tiers.push(tier);
  }
  // 其余局内生物（后面海域的）只在前面几组加起来都不够 count 种时才用，不提前出后面海域的鱼
  const rest = inLevel.filter((sp) => !used.has(sp.id));
  if (prefer.length === 0 || used.size < count) tiers.push(rest);
  for (const t of tiers) rng.shuffle(t);
  const order = tiers.flat();
  const out: Species[] = [];
  const nearest = (sp: Species) => out.reduce((m, o) => Math.min(m, colorDistance(sp, o)), 999);
  while (out.length < count && out.length < order.length) {
    const shapes = out.map((o) => String(o.shape ?? ''));
    let pick: Species | undefined;
    for (const t of tiers) {
      const apart = t.filter((sp) => out.indexOf(sp) < 0 && nearest(sp) >= minGap);
      pick = apart.find((sp) => shapes.indexOf(String(sp.shape ?? '')) < 0) ?? apart[0];
      if (pick) break;
    }
    if (!pick) {
      const rest = order.filter((sp) => out.indexOf(sp) < 0);
      pick = rest.reduce((best, sp) => (nearest(sp) > nearest(best) ? sp : best), rest[0]);
    }
    out.push(pick);
  }
  return out.map((sp) => sp.id);
}
