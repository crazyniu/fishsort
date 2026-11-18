// 微信小游戏实现（docs/04 第 5 节、docs/06 第 2 节）。wx 只许出现在 platform/ 里。
// 广告位在 game.json 的 ads.wechat（开通流量主后在后台建好填进来）；空着就当没有广告，看广告的入口自动隐藏（docs/01 7.1）。
import { sys } from 'cc';
import { AdResult, Capability, PlatformBase, VibrateKind, WindowRect } from './platformBase';
import { adUnits, AdUnits, loadPlatformConfig } from './platformConfig';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare const wx: any;

const PREFIX = 'fishsort.';

/** 是不是在微信小游戏里跑 */
export function inWechat(): boolean {
  return typeof wx !== 'undefined' && typeof wx.getSystemInfoSync === 'function';
}

export class PlatformWechat extends PlatformBase {
  readonly id = 'wechat';
  private units: AdUnits = { rewarded: '', interstitial: '', banner: '' };
  private rewarded: any = null;
  private rewardedReady = false;
  private playingRewarded = false;
  private interstitial: any = null;
  private banner: any = null;
  private title = '';

  override async init(): Promise<void> {
    const cfg = await loadPlatformConfig();
    this.units = adUnits(cfg, 'wechat');
    this.title = cfg.name.zh_CN ?? '';
    // 右上角菜单里的「转发」「分享到朋友圈」（不给奖励，docs/01 5.8）
    try {
      wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage', 'shareTimeline'] });
      wx.onShareAppMessage(() => ({ title: this.title }));
    } catch {
      /* 老版本基础库没有 */
    }
    this.createAds();
  }

  private createAds(): void {
    if (this.units.rewarded && typeof wx.createRewardedVideoAd === 'function') {
      this.rewarded = wx.createRewardedVideoAd({ adUnitId: this.units.rewarded });
      this.rewarded.onLoad(() => (this.rewardedReady = true));
      this.rewarded.onError(() => (this.rewardedReady = false));
      const preload = () => {
        if (!this.rewardedReady && !this.playingRewarded) this.rewarded.load().catch(() => (this.rewardedReady = false));
      };
      preload();
      wx.onShow(preload);
    }
    if (this.units.interstitial && typeof wx.createInterstitialAd === 'function') {
      this.interstitial = wx.createInterstitialAd({ adUnitId: this.units.interstitial });
      this.interstitial.onError(() => undefined);
    }
  }

  override adsAvailable(): boolean {
    return this.rewarded !== null && this.rewardedReady && !this.playingRewarded;
  }

  override showRewarded(_placement: string): Promise<AdResult> {
    const ad = this.rewarded;
    if (!ad || !this.rewardedReady || this.playingRewarded) return Promise.resolve('unavailable');
    this.playingRewarded = true;
    this.rewardedReady = false;
    return new Promise<AdResult>((resolve) => {
      let settled = false;
      const finish = (result: AdResult) => {
        if (settled) return;
        settled = true;
        ad.offClose(onClose);
        ad.offError(onError);
        this.playingRewarded = false;
        resolve(result);
      };
      // 播放失败（没填充、网络断了）：这次按不可用，同时重新加载一条，不然要等切回前台才会再加载
      const onError = () => {
        finish('unavailable');
        ad.load().catch(() => (this.rewardedReady = false));
      };
      const onClose = (res?: { isEnded?: boolean }) => {
        finish(res?.isEnded === true ? 'done' : 'skipped');
        ad.load().catch(() => (this.rewardedReady = false));
      };
      ad.onClose(onClose);
      ad.onError(onError);
      ad.show().catch(onError);
    });
  }

  override async showInterstitial(_placement: string): Promise<void> {
    const ad = this.interstitial;
    if (!ad) return;
    await new Promise<void>((resolve) => {
      const onClose = () => {
        ad.offClose(onClose);
        resolve();
      };
      ad.onClose(onClose);
      ad.show().catch(() => {
        ad.offClose(onClose);
        resolve();
      });
    });
  }

  override showBanner(_placement: string): void {
    if (!this.units.banner || typeof wx.createBannerAd !== 'function') return;
    if (!this.banner) {
      const info = windowInfo();
      const width = Math.min(info.windowWidth, 360);
      this.banner = wx.createBannerAd({
        adUnitId: this.units.banner,
        adIntervals: 30,
        style: { left: (info.windowWidth - width) / 2, top: info.windowHeight - 100, width },
      });
      // 实际高度出来以后贴底（避开底部安全区）
      this.banner.onResize((size: { width: number; height: number }) => {
        const bottom = info.safeArea ? info.safeArea.bottom : info.windowHeight;
        this.banner.style.top = bottom - size.height;
        this.banner.style.left = (info.windowWidth - size.width) / 2;
      });
      this.banner.onError(() => undefined);
    }
    this.banner.show().catch(() => undefined);
  }

  override hideBanner(): void {
    this.banner?.hide();
  }

  override async share(payload: Record<string, unknown>): Promise<boolean> {
    // 分享面板没有完成回执，只做普通分享。
    wx.shareAppMessage({ title: String(payload.title ?? this.title) });
    return false;
  }

  override vibrate(kind: VibrateKind): void {
    if (kind === 'heavy') wx.vibrateLong?.({});
    else wx.vibrateShort?.({ type: kind === 'light' ? 'light' : 'medium' });
  }

  override loadData(key: string): string {
    const v: unknown = sys.localStorage.getItem(PREFIX + key);
    return typeof v === 'string' ? v : '';
  }

  override saveData(key: string, value: string): void {
    sys.localStorage.setItem(PREFIX + key, value);
  }

  override menuButton(): WindowRect | null {
    try {
      const r = wx.getMenuButtonBoundingClientRect();
      const info = windowInfo();
      if (!r || !r.bottom) return null;
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, windowWidth: info.windowWidth, windowHeight: info.windowHeight };
    } catch {
      return null;
    }
  }

  override safeArea(): WindowRect | null {
    const info = windowInfo();
    const s = info.safeArea;
    if (!s) return null;
    return { top: s.top, bottom: s.bottom, left: s.left, right: s.right, windowWidth: info.windowWidth, windowHeight: info.windowHeight };
  }

  override hasCapability(cap: Capability): boolean {
    return cap === 'share' || cap === 'vibrate';
  }

  override launchQuery(): Record<string, string> {
    try {
      const q = wx.getLaunchOptionsSync()?.query ?? {};
      const out: Record<string, string> = {};
      for (const k of Object.keys(q)) out[k] = String(q[k]);
      return out;
    } catch {
      return {};
    }
  }
}

interface WindowInfo {
  windowWidth: number;
  windowHeight: number;
  safeArea?: { top: number; bottom: number; left: number; right: number };
}

/** 新基础库用 getWindowInfo，老的用 getSystemInfoSync */
function windowInfo(): WindowInfo {
  try {
    if (typeof wx.getWindowInfo === 'function') return wx.getWindowInfo() as WindowInfo;
  } catch {
    /* 落到下面 */
  }
  return wx.getSystemInfoSync() as WindowInfo;
}
