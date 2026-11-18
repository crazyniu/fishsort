// iOS / Android 原生实现（docs/04 第 5 节）：两端共用这一份，经 Cocos 的 jsbBridgeWrapper 和原生代码收发事件。
// 原生那头在 client/native/engine/ios/game/FsBridge.mm 和 client/native/engine/android/app/src/com/cocos/game/FsBridge.java，
// 两边实现同一组事件（下面 EV），参数和回复都是 JSON 字符串。
//
//   脚本 → 原生                         原生 → 脚本
//   fs.init    {ads: 广告位}             fs.ads      {ready: 广告 SDK 能用了没有}
//   fs.rewarded {placement}              fs.rewarded {result: done | skipped | unavailable}
//   fs.interstitial {placement}          fs.interstitial {}（关掉了）
//   fs.banner  {show: true | false}
//   fs.vibrate {kind}
//   fs.share   {text}                    fs.share    {ok}
//   fs.privacy {}（打开隐私选项：欧洲等地的广告同意设置）
import { native, sys } from 'cc';
import { AdResult, Capability, PlatformBase, VibrateKind } from './platformBase';
import { adUnits, loadPlatformConfig, PlatformConfig } from './platformConfig';

const PREFIX = 'fishsort.';

const EV = {
  init: 'fs.init',
  ads: 'fs.ads',
  rewarded: 'fs.rewarded',
  interstitial: 'fs.interstitial',
  banner: 'fs.banner',
  vibrate: 'fs.vibrate',
  share: 'fs.share',
  privacy: 'fs.privacy',
} as const;

/** 等原生回复最多几秒：看一条激励视频连加载带播放不会超过这么久，超时按没看完算 */
const AD_TIMEOUT = 120;

export class PlatformNative extends PlatformBase {
  readonly id: string;
  private cfg: PlatformConfig | null = null;
  private ready = false;
  private waiting = new Map<string, (arg: string) => void>();

  constructor() {
    super();
    this.id = sys.os === sys.OS.IOS ? 'ios' : 'android';
  }

  override async init(): Promise<void> {
    this.cfg = await loadPlatformConfig();
    const bridge = native.jsbBridgeWrapper;
    bridge.addNativeEventListener(EV.ads, (arg: string) => {
      this.ready = parse(arg).ready === true;
    });
    for (const ev of [EV.rewarded, EV.interstitial, EV.share]) {
      bridge.addNativeEventListener(ev, (arg: string) => {
        const done = this.waiting.get(ev);
        this.waiting.delete(ev);
        done?.(arg);
      });
    }
    bridge.dispatchEventToNative(EV.init, JSON.stringify({ ads: adUnits(this.cfg, this.id) }));
  }

  /** 发一个事件，等同名的回复 */
  private ask(ev: string, payload: Record<string, unknown>, timeoutSec: number): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      // 同一种请求同时只有一个（广告一次只播一个）
      if (this.waiting.has(ev)) { resolve({}); return; }
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.waiting.delete(ev);
        resolve({});
      }, timeoutSec * 1000);
      this.waiting.set(ev, (arg) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(parse(arg));
      });
      native.jsbBridgeWrapper.dispatchEventToNative(ev, JSON.stringify(payload));
    });
  }

  override adsAvailable(): boolean {
    return this.ready;
  }

  override async showRewarded(placement: string): Promise<AdResult> {
    if (!this.ready) return 'unavailable';
    const r = await this.ask(EV.rewarded, { placement }, AD_TIMEOUT);
    const result = r.result;
    return result === 'done' || result === 'skipped' ? result : 'unavailable';
  }

  override async showInterstitial(placement: string): Promise<void> {
    if (!this.ready) return;
    await this.ask(EV.interstitial, { placement }, AD_TIMEOUT);
  }

  override showBanner(_placement: string): void {
    if (this.ready) native.jsbBridgeWrapper.dispatchEventToNative(EV.banner, JSON.stringify({ show: true }));
  }

  override hideBanner(): void {
    native.jsbBridgeWrapper.dispatchEventToNative(EV.banner, JSON.stringify({ show: false }));
  }

  override async share(payload: Record<string, unknown>): Promise<boolean> {
    const name = this.cfg?.name.en ?? '';
    const r = await this.ask(EV.share, { text: String(payload.text ?? name) }, 300);
    return r.ok === true;
  }

  override vibrate(kind: VibrateKind): void {
    native.jsbBridgeWrapper.dispatchEventToNative(EV.vibrate, JSON.stringify({ kind }));
  }

  override loadData(key: string): string {
    const v: unknown = sys.localStorage.getItem(PREFIX + key);
    return typeof v === 'string' ? v : '';
  }

  override saveData(key: string, value: string): void {
    sys.localStorage.setItem(PREFIX + key, value);
  }

  override hasCapability(cap: Capability): boolean {
    return (cap === 'confirmed_share' && this.id === 'ios') || cap === 'share' || cap === 'vibrate' || cap === 'privacy_options';
  }

  override openPrivacyOptions(): void {
    native.jsbBridgeWrapper.dispatchEventToNative(EV.privacy, '{}');
  }
}

function parse(arg: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(arg || '{}');
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
