// 存档读写。内容结构见 core/meta/playerData（docs/meta-api.md），存在平台的本地存储里。
// 关键节点（过关、消费、领奖）调 write() 立即写本地；云存档接平台时在 platform/ 里做。
import type { EconomyConfig } from '../core/config';
import * as PlayerData from '../core/meta/playerData';
import type { SaveData } from '../core/meta/save';
import type { PlatformBase } from '../platform/platformBase';
import type { LaunchFlags } from './launch';

const KEY = 'save';

export class Save {
  data!: SaveData;

  constructor(private readonly platform: PlatformBase) {}

  load(eco: EconomyConfig, flags: LaunchFlags): void {
    const text = this.platform.loadData(KEY);
    let parsed: unknown = null;
    try {
      parsed = text !== '' ? JSON.parse(text) : null;
    } catch {
      console.warn('存档损坏，重新开始');
    }
    // 测试开发版不导入旧存档：版本不对就开新档（docs/09 第 8 节）
    this.data = PlayerData.load(parsed, eco);
    if (flags.boost) this.applyBoost(flags);
  }

  /** 试玩模式：金币和技能加满，可直接跳关。正式构建不会进这里（见 launch.ts） */
  private applyBoost(flags: LaunchFlags): void {
    if (flags.level > 0) this.data.level = flags.level;
    this.data.coins = Math.max(this.data.coins, 99999);
    for (const id of Object.keys(this.data.tools)) this.data.tools[id] = Math.max(this.data.tools[id], 99);
  }

  write(): void {
    this.platform.saveData(KEY, JSON.stringify(this.data));
  }
}
