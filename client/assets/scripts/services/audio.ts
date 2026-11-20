// 音效、背景音乐与震动。音效短，启动时一起读；背景音乐用到时再读。开关在存档 settings 里（docs/01 5.10）。
import { AudioClip, AudioSource, Input, Node, input, resources } from 'cc';
import { App } from './app';

const clips = new Map<string, AudioClip>();
let fx: AudioSource | null = null;
let music: AudioSource | null = null;

/** 名字 → 文件（assets/resources/audio） */
const MAP: Record<string, string> = {
  tap: 'tap',
  tab: 'tab',
  toggleOn: 'toggle_on',
  toggleOff: 'toggle_off',
  blocked: 'error',
  error: 'error',
  buffer: 'buffer',
  bowlDone: 'bowl_done',
  blow: 'blow',
  shuffle: 'shuffle',
  net: 'net',
  tier: 'tier_1',
  charge: 'wheel_charge',
  win: 'win',
  lose: 'lose',
  star: 'star',
  coin: 'coin',
  coins: 'coins',
  chest: 'chest',
  card: 'card',
  unlock: 'unlock',
  warn: 'warn',
  firework: 'firework',
  land: 'land',
  tick: 'tick',
  swell: 'swell',
  undo: 'undo',
  hint: 'hint',
};

/**
 * 有几个音高略不同的版本、播放时随机挑一个的音效（文件名 名字_0 … 名字_N-1；client/tools/audio/prepare.py）：
 * 点鱼的「啵」、鱼进缸的两层（bowl 清脆的一声 + splash 水花）、破泡。连着响的时候不单调
 */
const VARIANTS: Record<string, number> = { bo: 3, bowl: 3, splash: 3, pop: 3 };
/** 连击命中音的个数：hit_0 … hit_10，沿五声音阶逐级升调，到顶后停在最高的一个 */
const HITS = 11;

export async function initAudio(root: Node): Promise<void> {
  fx = root.addComponent(AudioSource);
  const musicNode = new Node('music');
  root.addChild(musicNode);
  music = musicNode.addComponent(AudioSource);
  music.loop = true;
  music.volume = 0.45;
  const names = Array.from(new Set(Object.values(MAP))).concat(
    Array.from({ length: HITS }, (_, i) => `hit_${i}`),
    Array.from({ length: 4 }, (_, i) => `tier_${i + 1}`),
    Object.entries(VARIANTS).flatMap(([k, n]) => Array.from({ length: n }, (_, i) => `${k}_${i}`)),
  );
  await Promise.all(
    names.map(
      (n) =>
        new Promise<void>((resolve) =>
          resources.load(`audio/${n}`, AudioClip, (err: Error | null, c: AudioClip) => {
            if (!err) clips.set(n, c);
            resolve();
          }),
        ),
    ),
  );
}

/**
 * 播一个音效。
 * - hit 带「连击起算后的第几击」（0 起）：沿五声音阶逐级上行
 * - tier 带档位（1–4）：档位越高越长、越亮
 * - bo / bowl / splash / pop：随机挑一个音高版本
 */
export function sfx(name: string, n = 0, volume = 1): void {
  if (!fx || !App.save?.data.settings.sound) return;
  let file = MAP[name] ?? name;
  if (name === 'hit') file = `hit_${Math.min(HITS - 1, Math.max(0, n))}`;
  else if (name === 'tier' && n > 0) file = `tier_${Math.min(4, n)}`;
  else if (VARIANTS[name]) file = `${name}_${Math.floor(Math.random() * VARIANTS[name])}`;
  const c = clips.get(file);
  if (!c || !admit(file, c)) return;
  fx.playOneShot(c, volume);
}

// ---------------------------------------------------------------- 限流（docs/04：微信上一秒几十声、每击一震会把原生层堵住，画面卡住、一直叮、一直震）

/** 正在响的音效估计在什么时候结束（毫秒） */
const voices: number[] = [];
/** 每个音效上次响的时间（毫秒） */
const lastPlay = new Map<string, number>();
let lastBuzz = -1e9;
let quietUntil = 0;

function limits(): { maxVoices: number; sameGap: number; buzzGap: number; longBuzz: number } | undefined {
  return App.config?.ui.audio;
}

/** 这一声能不能响：同一个音效隔得太近、或同时在响的太多，就不响 */
function admit(file: string, c: AudioClip): boolean {
  const lim = limits();
  if (!lim) return true;
  const now = Date.now();
  if (now - (lastPlay.get(file) ?? -1e9) < lim.sameGap * 1000) return false;
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i] <= now) voices.splice(i, 1);
  if (voices.length >= lim.maxVoices) return false;
  lastPlay.set(file, now);
  // 时长读不到（个别平台）按半秒算；另加 0.1 秒是微信上新建音频对象、读文件的时间
  const dur = c.getDuration() > 0 ? c.getDuration() : 0.5;
  voices.push(now + (dur + 0.1) * 1000);
  return true;
}

/** 震动（设置里能关）。轻：点一下、连击命中；中：升档、满缸；重：高档升档、过关、开箱 */
export function buzz(kind: 'light' | 'medium' | 'heavy'): void {
  if (!App.save?.data.settings.vibrate) return;
  const lim = limits();
  if (lim) {
    const now = Date.now();
    if (now < quietUntil || now - lastBuzz < lim.buzzGap * 1000) return;
    lastBuzz = now;
    if (kind === 'heavy') quietUntil = now + lim.longBuzz * 1000;
  }
  App.platform.vibrate(kind);
}

export function playMusic(): void {
  if (!music || !App.save.data.settings.music) return;
  if (music.clip) {
    if (!music.playing) music.play();
    return;
  }
  resources.load('audio/bgm', AudioClip, (err: Error | null, c: AudioClip) => {
    if (err || !music) return;
    music.clip = c;
    if (App.save.data.settings.music) music.play();
  });
}

/**
 * 启动就放背景音乐（设置里开着的话）。浏览器和小游戏都要等玩家第一次碰屏幕才让出声，
 * 所以启动时先放一次，第一次触摸时没在响就再放一次
 */
export function startMusic(): void {
  playMusic();
  const kick = (): void => {
    if (!music || !App.save.data.settings.music) return;
    if (!music.clip) playMusic();
    else if (!music.playing) music.play();
  };
  input.once(Input.EventType.TOUCH_START, kick);
  input.once(Input.EventType.TOUCH_END, kick);
}

export function stopMusic(): void {
  music?.stop();
}

export function applySettings(): void {
  if (App.save.data.settings.music) playMusic();
  else stopMusic();
}
