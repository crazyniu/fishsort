// 开发用实现：头像昵称与排行榜写死，存档在 localStorage，广告是模拟的。
// 浏览器试玩、截图都用它；真实平台接入前三端都先跑它（docs/04 第 5 节）。
import { sys } from 'cc';
import { AdResult, Capability, PlatformBase, Profile, RankEntry, VibrateKind, WindowRect } from './platformBase';

const PREFIX = 'fishsort.';

/** 模拟广告页由界面层提供（平台层不碰界面）：Boot 启动时注入 */
export interface MockAdView {
  show(kind: 'rewarded' | 'interstitial', placement: string): Promise<AdResult>;
  banner(placement: string | null): void;
}

export class PlatformDebug extends PlatformBase {
  readonly id = 'debug';
  /** 广告测试页可以把它关掉，检查「广告不可用」时的降级表现 */
  adsOn = true;
  view: MockAdView | null = null;
  /** 今天每个广告位展示了几次（广告测试页看） */
  shown: Record<string, number> = {};

  override adsAvailable(): boolean {
    return this.adsOn;
  }

  // 模拟广告页（docs/01 7.2）：激励视频全屏、5 秒倒计时，「看完」「中途关闭」「加载失败」；插屏 1 秒后出关闭键
  override async showRewarded(placement: string): Promise<AdResult> {
    if (!this.adsOn) return 'unavailable';
    this.shown[placement] = (this.shown[placement] ?? 0) + 1;
    if (!this.view) return 'done';
    return this.view.show('rewarded', placement);
  }

  override async showInterstitial(placement: string): Promise<void> {
    if (!this.adsOn) return;
    this.shown[placement] = (this.shown[placement] ?? 0) + 1;
    if (this.view) await this.view.show('interstitial', placement);
  }

  override showBanner(placement: string): void {
    if (!this.adsOn) return;
    this.shown[placement] = (this.shown[placement] ?? 0) + 1;
    this.view?.banner(placement);
  }

  override hideBanner(): void {
    this.view?.banner(null);
  }

  // 开发阶段分享即成功（微信对分享得奖励有限制，接平台时按当时规则改）
  override async share(_payload: Record<string, unknown>): Promise<boolean> {
    return true;
  }

  override async getProfile(): Promise<Profile | null> {
    return { nickname: '测试玩家', avatar: '' };
  }

  override async getRankList(_board: string): Promise<RankEntry[]> {
    const names = ['浪花朵朵', 'SeaBreeze', '珊瑚一号', 'MintWave', '小贝壳', 'BubbleKing', '海盐汽水', 'Luna'];
    const scores = [38, 32, 29, 21, 18, 12, 7, 3];
    return names.map((name, i) => ({ name, avatar: '', score: scores[i] ?? 0 }));
  }

  override loadData(key: string): string {
    const v: unknown = sys.localStorage.getItem(PREFIX + key);
    return typeof v === 'string' ? v : '';
  }

  override saveData(key: string, value: string): void {
    sys.localStorage.setItem(PREFIX + key, value);
  }

  // 浏览器：安卓 Chrome 支持 navigator.vibrate，桌面和 iOS 没有（不报错，直接不震）
  override vibrate(kind: VibrateKind): void {
    const nav = globalThis.navigator as (Navigator & { vibrate?: (ms: number) => boolean }) | undefined;
    nav?.vibrate?.(kind === 'light' ? 12 : kind === 'medium' ? 25 : 45);
  }

  override track(event: string, params: Record<string, unknown> = {}): void {
    console.log('[track]', event, params);
  }

  override hasCapability(cap: Capability): boolean {
    return cap === 'friend_rank' || cap === 'share' || cap === 'ad_test' || cap === 'vibrate';
  }

  /**
   * 模拟手机的刘海和微信的胶囊按钮（地址栏加 ?notch=1、?capsule=1；./run.sh 里同样能带），
   * 按 iPhone 15 的尺寸：宽 393，状态栏 + 灵动岛 59，底部手势条 34，胶囊在 y 63–95、x 300–387
   */
  override safeArea(): WindowRect | null {
    const q = this.launchQuery();
    if (q.notch !== '1' && q.capsule !== '1') return null;
    return { top: 59, bottom: 852 - 34, left: 0, right: 393, windowWidth: 393, windowHeight: 852 };
  }

  override menuButton(): WindowRect | null {
    if (this.launchQuery().capsule !== '1') return null;
    return { top: 63, bottom: 95, left: 300, right: 387, windowWidth: 393, windowHeight: 852 };
  }

  override launchQuery(): Record<string, string> {
    const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
    const out: Record<string, string> = {};
    new URLSearchParams(search).forEach((v, k) => (out[k] = v));
    return out;
  }
}
