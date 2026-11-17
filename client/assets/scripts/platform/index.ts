// 启动时按运行环境挑一个平台实现（docs/04 第 5 节）：微信小游戏 → wechat，iOS / Android 原生包 → native，其余（浏览器试玩、截图）→ debug。
import { sys } from 'cc';
import { PlatformBase } from './platformBase';
import { PlatformDebug } from './platformDebug';
import { PlatformNative } from './platformNative';
import { inWechat, PlatformWechat } from './platformWechat';

export function createPlatform(): PlatformBase {
  if (inWechat()) return new PlatformWechat();
  if (sys.isNative && (sys.os === sys.OS.IOS || sys.os === sys.OS.ANDROID)) return new PlatformNative();
  return new PlatformDebug();
}
