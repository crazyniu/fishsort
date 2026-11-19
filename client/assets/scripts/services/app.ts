// 全局服务的入口：平台、配置、存档。启动时 Boot 调 App.start()，之后界面层从这里取。
import type { Capability, PlatformBase } from '../platform/platformBase';
import { createPlatform } from '../platform/index';
import * as Features from '../core/meta/features';
import { Config } from './config';
import { LaunchFlags, parseLaunch } from './launch';
import { Save } from './save';

export class App {
  static platform: PlatformBase;
  static config: Config;
  static save: Save;
  static flags: LaunchFlags;
  /** 设置里有没有「难度调试」（game.json 的 levelLab；Boot 读到平台配置后填） */
  static levelLab = false;

  /**
   * 能点开的最高一关：平时是存档进度；试玩模式（./run.sh 不带 real）所有关都能点开，进度本身不改
   * （用户 2026-11-17：run.sh 里所有关卡都解锁）
   */
  static reach(): number {
    return App.flags.boost ? Math.max(App.save.data.level, App.config.levelCount) : App.save.data.level;
  }

  /** 功能开没开：按存档进度；试玩模式下「选关」（海图、选关页）一直开着，好挑关 */
  static featureOpen(f: string): boolean {
    return (App.flags.boost && f === 'levelSelect') || Features.isUnlocked(App.config.eco, f, App.save.data.level);
  }

  static async start(): Promise<void> {
    App.platform = createPlatform();
    await App.platform.init();
    App.flags = parseLaunch(App.platform.launchQuery());
    App.config = new Config();
    await App.config.load();
    // 每日任务：平台没有对应能力的不进池子（如分享；cap 为 ads 的「看广告」在这一版没有广告时不进，docs/01 7.1）
    const tasks = App.config.eco.tasks;
    if (tasks) tasks.pool = tasks.pool.filter((t) => t.cap === undefined || App.platform.hasCapability(t.cap as Capability));
    App.save = new Save(App.platform);
    App.save.load(App.config.eco, App.flags);
  }
}
