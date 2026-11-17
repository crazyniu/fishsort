// 海域，见 docs/01 第 5.0 节。收藏的册子、关卡背景、局内出场的生物用同一套 6 个海域。
import type { EconomyConfig, Sea } from '../config';

export function list(eco: EconomyConfig): Sea[] {
  return eco.seas ?? [];
}

/** 第 fileId 个关卡文件用哪片海域的背景（传 Meta.levelFile 换算后的编号），返回海域下标 */
export function forLevel(eco: EconomyConfig, fileId: number): number {
  const seas = list(eco);
  let at = 0;
  for (let i = 0; i < seas.length; i++) if (fileId >= seas[i].levelFrom) at = i;
  return at;
}

/**
 * 一关挑生物时按先后试的几组（docs/01 5.0）：这片海域的生物在前，前面几片海域的在后（打到新海域换一批鱼，
 * 凑不够一眼分清的颜色时从已经见过的海域借，不提前出后面海域的）。只列 id，是不是局内生物由挑的人再筛
 */
export function speciesPools(eco: EconomyConfig, seaIdx: number): string[][] {
  const seas = list(eco);
  const books = eco.album?.books ?? [];
  const cardsOf = (i: number): string[] => books.find((b) => b.sea === seas[i]?.id)?.cards ?? [];
  const earlier: string[] = [];
  for (let i = seaIdx - 1; i >= 0; i--) earlier.push(...cardsOf(i));
  return [cardsOf(seaIdx), earlier];
}
