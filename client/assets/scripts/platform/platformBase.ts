// 平台能力接口，见 docs/04-技术架构.md 第 5 节。wx / tt / FBInstant / 原生调用只许出现在 platform/ 里，
// 业务代码只认这个接口，功能差异一律用 hasCapability 判断，不按平台 id 分支（CLAUDE.md 硬性约束 4）。

export type AdResult = 'done' | 'skipped' | 'unavailable';

export interface Profile {
  nickname: string;
  /** 头像图片地址；空串 = 用默认头像 */
  avatar: string;
}

export interface RankEntry {
  name: string;
  avatar: string;
  score: number;
}

/** 平台能力名 */
export type Capability = 'iap' | 'sidebar' | 'add_to_desktop' | 'friend_rank' | 'share' | 'vibrate' | 'ad_test';

export type VibrateKind = 'light' | 'medium' | 'heavy';

export abstract class PlatformBase {
  abstract readonly id: string;

  async init(): Promise<void> {}

  /** 激励视频。必须完整看完才返回 done */
  async showRewarded(_placement: string): Promise<AdResult> {
    return 'unavailable';
  }

  async showInterstitial(_placement: string): Promise<void> {}

  showBanner(_placement: string): void {}

  hideBanner(): void {}

  /** 广告当前能不能用；不能用时界面要降级（改金币支付或隐藏入口，docs/01 7.1） */
  adsAvailable(): boolean {
    return false;
  }

  /** 头像昵称；拒绝授权时返回 null（界面用默认头像和随机昵称） */
  async getProfile(): Promise<Profile | null> {
    return null;
  }

  /** 好友周榜（不含自己）。平台不支持时返回空，排行页只显示过关目标 */
  async getRankList(_board: string): Promise<RankEntry[]> {
    return [];
  }

  /** 本地存档读写 */
  loadData(_key: string): string {
    return '';
  }

  saveData(_key: string, _value: string): void {}

  async share(_payload: Record<string, unknown>): Promise<boolean> {
    return false;
  }

  submitScore(_board: string, _value: number): void {}

  vibrate(_kind: VibrateKind): void {}

  track(_event: string, _params: Record<string, unknown> = {}): void {}

  hasCapability(_cap: Capability): boolean {
    return false;
  }

  /** 启动参数：网页是地址栏的 ?level=65&autoplay=1，小游戏是启动 query */
  launchQuery(): Record<string, string> {
    return {};
  }
}
