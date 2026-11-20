// 微信小游戏：分包里挪到网上的资源，读的时候换成网上的地址（docs/04 第 8 节）。
// resources 在微信上打成分包、随安装包下到手机；首屏用不到的文件由 tools/wechat/remote.mjs 挪到静态网站托管，
// 挪走的列表写在 settings 的 assets.fsRemote（base = 分包里的路径前缀，server = 网上的前缀，files = 相对路径）。
// 这里往引擎的地址管线（transformPipeline）最后加一步：要读的文件在列表里，就把地址换成网上的；
// 引擎的微信适配层遇到网上的地址会下载并缓存在手机上，下次没网也能读。别的平台没有这项设置，什么都不做。
// 要在读 resources 之前调（Boot 一开始）。
import { AssetManager, assetManager, settings, SettingsCategory } from 'cc';

interface RemoteFiles {
  base: string;
  server: string;
  files: string[];
}

let installed = false;

function remoteFiles(v: unknown): RemoteFiles | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Partial<RemoteFiles>;
  if (typeof o.base !== 'string' || typeof o.server !== 'string' || !o.server || !Array.isArray(o.files) || o.files.length === 0) return null;
  return { base: o.base, server: o.server, files: o.files };
}

export function installRemoteFiles(): void {
  if (installed) return;
  installed = true;
  const cfg = remoteFiles(settings.querySettings(SettingsCategory.ASSETS, 'fsRemote'));
  if (!cfg) return;
  const remote = new Set(cfg.files);
  const base = cfg.base;
  assetManager.transformPipeline.append((task: AssetManager.Task): void => {
    const items = task.output as { url?: unknown }[];
    for (const item of items) {
      const url = item.url;
      if (typeof url !== 'string') continue;
      // 适配层给的分包路径可能带 ./ 或 /，前缀对上了再查
      const at = url.indexOf(base);
      if (at < 0 || at > 2) continue;
      const rel = url.slice(at + base.length);
      if (remote.has(rel)) item.url = cfg.server + rel;
    }
  });
}
