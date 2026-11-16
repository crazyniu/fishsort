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
 * minGap 越大颜色越分得开（前面的关卡），越小越容易出现相近的颜色（后面的关卡），见 level_curve.json 的 colorGap
 */
export function pickSpecies(all: readonly Species[], levelSeed: number, count: number, minGap = 0): string[] {
  const order = all.filter((sp) => sp.inLevel === true);
  new Rng(levelSeed).shuffle(order);
  const out: Species[] = [];
  const nearest = (sp: Species) => out.reduce((m, o) => Math.min(m, colorDistance(sp, o)), 999);
  while (out.length < count && out.length < order.length) {
    const rest = order.filter((sp) => out.indexOf(sp) < 0);
    const apart = rest.filter((sp) => nearest(sp) >= minGap);
    const shapes = out.map((o) => String(o.shape ?? ''));
    const pick = apart.find((sp) => shapes.indexOf(String(sp.shape ?? '')) < 0) ?? apart[0] ?? rest.reduce((best, sp) => (nearest(sp) > nearest(best) ? sp : best), rest[0]);
    out.push(pick);
  }
  return out.map((sp) => sp.id);
}
