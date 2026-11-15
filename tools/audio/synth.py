#!/usr/bin/env python3
"""用代码合成全部音效和背景音乐（原创、无版权问题）。

用法: python3 tools/audio/synth.py   → 输出到 assets/audio/*.wav
"""
import wave
from pathlib import Path

import numpy as np

SR = 22050
OUT = Path(__file__).resolve().parents[2] / "assets" / "audio"
NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}


def hz(name: str) -> float:
    """音名转频率，如 C5、F#4。"""
    return 440.0 * 2 ** ((NOTE[name[:-1]] + (int(name[-1]) - 4) * 12 - 9) / 12)


def t(sec: float) -> np.ndarray:
    return np.arange(int(SR * sec)) / SR


def mallet(freq: float, sec: float, bright: float = 0.35) -> np.ndarray:
    """木琴/铃音色：基频加两个泛音，指数衰减。"""
    x = t(sec)
    wave_ = np.sin(2 * np.pi * freq * x) + bright * np.sin(2 * np.pi * freq * 4 * x) * np.exp(-x * 18)
    wave_ += 0.2 * np.sin(2 * np.pi * freq * 2 * x) * np.exp(-x * 8)
    return wave_ * np.exp(-x * (5.0 / sec)) * np.minimum(1, x * 400)


def sweep(f0: float, f1: float, sec: float, decay: float = 6.0) -> np.ndarray:
    x = t(sec)
    freq = f0 * (f1 / f0) ** (x / sec)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-x * decay / sec) * np.minimum(1, x * 600)


def mix(length: float, *parts) -> np.ndarray:
    """parts: (起始秒, 波形, 音量)"""
    out = np.zeros(int(SR * length))
    for start, sig, gain in parts:
        i = int(SR * start)
        n = min(len(sig), len(out) - i)
        out[i:i + n] += sig[:n] * gain
    return out


def save(name: str, sig: np.ndarray, peak: float = 0.8) -> None:
    sig = sig / max(1e-9, np.abs(sig).max()) * peak
    with wave.open(str(OUT / f"{name}.wav"), "wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes((sig * 32767).astype(np.int16).tobytes())


def sfx() -> None:
    rng = np.random.default_rng(7)
    save("tap", sweep(520, 880, 0.07), 0.5)
    save("click", sweep(700, 900, 0.04), 0.4)
    save("bowl", mix(0.22, (0, sweep(380, 1250, 0.09, 4), 1), (0.05, mallet(hz("E6"), 0.16), 0.5)), 0.6)
    save("buffer", mix(0.14, (0, sweep(300, 180, 0.12, 5), 1)), 0.5)
    # 破泡：短促上扬的「啵」，像水滴声，尾巴带一点清脆的泛音；不用噪声，听起来不刺耳
    pop = mix(0.2, (0, sweep(480, 1500, 0.075, 4.5), 1.0), (0.0, sweep(960, 3000, 0.05, 7), 0.22), (0.055, mallet(hz("G6"), 0.12, 0.15), 0.3))
    save("pop", pop, 0.55)
    # 入缸的水花：很轻的一声「噗通」
    splash_noise = np.convolve(rng.standard_normal(int(SR * 0.16)), np.ones(14) / 14, mode="same") * np.exp(-t(0.16) * 22)
    save("splash", mix(0.2, (0, splash_noise, 0.8), (0, sweep(300, 900, 0.09, 4), 0.9)), 0.4)
    # 过关开场的「唰」
    wn = np.convolve(rng.standard_normal(int(SR * 0.4)), np.ones(9) / 9, mode="same")
    save("whoosh", wn * np.sin(np.pi * t(0.4) / 0.4) ** 2, 0.35)
    # 星星依次亮起的铃音
    save("star", mix(0.5, (0, mallet(hz("C7"), 0.45, 0.5), 1), (0.02, mallet(hz("G7"), 0.4, 0.4), 0.5)), 0.5)
    save("bowl_done", mix(0.6, (0, mallet(hz("C6"), 0.3), 1), (0.09, mallet(hz("E6"), 0.3), 1), (0.18, mallet(hz("G6"), 0.4), 1)), 0.6)
    save("coin", mix(0.4, (0, mallet(hz("B5"), 0.15, 0.6), 1), (0.07, mallet(hz("E6"), 0.3, 0.6), 1)), 0.5)
    save("unlock", mix(0.4, (0, sweep(400, 1400, 0.25, 3), 0.7), (0.2, mallet(hz("A5"), 0.2), 1)), 0.5)
    save("error", mix(0.16, (0, sweep(190, 140, 0.15, 3) * np.sign(np.sin(2 * np.pi * 45 * t(0.15))), 1)), 0.35)
    save("shuffle", mix(0.5, *[(i * 0.05, mallet(hz(n), 0.18), 0.8) for i, n in enumerate(["C5", "E5", "G5", "C6", "G5", "E6"])]), 0.5)
    # 过关：一记鼓点 + 快速上行琶音 + 明亮的大三和弦收尾 + 高音闪烁
    win = [(0, sweep(190, 55, 0.22, 3), 1.2)]
    win += [(0.04 + i * 0.065, mallet(hz(n), 0.4, 0.5), 0.9) for i, n in enumerate(["C5", "E5", "G5", "C6", "E6", "G6"])]
    win += [(0.46, mallet(hz(n), 1.5, 0.45), 0.75) for n in ["C5", "G5", "C6", "E6", "G6", "C7"]]
    win += [(0.46, sweep(160, 50, 0.3, 3), 1.0)]
    win += [(0.7 + i * 0.09, mallet(hz(n), 0.3, 0.6), 0.35) for i, n in enumerate(["E7", "G7", "C7", "G7", "E7", "C8"])]
    save("win", mix(2.4, *win), 0.75)
    lose = [(i * 0.2, mallet(hz(n), 0.6, 0.1), 1) for i, n in enumerate(["G4", "D#4", "C4"])]
    save("lose", mix(1.2, *lose), 0.6)


def bgm() -> None:
    """32 秒可循环的轻快木琴小曲：C–Am–F–G，五声音阶旋律。"""
    beat = 60 / 100
    bars = [("C", ["C4", "E4", "G4"], "C3"), ("A", ["A3", "C4", "E4"], "A2"),
            ("F", ["F3", "A3", "C4"], "F2"), ("G", ["G3", "B3", "D4"], "G2")]
    melody_a = ["E5", None, "G5", "A5", "G5", None, "E5", "D5", "C5", None, "E5", "G5", "A5", "G5", "E5", None,
                "A5", None, "C6", "A5", "G5", None, "E5", "G5", "D5", None, "E5", "G5", "D5", None, None, None]
    melody_b = ["G5", "A5", "C6", None, "A5", "G5", "E5", None, "C6", "A5", "G5", "E5", "G5", None, "A5", None,
                "C6", None, "A5", "G5", "A5", "C6", "D6", None, "E6", "D6", "C6", "A5", "G5", None, None, None]
    total = beat * 4 * 16
    out = np.zeros(int(SR * total))

    def add(start: float, sig: np.ndarray, gain: float) -> None:
        # 尾音超出结尾的部分绕回开头，循环时无缝
        i = int(SR * start) % len(out)
        idx = (i + np.arange(len(sig))) % len(out)
        np.add.at(out, idx, sig * gain)

    for rep in range(4):
        melody = melody_a if rep % 2 == 0 else melody_b
        for bar in range(4):
            _, chord, bass = bars[bar]
            base = (rep * 4 + bar) * 4 * beat
            add(base, mallet(hz(bass), beat * 3, 0.05), 0.55)
            add(base + beat * 2, mallet(hz(bass), beat * 1.5, 0.05), 0.35)
            for step in range(8):
                add(base + step * beat / 2, mallet(hz(chord[[0, 1, 2, 1][step % 4]]), beat * 1.2, 0.2), 0.22)
            for step in range(8):
                note = melody[bar * 8 + step]
                if note:
                    add(base + step * beat / 2, mallet(hz(note), beat * 1.6, 0.4), 0.42)
    save("bgm", out, 0.5)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    sfx()
    bgm()
    print("✓ 音频已生成到", OUT)
