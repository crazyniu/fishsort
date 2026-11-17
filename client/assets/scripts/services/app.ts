// 全局服务的入口：平台、配置、存档。启动时 Boot 调 App.start()，之后界面层从这里取。
import type { Capability, PlatformBase } from '../platform/platformBase';
import { createPlatform } from '../platform/index';
import { Config } from './config';
import { LaunchFlags, parseLaunch } from './launch';
import { Save } from './save';

export class App {
  static platform: PlatformBase;
  static config: Config;
  static save: Save;
  static flags: LaunchFlags;

  static async start(): Promise<void> {
    App.platform = createPlatform();
    await App.platform.init();
    App.flags = parseLaunch(App.platform.launchQuery());
    App.config = new Config();
    await App.config.load();
    // 每日任务：平台没有对应能力的（如分享）不进池子
    const tasks = App.config.eco.tasks;
    if (tasks) tasks.pool = tasks.pool.filter((t) => t.cap === undefined || App.platform.hasCapability(t.cap as Capability));
    App.save = new Save(App.platform);
    App.save.load(App.config.eco, App.flags);
  }
}
