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


def bell(freq: float, sec: float) -> np.ndarray:
    """清亮的铃/钢片琴：带不谐和泛音，起音快，比 mallet 更「脆」。"""
    x = t(sec)
    out = np.sin(2 * np.pi * freq * x)
    out += 0.45 * np.sin(2 * np.pi * freq * 2.76 * x) * np.exp(-x * 14)
    out += 0.25 * np.sin(2 * np.pi * freq * 5.4 * x) * np.exp(-x * 26)
    out += 0.3 * np.sin(2 * np.pi * freq * 2 * x) * np.exp(-x * 6)
    return out * np.exp(-x * (5.5 / sec)) * np.minimum(1, x * 900)


def brass(freq: float, sec: float) -> np.ndarray:
    """号角：锯齿感的谐波叠加，起音稍慢，尾部收住。"""
    x = t(sec)
    out = sum(np.sin(2 * np.pi * freq * k * x) / k for k in range(1, 9))
    env = np.minimum(1, x * 45) * np.minimum(1, (sec - x) * 14) * (0.75 + 0.25 * np.exp(-x * 5))
    return out * env


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
    # 连击命中：有分量的「叮」= 低频鼓点 + 明亮铃音 + 高八度泛音 + 一点擦音。游戏里按五声音阶逐级升调
    click = np.convolve(rng.standard_normal(int(SR * 0.03)), np.ones(3) / 3, mode="same") * np.exp(-t(0.03) * 160)
    save("combo", mix(0.4, (0, sweep(220, 70, 0.1, 4), 0.9), (0, bell(hz("C6"), 0.36), 1.0), (0.0, bell(hz("C7"), 0.2), 0.35), (0, click, 0.35)), 0.7)
    # 升档：三连上行 + 和弦 + 镲
    crash = np.convolve(rng.standard_normal(int(SR * 0.7)), np.ones(2) / 2, mode="same") * np.exp(-t(0.7) * 7)
    tier = [(i * 0.07, bell(hz(n), 0.3), 0.9) for i, n in enumerate(["G5", "C6", "E6"])]
    tier += [(0.21, bell(hz(n), 0.7), 0.7) for n in ["C6", "E6", "G6", "C7"]]
    tier += [(0.21, crash, 0.22), (0.21, sweep(200, 60, 0.2, 3), 1.0)]
    save("tier", mix(1.0, *tier), 0.75)
    # 得图鉴：一串上行的闪亮音 + 高音颤动
    card = [(i * 0.055, bell(hz(n), 0.5), 0.8) for i, n in enumerate(["C6", "E6", "G6", "B6", "C7", "E7", "G7"])]
    card += [(0.4 + i * 0.05, bell(hz(n), 0.25), 0.3) for i, n in enumerate(["G7", "E7", "G7", "C8", "G7", "C8"])]
    save("card", mix(1.2, *card), 0.6)
    # 烟花：升空哨音 + 炸开的噪声 + 低频「嘭」
    boom = np.convolve(rng.standard_normal(int(SR * 0.6)), np.ones(5) / 5, mode="same") * np.exp(-t(0.6) * 6)
    save("firework", mix(0.9, (0, sweep(500, 1900, 0.22, 1.0), 0.35), (0.22, boom, 1.0), (0.22, sweep(160, 45, 0.3, 3), 1.2)), 0.6)
    # 金币雨：一串密集的金币声
    rain = [(i * 0.045, bell(hz(n), 0.18), 0.8) for i, n in enumerate(["B5", "E6", "B5", "E6", "G#6", "E6", "B6", "E6", "G#6", "B6", "E7", "B6"])]
    save("coins", mix(0.9, *rain), 0.55)
    # 道具：渔网甩出的「唰—噗」、吹泡的上行泡泡串、洗牌的旋转声
    save("net", mix(0.5, (0, wn[: int(SR * 0.25)] * np.sin(np.pi * t(0.25) / 0.25) ** 2, 0.6), (0.2, sweep(700, 250, 0.2, 4), 0.9), (0.24, bell(hz("E6"), 0.2), 0.4)), 0.55)
    save("blow", mix(0.7, *[(i * 0.07, sweep(400 + i * 110, 1100 + i * 220, 0.08, 4.5), 0.9) for i in range(7)]), 0.5)
    # 过关：军鼓滚奏 → 铜管号角「哒哒哒—当」→ 大三和弦长音 + 镲 + 高音闪烁
    roll = np.concatenate([np.convolve(rng.standard_normal(int(SR * 0.04)), np.ones(4) / 4, mode="same") * np.exp(-t(0.04) * 60) * (0.4 + 0.6 * i / 7) for i in range(8)])
    win = [(0, roll, 0.5), (0.3, sweep(200, 50, 0.25, 3), 1.3)]
    win += [(0.32 + i * 0.13, brass(hz(n), 0.14), 0.8) for i, n in enumerate(["G4", "G4", "G4"])]
    win += [(0.32 + i * 0.13, brass(hz(n), 0.14), 0.6) for i, n in enumerate(["C5", "C5", "C5"])]
    win += [(0.72, brass(hz(n), 1.3), 0.75) for n in ["C4", "G4", "C5", "E5", "G5"]]
    win += [(0.72, bell(hz(n), 1.4), 0.5) for n in ["C6", "E6", "G6"]]
    win += [(0.72, crash, 0.3), (0.72, sweep(180, 45, 0.35, 3), 1.3)]
    win += [(1.0 + i * 0.08, bell(hz(n), 0.3), 0.3) for i, n in enumerate(["E7", "G7", "C8", "G7", "E7", "G7", "C8", "E7"])]
    save("win", mix(2.6, *win), 0.8)
    lose = [(i * 0.2, mallet(hz(n), 0.6, 0.1), 1) for i, n in enumerate(["G4", "D#4", "C4"])]
    save("lose", mix(1.2, *lose), 0.6)
    # 局内细节：点鱼的「啵」、订单打勾、满缸前的蓄力、暂存槽告警（低频两声）、气泡落地
    save("bo", mix(0.1, (0, sweep(300, 780, 0.06, 5), 1.0), (0, sweep(600, 1560, 0.04, 8), 0.2)), 0.5)
    save("tick", mix(0.3, (0, bell(hz("E6"), 0.12), 0.8), (0.07, bell(hz("B6"), 0.22), 1.0)), 0.5)
    rise = sweep(240, 1400, 0.34, 1.2) * np.minimum(1, t(0.34) * 6)
    save("swell", mix(0.36, (0, rise, 1.0), (0, sweep(480, 2800, 0.34, 1.2) * np.minimum(1, t(0.34) * 6), 0.25)), 0.4)
    pulse = np.sin(2 * np.pi * 150 * t(0.13)) * np.sin(np.pi * t(0.13) / 0.13) ** 2
    pulse += 0.4 * np.sin(2 * np.pi * 300 * t(0.13)) * np.sin(np.pi * t(0.13) / 0.13) ** 2
    save("warn", mix(0.36, (0, pulse, 1.0), (0.18, pulse, 0.9)), 0.55)
    save("land", mix(0.2, (0, sweep(190, 80, 0.14, 5), 1.0), (0.02, sweep(520, 900, 0.06, 6), 0.25)), 0.5)
    # 洋流：一阵由低到高再落下的水流声，带几粒气泡音
    flow = np.convolve(rng.standard_normal(int(SR * 0.9)), np.ones(22) / 22, mode="same") * np.sin(np.pi * t(0.9) / 0.9) ** 1.5
    drops = [(0.15 + i * 0.09, sweep(500 + i * 90, 1300 + i * 160, 0.07, 5), 0.35) for i in range(7)]
    save("current", mix(0.95, (0, flow, 1.0), (0, sweep(140, 420, 0.9, 1.0) * np.sin(np.pi * t(0.9) / 0.9), 0.5), *drops), 0.5)
    # 宝箱弹开：低频「咚」加一串上行的亮音
    chest = [(0, sweep(220, 70, 0.18, 3), 1.0)] + [(0.03 + i * 0.045, bell(hz(n), 0.4), 0.6) for i, n in enumerate(["C6", "E6", "G6", "C7", "E7"])]
    save("chest", mix(0.8, *chest), 0.65)


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
