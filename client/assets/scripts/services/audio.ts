// 音效、背景音乐与震动。音效短，启动时一起读；背景音乐用到时再读。开关在存档 settings 里（docs/01 5.10）。
import { AudioClip, AudioSource, Node, resources } from 'cc';
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
  fly: 'whoosh',
  buffer: 'buffer',
  splash: 'splash',
  pop: 'pop',
  bowl: 'bowl_done',
  blow: 'blow',
  shuffle: 'shuffle',
  net: 'net',
  current: 'current',
  tier: 'tier_1',
  comboBreak: 'combo_break',
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
};

/** 连击命中音的个数：hit_0 … hit_10 逐级升调，hit_11 / hit_12 是升到顶之后交替用的和音（client/tools/audio/instruments.py） */
const HITS = 13;

export async function initAudio(root: Node): Promise<void> {
  fx = root.addComponent(AudioSource);
  const musicNode = new Node('music');
  root.addChild(musicNode);
  music = musicNode.addComponent(AudioSource);
  music.loop = true;
  music.volume = 0.45;
  const names = Array.from(new Set(Object.values(MAP))).concat(Array.from({ length: HITS }, (_, i) => `hit_${i}`), Array.from({ length: 4 }, (_, i) => `tier_${i + 1}`));
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
 * - hit 带连击数：音高沿五声音阶逐级上行，升到顶后两个和音交替
 * - tier 带档位（1–4）：档位越高越长、越亮
 */
export function sfx(name: string, n = 0, volume = 1): void {
  if (!fx || !App.save?.data.settings.sound) return;
  let file = MAP[name] ?? name;
  if (name === 'hit') file = `hit_${n <= HITS - 2 ? Math.max(0, n - 1) : HITS - 2 + (n % 2)}`;
  else if (name === 'tier' && n > 0) file = `tier_${Math.min(4, n)}`;
  const c = clips.get(file);
  if (c) fx.playOneShot(c, volume);
}

/** 震动（设置里能关）。轻：点一下、连击命中；中：升档、满缸；重：高档升档、过关、开箱 */
export function buzz(kind: 'light' | 'medium' | 'heavy'): void {
  if (!App.save?.data.settings.vibrate) return;
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

export function stopMusic(): void {
  music?.stop();
}

export function applySettings(): void {
  if (App.save.data.settings.music) playMusic();
  else stopMusic();
}
