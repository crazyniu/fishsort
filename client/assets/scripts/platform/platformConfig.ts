// 平台配置：config/platform.json（由仓库根目录的 game.json 生成，tools/native/apply.mjs），平台实现启动时自己读。
// 只放平台层要的东西：各平台的广告位 ID。
import { JsonAsset, resources } from 'cc';

export interface AdUnits {
  rewarded: string;
  interstitial: string;
  banner: string;
}

export interface PlatformConfig {
  name: Record<string, string>;
  version: string;
  ads: Record<string, AdUnits>;
}

const EMPTY: PlatformConfig = { name: {}, version: '', ads: {} };

export function loadPlatformConfig(): Promise<PlatformConfig> {
  return new Promise((resolve) => {
    resources.load('config/platform', JsonAsset, (err: Error | null, asset: JsonAsset) => {
      // 读不到就当没有广告位，不挡启动
      if (err || !asset?.json) resolve(EMPTY);
      else resolve(asset.json as PlatformConfig);
    });
  });
}

export function adUnits(cfg: PlatformConfig, platform: string): AdUnits {
  return cfg.ads[platform] ?? { rewarded: '', interstitial: '', banner: '' };
}
