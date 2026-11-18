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
export type Capability = 'iap' | 'sidebar' | 'add_to_desktop' | 'friend_rank' | 'share' | 'confirmed_share' | 'vibrate' | 'ad_test' | 'privacy_options';

export type VibrateKind = 'light' | 'medium' | 'heavy';

/** 屏幕上的一块区域，单位是平台的窗口坐标（微信是逻辑像素），附窗口宽高，界面层自己换算成设计单位 */
export interface WindowRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
  windowWidth: number;
  windowHeight: number;
}

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

  /** true 表示用户已经完成分享；仅弹出分享界面不能领取奖励。 */
  async share(_payload: Record<string, unknown>): Promise<boolean> {
    return false;
  }

  submitScore(_board: string, _value: number): void {}

  vibrate(_kind: VibrateKind): void {}

  track(_event: string, _params: Record<string, unknown> = {}): void {}

  /** 打开广告的隐私选项（欧洲等地的同意设置）；hasCapability('privacy_options') 时设置里才有入口 */
  openPrivacyOptions(): void {}

  hasCapability(_cap: Capability): boolean {
    return false;
  }

  /**
   * 右上角平台自带的按钮（微信小游戏的「胶囊」：··· 和关闭），游戏的顶栏要让开它。没有返回 null
   */
  menuButton(): WindowRect | null {
    return null;
  }

  /**
   * 安全区（刘海、灵动岛、状态栏、底部手势条之外的区域）。返回 null = 用引擎的 sys.getSafeAreaRect()。
   * 调试平台用它模拟刘海屏
   */
  safeArea(): WindowRect | null {
    return null;
  }

  /** 启动参数：网页是地址栏的 ?level=65&autoplay=1，小游戏是启动 query */
  launchQuery(): Record<string, string> {
    return {};
  }
}
