// 音效与背景音乐。音效短，启动时一起读；背景音乐用到时再读。开关在存档 settings 里（docs/01 5.10）。
import { AudioClip, AudioSource, Node, resources } from 'cc';
import { App } from './app';

const clips = new Map<string, AudioClip>();
let fx: AudioSource | null = null;
let music: AudioSource | null = null;

/** 名字 → 文件（assets/resources/audio） */
const MAP: Record<string, string> = {
  tap: 'tap',
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
  tier: 'tier',
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

export async function initAudio(root: Node): Promise<void> {
  fx = root.addComponent(AudioSource);
  const musicNode = new Node('music');
  root.addChild(musicNode);
  music = musicNode.addComponent(AudioSource);
  music.loop = true;
  music.volume = 0.45;
  const names = Array.from(new Set(Object.values(MAP))).concat(Array.from({ length: 8 }, (_, i) => `hit_${i}`));
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

/** 播一个音效。hit 带连击数：音高沿五声音阶上行 */
export function sfx(name: string, combo = 0): void {
  if (!fx || !App.save?.data.settings.sound) return;
  const file = name === 'hit' ? `hit_${Math.min(7, Math.max(0, combo - 1))}` : MAP[name] ?? name;
  const c = clips.get(file);
  if (c) fx.playOneShot(c, 1);
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
