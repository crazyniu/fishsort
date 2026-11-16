// 启动时按运行环境挑一个平台实现。真实平台（wx / tt / FBInstant / 原生）之后单独做，在那之前全部用 debug。
import { PlatformBase } from './platformBase';
import { PlatformDebug } from './platformDebug';

export function createPlatform(): PlatformBase {
  return new PlatformDebug();
}
