// 调试开关：网页地址参数，由 ./run.sh 的试玩参数拼出来（./run.sh level 65 → ?level=65&play=1）。只在调试构建里生效。
//   ?level=65     跳到第 65 关
//   ?play=1       直接进关（不带就停在主页）；没给 level 就进当前关
//   ?autoplay=1   直接进关，局内由机器人代打（看连击、结算、宝箱等画面用）
//   ?page=levels  启动后直接打开这一页（截图用）
//   ?real=1       按真实存档进度玩；不带时是试玩模式，金币和技能加满
import { DEBUG } from 'cc/env';

export interface LaunchFlags {
  /** 试玩模式：金币、技能加满 */
  boost: boolean;
  /** 跳到第几关，0 = 不跳 */
  level: number;
  autoplay: boolean;
  /** 直接进关 */
  play: boolean;
  /** 启动后直接打开的页面名，空 = 主页 */
  page: string;
}

export function parseLaunch(query: Record<string, string>, debug: boolean = DEBUG): LaunchFlags {
  if (!debug) return { boost: false, level: 0, autoplay: false, play: false, page: '' };
  const level = Math.max(0, Math.trunc(Number(query.level ?? 0)) || 0);
  return { boost: query.real !== '1', level, autoplay: query.autoplay === '1', play: query.play === '1' || query.autoplay === '1', page: query.page ?? '' };
}
