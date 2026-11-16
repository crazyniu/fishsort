// 海域，见 docs/01 第 5.0 节。收藏的册子、家园的区域、关卡背景用同一套 6 个海域。
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
