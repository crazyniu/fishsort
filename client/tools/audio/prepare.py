#!/usr/bin/env python3
"""局内的基础音效：直接用 Godot 版一直在用的那一套（仓库根 assets/audio/*.wav，tools/audio/synth.py 合成）。
用户 2026-11-16：点鱼、鱼进缸这些声音重构前没问题，换成素材包和乐器音之后反而不行，所以恢复原版。

- 点鱼「啵」bo、进缸 bowl + splash、破泡 pop：各出 3 个音高略有差别的版本（_0 / _1 / _2），游戏里随机挑一个，连着响不单调
  （Godot 版是播放时随机变调，Cocos 的 playOneShot 不能变调，所以预先做好）
- 连击命中 hit_0 … hit_10：原版的 combo（低频鼓点 + 铃音）沿五声音阶逐级升调，和 Godot 版 combo_hud 的音阶、基准音高一致
- 界面点击 tap、底栏切页 tab、开关 toggle_on / toggle_off：都出自原版的 click（一声很短的上扬音），只是音高不同
- 进暂存槽 buffer、落地 land：原样

用法：python3 client/tools/audio/prepare.py（先跑过仓库根的 tools/audio/synth.py）
依赖：numpy
"""
import wave
from pathlib import Path

import numpy as np

CLIENT = Path(__file__).resolve().parent.parent.parent
SRC = CLIENT.parent / 'assets/audio'
OUT = CLIENT / 'assets/resources/audio'
RATE = 22050


def read(name: str) -> np.ndarray:
    with wave.open(str(SRC / f'{name}.wav')) as w:
        n, ch, sw, rate = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    a = np.frombuffer(raw, {1: np.uint8, 2: np.int16, 4: np.int32}[sw]).astype(np.float64)
    a = (a - 128) / 128 if sw == 1 else a / float(2 ** (8 * sw - 1))
    a = a.reshape(-1, ch).mean(axis=1)
    return pitch(a, rate / RATE)


def pitch(a: np.ndarray, k: float) -> np.ndarray:
    """变调 k 倍（连带变速）：线性插值重采样"""
    idx = np.arange(0, len(a) - 1, k)
    i = idx.astype(int)
    f = idx - i
    return a[i] * (1 - f) + a[i + 1] * f


def write(name: str, a: np.ndarray, gain: float = 1.0) -> None:
    a = np.clip(a * gain, -1, 1)
    with wave.open(str(OUT / f'{name}.wav'), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((a * 32767).astype(np.int16).tobytes())


def join(parts: list, gap: float) -> np.ndarray:
    """几段音依次排开，起点相隔 gap 秒"""
    n = int(RATE * gap)
    out = np.zeros(n * (len(parts) - 1) + max(len(p) for p in parts))
    for i, p in enumerate(parts):
        out[i * n : i * n + len(p)] += p
    return out


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    # 随机变调的三个版本（Godot 版的变调范围：bo 0.95–1.1，bowl 0.95–1.1，splash 0.9–1.15，pop 0.88–1.18）
    for name, ks in (('bo', (0.95, 1.02, 1.1)), ('bowl', (0.95, 1.02, 1.1)), ('splash', (0.9, 1.02, 1.15)), ('pop', (0.88, 1.02, 1.18))):
        src = read(name)
        for i, k in enumerate(ks):
            write(f'{name}_{i}', pitch(src, k))
            n += 1
    # 连击命中：0.8 × 2^(半音 / 12)，音阶同 Godot 版 combo_hud.SCALE
    combo = read('combo')
    for i, s in enumerate([0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]):
        write(f'hit_{i}', pitch(combo, 0.8 * 2 ** (s / 12)))
        n += 1
    click = read('click')
    write('tap', click)
    write('tab', pitch(click, 0.84))
    write('toggle_on', join([pitch(click, 0.9), pitch(click, 1.2)], 0.07))
    write('toggle_off', join([pitch(click, 1.2), pitch(click, 0.9)], 0.07))
    for name in ('buffer', 'land'):
        write(name, read(name))
    print(f'✓ {n + 6} 个音效 → {OUT}')


if __name__ == '__main__':
    main()
