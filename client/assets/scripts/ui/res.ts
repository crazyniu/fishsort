// 界面资源缓存：启动时把部件、图标、生物图、字体、文案读进来，之后同步取用；背景图大，用到时再读。
import { Font, JsonAsset, SpriteFrame, TTFFont, resources } from 'cc';

const frames = new Map<string, SpriteFrame>();
const pending = new Map<string, Promise<SpriteFrame | null>>();
let font: Font | null = null;

function loadDir(dir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    resources.loadDir(dir, SpriteFrame, (err: Error | null, assets: SpriteFrame[]) => {
      if (err) return reject(err);
      const info = resources.getDirWithPath(dir, SpriteFrame);
      // getDirWithPath 和 assets 的顺序一致：按 uuid 对上路径
      const byUuid = new Map(assets.map((a) => [a._uuid, a]));
      for (const i of info) {
        const sf = byUuid.get(i.uuid);
        if (sf) frames.set(i.path.replace(/^ui\//, '').replace(/\/spriteFrame$/, ''), sf);
      }
      resolve();
    });
  });
}

export async function preload(): Promise<void> {
  await Promise.all([loadDir('ui/kit'), loadDir('ui/skin'), loadDir('ui/icon'), loadDir('fish'), loadFont()]);
}

function loadFont(): Promise<void> {
  return new Promise((resolve) => {
    resources.load('fonts/round', TTFFont, (err: Error | null, f: TTFFont) => {
      if (!err) font = f;
      else console.warn('字体读不出来，用系统字体', err);
      resolve();
    });
  });
}

export function uiFont(): Font | null {
  return font;
}

/** 已预读的图：'kit/dot_red'、'skin/j_btn_green'、'icon/coin'、'fish/c01' */
export function frame(path: string): SpriteFrame | null {
  const f = frames.get(path);
  if (!f) console.warn(`没有这张图：${path}`);
  return f ?? null;
}

export function has(path: string): boolean {
  return frames.has(path);
}

/** 用到时再读的大图（背景、家园），读到前返回 null */
export function frameAsync(path: string): Promise<SpriteFrame | null> {
  const hit = frames.get(path);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(path);
  if (!p) {
    p = new Promise((resolve) => {
      resources.load(`ui/${path}/spriteFrame`, SpriteFrame, (err: Error | null, sf: SpriteFrame) => {
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
