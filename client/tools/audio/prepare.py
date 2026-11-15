#!/usr/bin/env python3
"""音效：仓库根 assets/audio/*.wav（tools/audio/synth.py 合成的）→ client/assets/resources/audio。
统一降到 22050 Hz 单声道（包体小）；连击音按五声音阶生成 hit_0 … hit_7（docs/01 3.2：音高沿五声音阶上行）。
用法：python3 tools/audio/prepare.py
"""
import wave
from pathlib import Path

import numpy as np

CLIENT = Path(__file__).resolve().parent.parent.parent
SRC = CLIENT.parent / 'assets/audio'
OUT = CLIENT / 'assets/resources/audio'
RATE = 22050


def read(p: Path) -> np.ndarray:
    with wave.open(str(p)) as w:
        n, ch, sw, rate = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    dt = {1: np.uint8, 2: np.int16, 4: np.int32}[sw]
    a = np.frombuffer(raw, dt).astype(np.float64)
    if sw == 1:
        a = (a - 128) / 128
    else:
        a /= float(2 ** (8 * sw - 1))
    a = a.reshape(-1, ch).mean(axis=1)
    return resample(a, rate / RATE)


def resample(a: np.ndarray, step: float) -> np.ndarray:
    """按步长线性插值重采样：step > 1 变短、音调变高"""
    idx = np.arange(0, len(a) - 1, step)
    i = idx.astype(int)
    f = idx - i
    return a[i] * (1 - f) + a[i + 1] * f


def write(p: Path, a: np.ndarray) -> None:
    a = np.clip(a, -1, 1)
    with wave.open(str(p), 'wb') as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((a * 32767).astype(np.int16).tobytes())


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    n = 0
    for p in sorted(SRC.glob('*.wav')):
        write(OUT / p.name, read(p))
        n += 1
    base = read(SRC / 'bo.wav')
    # 五声音阶：do re mi sol la，往上一个八度接着走
    semis = [0, 2, 4, 7, 9, 12, 14, 16]
    for i, s in enumerate(semis):
        write(OUT / f'hit_{i}.wav', resample(base, 2 ** (s / 12)))
    print(f'✓ {n} 个音效 + 8 个连击音 → assets/resources/audio')


if __name__ == '__main__':
    main()
