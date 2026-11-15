// 调试开关（docs/09 第 8 节）：网页地址参数代替 Godot 版的环境变量。只在调试构建里生效。
//   ?level=65     直接跳到第 65 关
//   ?autoplay=1   局内由机器人代打（看结算、宝箱等画面用）
//   ?play=1       直接进关（截局内画面用），不带就停在主页
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
}

export function parseLaunch(query: Record<string, string>, debug: boolean = DEBUG): LaunchFlags {
  if (!debug) return { boost: false, level: 0, autoplay: false, play: false };
  const level = Math.max(0, Math.trunc(Number(query.level ?? 0)) || 0);
  return { boost: query.real !== '1', level, autoplay: query.autoplay === '1', play: query.play === '1' || query.autoplay === '1' };
}
