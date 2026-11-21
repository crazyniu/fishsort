// 平台配置：config/platform.json（由仓库根目录的 game.json 生成，tools/native/apply.mjs），平台实现启动时自己读。
// 只放平台层要的东西：广告总开关、各平台的广告位 ID。
import { JsonAsset, resources } from 'cc';

export interface AdUnits {
  rewarded: string;
  interstitial: string;
  banner: string;
}

export interface PlatformConfig {
  name: Record<string, string>;
  version: string;
  /** 各端带哪些语言（game.json 的 languages）：app = iOS、Android 和调试网页，wechat = 微信小游戏 */
  languages?: { app?: string[]; wechat?: string[] };
  /** 广告总开关（game.json 的 ads.enabled）：false = 三端都没有广告 */
  adsEnabled: boolean;
  /** 隐私政策网页（game.json 的 privacyPolicy），设置里的「隐私政策」打开它 */
  privacyPolicy?: string;
  /** 难度调试页：开发版才有（PlatformBase.isDevBuild）；写 false 连开发版也不出 */
  levelLab?: boolean;
  ads: Record<string, AdUnits>;
}

const EMPTY: PlatformConfig = { name: {}, version: '', adsEnabled: false, ads: {} };

let loading: Promise<PlatformConfig> | null = null;

/**
 * 读平台配置（只读一次，几处调用共用）。读失败要报错，由加载页重试：原来读不到就当空配置进游戏，
 * 微信上一次网络抖动就整局没有广告、没有隐私入口（#170 复审）。失败后下次调用重新读
 */
export function loadPlatformConfig(): Promise<PlatformConfig> {
  if (!loading) {
    loading = new Promise<PlatformConfig>((resolve, reject) => {
      resources.load('config/platform', JsonAsset, (err: Error | null, asset: JsonAsset) => {
        if (err) reject(err);
        else if (!asset?.json) reject(new Error('config/platform 是空的'));
        else resolve({ ...EMPTY, ...(asset.json as PlatformConfig) });
      });
    });
    loading.catch(() => (loading = null));
  }
  return loading;
}

/** 这个平台的广告位；广告总开关关着时全空（等于没有广告） */
export function adUnits(cfg: PlatformConfig, platform: string): AdUnits {
  const none = { rewarded: '', interstitial: '', banner: '' };
  return cfg.adsEnabled === true ? (cfg.ads[platform] ?? none) : none;
}
