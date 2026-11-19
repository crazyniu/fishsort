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
  ads: Record<string, AdUnits>;
}

const EMPTY: PlatformConfig = { name: {}, version: '', adsEnabled: false, ads: {} };

export function loadPlatformConfig(): Promise<PlatformConfig> {
  return new Promise((resolve) => {
    resources.load('config/platform', JsonAsset, (err: Error | null, asset: JsonAsset) => {
      // 读不到就当没有广告位，不挡启动
      if (err || !asset?.json) resolve(EMPTY);
      else resolve(asset.json as PlatformConfig);
    });
  });
}

/** 这个平台的广告位；广告总开关关着时全空（等于没有广告） */
export function adUnits(cfg: PlatformConfig, platform: string): AdUnits {
  const none = { rewarded: '', interstitial: '', banner: '' };
  return cfg.adsEnabled === true ? (cfg.ads[platform] ?? none) : none;
}
