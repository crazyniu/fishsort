#!/usr/bin/env python3
"""有音高的音效：用真实乐器采样（FluidR3_GM 音色库，MIT 许可）按谱子渲染出来，不用现成的音效素材。
界面点击、开关、连击命中 / 升档 / 断连、满缸、星星、金币、开箱、过关、失败都在这里；
水花、破泡、翻卡这类「拟音」仍然由 kenney.py 从 Kenney 的 CC0 包里挑。
全部在 C 大调 / C 五声音阶上，和背景音乐同调，叠在一起不打架。

用法：python3 client/tools/audio/instruments.py <FluidR3_GM.sf2 的路径>
  音色库：Debian 的 fluid-soundfont 源码包（fluid-soundfont_3.1.orig.tar.gz）里的 FluidR3_GM.sf2，不进仓库
依赖：pip install --no-deps tinysoundfont；pip install numpy
"""
import sys
import wave
from pathlib import Path

import numpy as np
import tinysoundfont

SR = 44100  # 渲染用
OUT_SR = 32000  # 进包用：单声道 16 位
OUT = Path(__file__).resolve().parents[2] / "assets" / "resources" / "audio"

# GM 音色号
CELESTA, GLOCK, VIBES, MARIMBA, PIZZ, HARP, TIMPANI, STRINGS, TRUMPET, BRASS, KALIMBA, STEEL = 8, 9, 11, 12, 45, 46, 47, 48, 56, 61, 108, 114
DRUMS = "drums"  # 打击乐组：36 大鼓、38 军鼓、49 吊镲、55 小镲
C4, C5, C6, C7 = 60, 72, 84, 96
PENTA = [0, 2, 4, 7, 9]
# 各音色的混音比例。音色库里各乐器响度差很多（同样力度下钟琴、钢鼓、小号比马林巴、颤音琴响两三倍，打击乐很轻），
# 每种乐器单独渲染成一轨、乘上这个比例再叠，主次才对
GAIN = {GLOCK: 0.45, STEEL: 0.5, TRUMPET: 0.6, PIZZ: 0.6, BRASS: 0.9, MARIMBA: 1.6, VIBES: 2.0, CELESTA: 1.3, HARP: 1.7, STRINGS: 1.0, KALIMBA: 0.9, TIMPANI: 2.6, DRUMS: 2.6}


def penta(start: int, n: int) -> list[int]:
    """从 start（必须是 C）起往上的 n 个五声音阶音"""
    return [start + 12 * (i // 5) + PENTA[i % 5] for i in range(n)]


class Renderer:
    def __init__(self, sf2: str) -> None:
        self.synth = tinysoundfont.Synth(samplerate=SR)
        self.sf = self.synth.sfload(sf2)
        self.chan: dict = {}

    def channel(self, prog) -> int:
        if prog not in self.chan:
            ch = 9 if prog == DRUMS else [c for c in range(16) if c != 9][len([p for p in self.chan if p != DRUMS])]
            if prog == DRUMS:
                self.synth.program_select(ch, self.sf, 128, 0, True)
            else:
                self.synth.program_select(ch, self.sf, 0, prog)
            self.chan[prog] = ch
        return self.chan[prog]

    def render(self, notes: list, length: float) -> np.ndarray:
        """notes: (起始秒, 音色, 音高, 力度 1–127, 时值秒) → 单声道波形。每种音色单独一轨，按 GAIN 叠"""
        out = np.zeros(int(length * SR))
        for prog in dict.fromkeys(n[1] for n in notes):
            out += self.stem([n for n in notes if n[1] == prog], length) * GAIN[prog]
        return out

    def stem(self, notes: list, length: float) -> np.ndarray:
        ev = []
        for t, prog, key, vel, dur in notes:
            ch = self.channel(prog)
            ev.append((t, 1, ch, key, int(vel)))
            ev.append((t + dur, 0, ch, key, 0))
        ev.sort(key=lambda e: (e[0], e[1]))
        out = []
        pos = 0
        for t, on, ch, key, vel in ev:
            n = int(t * SR) - pos
            if n > 0:
                out.append(np.frombuffer(bytes(self.synth.generate(n)), dtype=np.float32).copy())
                pos += n
            if on:
                self.synth.noteon(ch, key, vel)
            else:
                self.synth.noteoff(ch, key)
        n = int(length * SR) - pos
        if n > 0:
            out.append(np.frombuffer(bytes(self.synth.generate(n)), dtype=np.float32).copy())
        for ch in self.chan.values():
            self.synth.sounds_off(ch)
        self.synth.generate(2048)
        a = np.concatenate(out).reshape(-1, 2).mean(axis=1).astype(np.float64)
        a = a[: int(length * SR)]
        return np.concatenate([a, np.zeros(int(length * SR) - len(a))])


def reverb(x: np.ndarray, wet: float = 0.14, sec: float = 0.5, seed: int = 3) -> np.ndarray:
    """小房间混响：和一段指数衰减的噪声卷积。让采样听起来不干、不薄"""
    if wet <= 0:
        return x
    n = int(SR * sec)
    t = np.arange(n) / SR
    ir = np.random.default_rng(seed).standard_normal(n) * np.exp(-t * (6.9 / sec))
    ir[: int(SR * 0.008)] = 0
    ir = ir - np.convolve(ir, np.ones(40) / 40, mode="same")  # 去掉低频轰鸣
    ir /= np.sqrt((ir**2).sum())
    size = len(x) + n
    y = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)
    out = np.zeros(size)
    out[: len(x)] = x
    return out + wet * y


def bloop(f0: float, f1: float, sec: float, decay: float = 5.0) -> np.ndarray:
    """水泡声：频率往上（或往下）滑的正弦，很快衰减。界面点击垫的一层，贴「泡泡」的题"""
    t = np.arange(int(SR * sec)) / SR
    f = f0 * (f1 / f0) ** (t / sec)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return (np.sin(ph) + 0.18 * np.sin(2 * ph)) * np.exp(-t * decay / sec) * np.minimum(1, t * 400)


def add(base: np.ndarray, sig: np.ndarray, at: float, gain: float) -> np.ndarray:
    i = int(at * SR)
    if i + len(sig) > len(base):
        base = np.concatenate([base, np.zeros(i + len(sig) - len(base))])
    base[i : i + len(sig)] += sig * gain
    return base


def save(name: str, x: np.ndarray, peak: float, cut: float = 0.0, fade: float = 0.03) -> None:
    """归一到 peak；cut > 0 就在 cut 秒处收尾；尾巴低于 -50 dB 的部分去掉；降到 OUT_SR 存 16 位单声道"""
    if cut > 0:
        x = x[: int(cut * SR)]
    x = x / max(np.abs(x).max(), 1e-9)
    nz = np.flatnonzero(np.abs(x) > 0.003)
    x = x[: nz[-1] + 1] if len(nz) else x
    f = min(len(x), int(SR * fade))
    x[-f:] *= np.linspace(1, 0, f) ** 2
    n = int(len(x) * OUT_SR / SR)
    # 降采样前先低通，免得高频折回来变成杂音
    k = np.sinc(np.arange(-32, 33) * (OUT_SR / SR)) * np.hanning(65)
    x = np.convolve(x, k / k.sum(), mode="same")
    x = np.interp(np.arange(n) * (SR / OUT_SR), np.arange(len(x)), x)
    x = np.clip(x / max(np.abs(x).max(), 1e-9) * peak, -1, 1)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(OUT_SR)
        w.writeframes((x * 32767).astype(np.int16).tobytes())
    print(f"  {name}: {len(x) / OUT_SR:.2f}s")


def main() -> None:
    r = Renderer(sys.argv[1])

    # ---- 界面：短、软、圆。卡林巴 / 马林巴的一个音 + 一层水泡声
    x = r.render([(0, KALIMBA, C6 + 7, 78, 0.1)], 0.3)
    save("tap", add(x, bloop(620, 980, 0.05), 0, 0.012), 0.42, 0.16)
    # 开关：开 = 两个音往上，关 = 两个音往下
    x = r.render([(0, KALIMBA, C6 + 4, 76, 0.1), (0.07, KALIMBA, C6 + 9, 88, 0.14)], 0.5)
    save("toggle_on", add(x, bloop(500, 900, 0.06), 0.07, 0.01), 0.45, 0.3)
    x = r.render([(0, KALIMBA, C6 + 9, 76, 0.1), (0.07, KALIMBA, C6 + 4, 70, 0.14)], 0.5)
    save("toggle_off", add(x, bloop(800, 440, 0.06), 0.07, 0.01), 0.4, 0.3)

    # ---- 连击命中 hit_0 … hit_12：马林巴在它最好听的音区（C4–C6）沿五声音阶一击升一个音，下面垫低八度（厚）；
    # 连击起算（第 6 击）后叠同音的颤音琴（余音变长）和高两个八度很轻的钟琴（亮）。
    # hit_11 / hit_12 是升到顶之后交替用的两个和音
    scale = penta(C4, 11)
    for i, key in enumerate(scale):
        notes = [(0, MARIMBA, key, 98 + i * 2, 0.3), (0, MARIMBA, key - 12, 64, 0.3)]
        if i >= 5:
            notes += [(0, VIBES, key, 84, 0.35), (0, GLOCK, key + 24, 46 + i * 2, 0.3)]
        save(f"hit_{i}", reverb(r.render(notes, 0.9), 0.1, 0.35), 0.72, 0.55, 0.12)
    for j, top in enumerate([4, 7]):
        notes = [(0, MARIMBA, C6, 118, 0.3), (0, MARIMBA, C6 + top, 106, 0.3), (0, MARIMBA, C5, 72, 0.3)]
        notes += [(0, VIBES, C6, 90, 0.4), (0, VIBES, C6 + top, 84, 0.4), (0, GLOCK, C7 + 12, 70, 0.3), (0, GLOCK, C7 + top, 60, 0.3)]
        save(f"hit_{11 + j}", reverb(r.render(notes, 0.9), 0.12, 0.35), 0.75, 0.6, 0.12)

    # ---- 升档 tier_1 … tier_4：竖琴一串往上滑 → 颤音琴 + 钢片琴的和弦落点 → 钟琴往上点几个亮音。
    # 档位越高：滑得越长、和弦越高，加小镲 / 吊镲、铜管、定音鼓
    chords = [[C5, C5 + 4, C5 + 7], [C5 + 4, C5 + 7, C6], [C5 + 7, C6, C6 + 4], [C6, C6 + 4, C6 + 7, C7]]
    for t, chord in enumerate(chords):
        # 竖琴高过 C6 就没声了，滑音只用 C6 以下的
        run = penta(C4 - 12, 20)
        gl = [k for k in run if k < min(chord[0], C6)][-(6 + t * 2) :]
        gap = 0.034
        notes = [(i * gap, HARP, k, 70 + i * 4, 0.5) for i, k in enumerate(gl)]
        land = len(gl) * gap + 0.02
        notes += [(land, VIBES, k, 108, 1.2) for k in chord]
        notes += [(land, CELESTA, k + 12, 92, 1.0) for k in chord]
        notes += [(land, MARIMBA, chord[0] - 12, 100, 0.4)]
        spark = [chord[-1] + 12 + s for s in ([0, 4, 7, 12] if t < 2 else [0, 4, 7, 12, 16, 19])]
        notes += [(land + 0.12 + i * 0.055, GLOCK, min(k, 108), 84, 0.4) for i, k in enumerate(spark)]
        if t >= 1:
            notes += [(land, DRUMS, 55, 70 + t * 10, 0.8)]
        if t >= 2:
            notes += [(land, BRASS, k - 12, 96, 0.5) for k in chord[:3]]
            notes += [(land, DRUMS, 49, 84 + t * 8, 1.2)]
        if t >= 3:
            notes += [(land, TIMPANI, 48, 112, 0.8), (land, DRUMS, 36, 110, 0.3), (land, TRUMPET, chord[-1], 100, 0.55)]
        save(f"tier_{t + 1}", reverb(r.render(notes, land + 1.6), 0.16, 0.6), 0.86, land + 1.5, 0.25)
    # 断连：两个往下的低音，轻
    x = r.render([(0, MARIMBA, C4 + 7, 80, 0.2), (0.11, MARIMBA, C4 + 1, 74, 0.3), (0.11, PIZZ, C4 - 11, 70, 0.3)], 0.8)
    save("combo_break", reverb(x, 0.1, 0.3), 0.5, 0.6)

    # ---- 局内
    # 满缸：马林巴上行琶音 + 钟琴收尾
    notes = [(i * 0.05, MARIMBA, k, 92 + i * 6, 0.3) for i, k in enumerate([C5, C5 + 4, C5 + 7, C6])]
    notes += [(0.15, GLOCK, C7, 82, 0.4), (0.15, VIBES, C6, 70, 0.5), (0.2, GLOCK, C7 + 7, 60, 0.4)]
    save("bowl_done", reverb(r.render(notes, 1.0), 0.14, 0.45), 0.72, 0.8, 0.2)
    # 星星：钟琴 + 钢片琴的一个亮音
    notes = [(0, GLOCK, C7, 100, 0.3), (0, CELESTA, C6, 80, 0.3), (0.03, GLOCK, C7 + 7, 60, 0.3)]
    save("star", reverb(r.render(notes, 0.8), 0.14, 0.4), 0.55, 0.5, 0.15)
    # 金币：两个很快的高音「叮铃」；金币雨是一串
    coin = [(0, GLOCK, C6 + 11, 92, 0.2), (0.05, GLOCK, C7 + 4, 104, 0.3), (0.05, CELESTA, C6 + 4, 70, 0.3)]
    save("coin", reverb(r.render(coin, 0.6), 0.1, 0.3), 0.5, 0.36, 0.12)
    rain = []
    for i in range(7):
        rain += [(i * 0.085, GLOCK, C6 + 11 + (i % 3), 84 + i * 3, 0.2), (i * 0.085 + 0.04, GLOCK, C7 + 4 + [0, 3, 0, 5, 3, 8, 12][i], 96, 0.25)]
    save("coins", reverb(r.render(rain, 1.2), 0.12, 0.35), 0.55, 1.0, 0.2)
    # 开箱：竖琴滑上去 → 和弦 + 一串亮音 + 小镲
    gl = penta(C4, 10)
    notes = [(i * 0.03, HARP, k, 74 + i * 4, 0.6) for i, k in enumerate(gl)]
    land = len(gl) * 0.03
    notes += [(land, VIBES, k, 108, 1.0) for k in (C6, C6 + 4, C6 + 7, C7 + 2)]
    notes += [(land, CELESTA, k, 90, 0.8) for k in (C7, C7 + 4, C7 + 7)]
    notes += [(land + 0.1 + i * 0.05, GLOCK, k, 84, 0.3) for i, k in enumerate([C7, C7 + 4, C7 + 7, C7 + 12])]
    notes += [(land, DRUMS, 55, 84, 0.8), (land, TIMPANI, 48, 96, 0.5)]
    save("chest", reverb(r.render(notes, 1.8), 0.16, 0.6), 0.82, 1.5, 0.25)
    # 开箱蓄力：9 拍，越来越密、越来越高（拍点和 pages/wheel.ts 的 BEATS 对齐），每拍垫一下定音鼓
    beats = [0, 0.19, 0.35, 0.49, 0.61, 0.71, 0.8, 0.88, 0.95]
    notes = []
    for k, (t, key) in enumerate(zip(beats, penta(C5, 9))):
        notes += [(t, MARIMBA, key, 84 + k * 4, 0.15), (t, PIZZ, key - 12, 80 + k * 4, 0.15), (t, TIMPANI, 43 if k % 2 else 48, 60 + k * 6, 0.2)]
    save("wheel_charge", reverb(r.render(notes, 1.4), 0.1, 0.3), 0.78, 1.2, 0.1)
    # 解锁 / 功能开放：颤音琴三个音往上 + 钟琴
    notes = [(i * 0.075, VIBES, k, 98, 0.6) for i, k in enumerate([C5 + 7, C6, C6 + 4])]
    notes += [(0.15, GLOCK, C7 + 7, 78, 0.4), (0.23, GLOCK, C7 + 12, 84, 0.4)]
    save("unlock", reverb(r.render(notes, 1.2), 0.14, 0.45), 0.6, 0.9, 0.2)

    # ---- 过关：小号 + 钢鼓的上行号角「sol do mi sol — mi sol DO」，落在大三和弦上：铜管、弦乐、定音鼓、吊镲，竖琴滑进去，钟琴在上面闪
    u = 0.115
    tune = [(0, 67, u), (u, 72, u), (2 * u, 76, u), (3 * u, 79, 2.7 * u), (6 * u, 76, 0.9 * u), (7 * u, 79, 1.1 * u)]
    end = 8.3 * u
    notes = []
    for t, k, d in tune + [(end, 84, 1.3)]:
        notes += [(t, TRUMPET, k, 108, d), (t, STEEL, k, 104, d), (t, BRASS, k - 12, 88, d), (t, GLOCK, k + 12, 62, d)]
    notes += [(end, BRASS, k, 96, 1.3) for k in (C4, C4 + 4, C4 + 7)]
    notes += [(end, STRINGS, k, 84, 1.4) for k in (C4 - 12, C4 - 5, C4, C4 + 4, C5)]
    notes += [(3 * u, TIMPANI, 43, 100, 0.4), (end - 0.09, TIMPANI, 48, 96, 0.2), (end, TIMPANI, 48, 120, 1.0)]
    notes += [(0, DRUMS, 38, 70, 0.1), (u, DRUMS, 38, 78, 0.1), (2 * u, DRUMS, 38, 86, 0.1), (3 * u, DRUMS, 36, 100, 0.2)]
    notes += [(end, DRUMS, 49, 112, 1.5), (end, DRUMS, 36, 112, 0.3)]
    gl = penta(C4, 10)
    notes += [(6.2 * u + i * 0.022, HARP, k, 66 + i * 4, 0.6) for i, k in enumerate(gl)]
    notes += [(end + 0.16 + i * 0.07, GLOCK, k, 80, 0.4) for i, k in enumerate([C7, C7 + 4, C7 + 7, C7 + 12, C7 + 7, C7 + 12])]
    save("win", reverb(r.render(notes, end + 2.0), 0.18, 0.8), 0.9, end + 1.7, 0.4)

    # ---- 失败：轻、不刺耳。颤音琴 + 拨弦往下走三个音（小调），最后一个音拖长
    notes = []
    for i, k in enumerate([C5 - 3, C5 - 7, C5 - 10]):
        d = 0.9 if i == 2 else 0.25
        notes += [(i * 0.24, VIBES, k, 92 - i * 6, d), (i * 0.24, PIZZ, k - 12, 84, d), (i * 0.24, MARIMBA, k, 60, d)]
    notes += [(0.48, STRINGS, C4 - 10, 52, 0.9), (0.48, STRINGS, C4 - 3, 46, 0.9)]
    save("lose", reverb(r.render(notes, 2.0), 0.18, 0.7), 0.7, 1.7, 0.4)


if __name__ == "__main__":
    main()
