// 给一关挑生物：同一关里任意两种的主色（hue）和轮廓（shape）都不相同，一眼能分清。
// 只从标了 inLevel 的生物里挑（16 种）。对应 Godot 版 src/game/game_species.gd。
import type { Species } from '../config';
import { Rng } from '../rng/rng';

/** 按关卡种子洗牌后依次挑 count 种。先要求主色和轮廓都不重复；凑不够再只要求主色不重复；还不够就随便补齐 */
export function pickSpecies(all: readonly Species[], levelSeed: number, count: number): string[] {
  const order = all.filter((sp) => sp.inLevel === true);
  new Rng(levelSeed).shuffle(order);
  const out: string[] = [];
  const hues = new Set<string>();
  const shapes = new Set<string>();
  for (const strict of [2, 1, 0]) {
    for (const sp of order) {
      if (out.length >= count) return out;
      if (out.includes(sp.id)) continue;
      const hue = String(sp.hue ?? '');
      const shape = String(sp.shape ?? '');
      if (strict >= 1 && hues.has(hue)) continue;
      if (strict >= 2 && shapes.has(shape)) continue;
      out.push(sp.id);
      hues.add(hue);
      shapes.add(shape);
    }
  }
  return out;
}
