// 开发用实现：头像昵称与排行榜写死，存档在 localStorage，广告是模拟的。
// 浏览器试玩、截图都用它；真实平台接入前三端都先跑它（docs/04 第 5 节）。
import { sys } from 'cc';
import { AdResult, Capability, PlatformBase, Profile, RankEntry } from './platformBase';

const PREFIX = 'fishsort.';

export class PlatformDebug extends PlatformBase {
  readonly id = 'debug';
  /** 广告测试页可以把它关掉，检查「广告不可用」时的降级表现 */
  adsOn = true;

  override adsAvailable(): boolean {
    return this.adsOn;
  }

  // 模拟广告页（倒计时、看完 / 中途关闭 / 加载失败三个按钮）在第 7 步做；之前直接算看完
  override async showRewarded(placement: string): Promise<AdResult> {
    if (!this.adsOn) return 'unavailable';
    console.log(`[ad] 模拟激励视频 ${placement}：直接算看完`);
    return 'done';
  }

  override async showInterstitial(placement: string): Promise<void> {
    if (this.adsOn) console.log(`[ad] 模拟插屏 ${placement}`);
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

  override track(event: string, params: Record<string, unknown> = {}): void {
    console.log('[track]', event, params);
  }

  override hasCapability(cap: Capability): boolean {
    return cap === 'friend_rank' || cap === 'share' || cap === 'ad_test';
  }

  override launchQuery(): Record<string, string> {
    const search = (globalThis as { location?: { search?: string } }).location?.search ?? '';
    const out: Record<string, string> = {};
    new URLSearchParams(search).forEach((v, k) => (out[k] = v));
    return out;
  }
}
