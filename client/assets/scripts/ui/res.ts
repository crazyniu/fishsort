// 界面资源缓存（docs/04 第 8 节）：启动时读界面部件、图标、字体和眼前要用的鱼，之后同步取用；
// 其余的图（收藏册封面、别的海域的鱼、背景）用到时再读——kit 的 img() 遇到还没读的图会先建空节点、读到再显示。
// 微信版的 resources 是放在网上的远程包（tools/wechat/remote.mjs），所以这里每一步都可能因为网络失败，失败就抛出，由加载页重试。
// 字体在本地 boot 包里（不在 resources）：微信下载来的 TTF 注册失败时引擎会静默退回 Arial，整个界面变成系统字。
import { AssetManager, Font, JsonAsset, SpriteFrame, TTFFont, assetManager, resources } from 'cc';

const frames = new Map<string, SpriteFrame>();
const pending = new Map<string, Promise<SpriteFrame | null>>();
let font: Font | null = null;

/** 进度回调：已完成数、总数 */
export type Progress = (done: number, total: number) => void;

/** 读 resources 包本身（微信版要从网上下它的目录；别的平台引擎启动时已经读好，这里直接返回） */
export function ensureResources(): Promise<void> {
  if (assetManager.getBundle('resources')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    assetManager.loadBundle('resources', (err: Error | null) => (err ? reject(err) : resolve()));
  });
}

let bootBundle: Promise<AssetManager.Bundle> | null = null;

/** 读本地的 boot 包（加载页的背景、logo、文案、字体，打在安装包里）；只读一次，失败了下次再试 */
export function loadBootBundle(): Promise<AssetManager.Bundle> {
  if (!bootBundle) {
    bootBundle = new Promise<AssetManager.Bundle>((resolve, reject) => {
      assetManager.loadBundle('boot', (err: Error | null, b: AssetManager.Bundle) => (err ? reject(err) : resolve(b)));
    });
    bootBundle.catch(() => (bootBundle = null));
  }
  return bootBundle;
}

/** 图的键（'skin/j_bowl'、'fish/c01'）→ resources 里的路径 */
function assetPath(key: string): string {
  return key.startsWith('fish/') ? `${key}/spriteFrame` : `ui/${key}/spriteFrame`;
}

/** 键 ← resources 里的路径 */
function keyOf(path: string): string {
  return path.replace(/^ui\//, '').replace(/\/spriteFrame$/, '');
}

/** 一次读一批图（读过的跳过），按文件数报进度 */
export function loadFrames(keys: string[], onProgress?: Progress): Promise<void> {
  const todo = Array.from(new Set(keys)).filter((k) => !frames.has(k));
  if (todo.length === 0) {
    onProgress?.(1, 1);
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    resources.load(
      todo.map(assetPath),
      SpriteFrame,
      (done: number, total: number) => onProgress?.(done, total),
      (err: Error | null, list: SpriteFrame[]) => {
        if (err) return reject(err);
        todo.forEach((k, i) => list[i] && frames.set(k, list[i]));
        resolve();
      },
    );
  });
}

/** 目录里所有图的键（只看目录表，不下载） */
export function keysIn(dir: string): string[] {
  return resources.getDirWithPath(dir, SpriteFrame).map((i) => keyOf(i.path));
}

/**
 * 启动时要读好的界面图：部件、图标全部，收藏册的大封面（skin/j_book_*，十几张、4 MB 多）除外，打开收藏页时再读。
 * 鱼不在这里，由 Boot 按眼前的海域另读。
 */
export function startupFrames(): string[] {
  return [...keysIn('ui/kit'), ...keysIn('ui/skin'), ...keysIn('ui/icon')].filter((k) => !k.startsWith('skin/j_book_'));
}

let fontLoading: Promise<Font> | null = null;

/** 读游戏字体（boot 包的 round.ttf）；加载页和启动步骤都会调，只读一次 */
export function loadFont(): Promise<Font> {
  if (font) return Promise.resolve(font);
  if (!fontLoading) {
    fontLoading = loadBootBundle().then(
      (b) =>
        new Promise<Font>((resolve, reject) => {
          b.load('round', TTFFont, (err: Error | null, f: TTFFont) => {
            if (err) return reject(err);
            font = f;
            resolve(f);
          });
        }),
    );
    fontLoading.catch(() => (fontLoading = null));
  }
  return fontLoading;
}

export function uiFont(): Font | null {
  return font;
}

/** 已读好的图：'kit/dot_red'、'skin/j_btn_green'、'icon/coin'、'fish/c01'；没读的返回 null（不报警，img() 会去读） */
export function peek(path: string): SpriteFrame | null {
  return frames.get(path) ?? null;
}

/** 已读好的图；没读的报警（启动时就该读好的部件用这个） */
export function frame(path: string): SpriteFrame | null {
  const f = frames.get(path);
  if (!f) console.warn(`没有这张图：${path}`);
  return f ?? null;
}

export function has(path: string): boolean {
  return frames.has(path);
}

/** 用到时再读的图（背景、收藏册封面、鱼），读到前返回 null；读不到（没网）也返回 null，下次再试 */
export function frameAsync(path: string): Promise<SpriteFrame | null> {
  const hit = frames.get(path);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(path);
  if (!p) {
    p = new Promise((resolve) => {
      resources.load(assetPath(path), SpriteFrame, (err: Error | null, sf: SpriteFrame) => {
        pending.delete(path);
        if (err) {
          console.warn(`读图失败 ${path}`, err);
          resolve(null);
        } else {
          frames.set(path, sf);
          resolve(sf);
        }
      });
    });
    pending.set(path, p);
  }
  return p;
}

export function loadJson<T>(path: string): Promise<T> {
  return new Promise((resolve, reject) => {
    resources.load(path, JsonAsset, (err: Error | null, a: JsonAsset) => {
      if (err) reject(err);
      else resolve(a.json as T);
    });
  });
}
