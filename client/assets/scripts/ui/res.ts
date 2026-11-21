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
 * 首页用不到的大图：局内特效和夸奖字、美术数字、鱼缸、锁链迷雾冰封、卡面、奖牌、宝箱（约 5 MB）。
 * 不挡首页：首页出来以后在后台读（Boot），进关前等它们读好（gameView.start）。按钮（j_btn_*）和首页装饰用的 j_bubble 留在启动里
 */
const LATER = /^(skin\/j_(?!btn_|bubble$)|icon\/(chest|card_back|ice))/;

function uiFrames(): string[] {
  // 收藏册的大封面（skin/j_book_*，十几张、4 MB 多）不预读，打开收藏页时再读
  return [...keysIn('ui/kit'), ...keysIn('ui/skin'), ...keysIn('ui/icon')].filter((k) => !k.startsWith('skin/j_book_'));
}

/**
 * LATER 里结算、开箱、收藏才用的：卡面、奖牌、宝箱（约 1.7 MB）。进关不等它们，一局打完早就在后台读好了。
 * 卡背（icon/card_back）局内的连击目标卡、幸运泡也用，归局内
 */
const REWARD = /^(skin\/j_(card_|medal_)|icon\/chest)/;

/**
 * 首页出来之前要读好的界面图：部件、按钮、图标和首页背景（约 1.5 MB）。原来界面图全部读完才进首页（约 6.5 MB），
 * 4G 下微信版冷启动二十几秒（2026-11-21 在 Mac 上按 CPU 4 倍慢、9 Mbps 量的）。鱼不在这里，由 Boot 另读。
 * 首页背景原来是用到时才读，现在要和后台那几 MB 抢网速，网慢时会空好几秒，所以放进来
 */
export function startupFrames(): string[] {
  return [...uiFrames().filter((k) => !LATER.test(k)), 'bg/home'];
}

/** 首页出来以后在后台读、进关前要读好的局内图（LATER 里除了 REWARD） */
export function gameFrames(): string[] {
  return uiFrames().filter((k) => LATER.test(k) && !REWARD.test(k));
}


/** 首页出来以后在后台读的结算、开箱、收藏用图（REWARD），排在局内图后面 */
export function rewardFrames(): string[] {
  return uiFrames().filter((k) => REWARD.test(k));
}

let fontLoading: Promise<Font> | null = null;
let baseFont: Font | null = null;
/** 另用一套字体的语言：游戏字体（荆南麦圆体）没有韩文，韩文用资源圆体的韩文版（client/tools/font_subset.py 裁出来）。
 * 放在 resources 而不是 boot 包：微信版不带韩文，不占微信的主包 */
const LANG_FONT: Record<string, string> = { ko: 'font/game_ko' };
const langFonts = new Map<string, Font>();

/** 读游戏字体（boot 包的 game.ttf）；加载页和启动步骤都会调，只读一次 */
function loadBaseFont(): Promise<Font> {
  if (baseFont) return Promise.resolve(baseFont);
  if (!fontLoading) {
    fontLoading = loadBootBundle().then(
      (b) =>
        new Promise<Font>((resolve, reject) => {
          b.load('game', TTFFont, (err: Error | null, f: TTFFont) => {
            if (err) return reject(err);
            // 小游戏上 wx.loadFont 失败时引擎不报错，family 静默变成 'Arial'，界面全成系统字——这里报出来
            const family: unknown = Reflect.get(f, '_fontFamily');
            if (typeof family !== 'string' || !family || family === 'Arial') console.warn(`游戏字体没装上（family=${String(family)}），界面会用系统字体`);
            else console.log(`游戏字体：${family}`);
            baseFont = f;
            resolve(f);
          });
        }),
    );
    fontLoading.catch(() => (fontLoading = null));
  }
  return fontLoading;
}

/** 这种语言专用的字体（只有韩文有），不改界面字体；没有专用字体返回 null */
export async function langFont(lang: string): Promise<Font | null> {
  const path = LANG_FONT[lang];
  if (!path) return null;
  let f = langFonts.get(lang);
  if (!f) {
    f = await new Promise<Font>((resolve, reject) => {
      resources.load(path, TTFFont, (err: Error | null, t: TTFFont) => (err ? reject(err) : resolve(t)));
    });
    langFonts.set(lang, f);
  }
  return f;
}

/** 读这种语言要用的字体，并把它设成界面字体（换语言前先调它，读好了再换，免得新界面闪一下系统字） */
export async function loadFont(lang = ''): Promise<Font> {
  const base = await loadBaseFont();
  font = (await langFont(lang)) ?? base;
  return font;
}

export function uiFont(): Font | null {
  return font;
}

/** 这种语言该用的字体：有专用字体（韩文）用专用的，否则用游戏字体 */
export async function fontFor(lang: string): Promise<Font> {
  return (await langFont(lang)) ?? (await loadBaseFont());
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
/** 资源包里有没有这张图（看资源清单，不下载） */
export function hasFrame(path: string): boolean {
  return resources.getInfoWithPath(assetPath(path), SpriteFrame) !== null;
}

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
