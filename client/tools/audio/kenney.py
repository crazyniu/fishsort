#!/usr/bin/env python3
"""把 Kenney 的 CC0 音效包（kenney.nl：interface-sounds、casino-audio、music-jingles、impact-sounds、digital-audio）
挑出来转成进包的 wav（22050 Hz 单声道 16 位，峰值归一）。原来的正弦合成音效（tools/audio/synth.py）太单薄，2026-11-16 换掉。

用法: python3 client/tools/audio/kenney.py <解压后的音效包目录>
依赖: pip install soundfile numpy
许可: Kenney 的素材是 CC0（可商用、不用署名），见同目录 LICENSE-kenney.txt
"""
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

SR = 22050
OUT = Path(__file__).resolve().parents[2] / "assets" / "resources" / "audio"

# 游戏里的音效名 → (包内文件名, 音量)
PICK = {
    "tap": ("click_001.ogg", 0.7),  # 界面按钮
    "error": ("error_004.ogg", 0.7),  # 点了没用 / 金币不够
    "whoosh": ("pluck_002.ogg", 0.85),  # 点鱼：鱼从气泡里弹出来
    "splash": ("drop_002.ogg", 0.9),  # 鱼落进鱼缸
    "pop": ("drop_001.ogg", 0.8),  # 气泡破
    "buffer": ("drop_003.ogg", 0.75),  # 鱼进暂存槽（坏事，低沉）
    "bowl_done": ("confirmation_002.ogg", 0.85),  # 满缸
    "tier": ("powerUp2.ogg", 0.7),  # 连击升档
    "win": ("jingles_STEEL07.ogg", 0.9),  # 过关（钢鼓，海岛味）
    "lose": ("jingles_PIZZI05.ogg", 0.8),
    "star": ("glass_006.ogg", 0.8),
    "coin": ("chip-lay-1.ogg", 0.8),
    "coins": ("chips-handle-1.ogg", 0.85),
    "chest": ("cards-pack-open-1.ogg", 0.9),
    "card": ("card-slide-1.ogg", 0.85),
    "shuffle": ("card-shuffle.ogg", 0.8),
    "unlock": ("confirmation_003.ogg", 0.85),
    "warn": ("question_001.ogg", 0.7),
    "tick": ("tick_002.ogg", 0.6),
    "land": ("impactSoft_medium_001.ogg", 0.7),
    "swell": ("maximize_009.ogg", 0.7),
    "blow": ("maximize_005.ogg", 0.8),
    "net": ("maximize_004.ogg", 0.7),
    "current": ("maximize_002.ogg", 0.7),
}
# 连击命中音：清脆的玻璃音按五声音阶往上升。前 5 击低一个八度（蓄势），第 6 击（连击起算）回到原调再往上走；
# 每个音垫一层很轻的低频「咚」，越往上越重。hit_11 / hit_12 是升到顶之后交替用的两个和音
HIT_SRC = "glass_001.ogg"
HIT_STEPS = [-12, -10, -8, -5, -3, 0, 2, 4, 7, 9, 12]


def load(root: Path, name: str) -> np.ndarray:
    hits = list(root.rglob(name))
    if not hits:
        raise SystemExit(f"找不到 {name}")
    x, sr = sf.read(str(hits[0]), always_2d=True)
    x = x.mean(axis=1)
    if sr != SR:
        n = int(len(x) * SR / sr)
        x = np.interp(np.linspace(0, len(x) - 1, n), np.arange(len(x)), x)
    return x


def pitch(x: np.ndarray, semis: float) -> np.ndarray:
    """变调（连带变速，短音效听不出来）"""
    k = 2 ** (semis / 12)
    n = int(len(x) / k)
    return np.interp(np.arange(n) * k, np.arange(len(x)), x)


def save(name: str, x: np.ndarray, gain: float) -> None:
    # 去掉首尾静音，头尾 3 毫秒淡入淡出，峰值归一到 gain
    nz = np.flatnonzero(np.abs(x) > 1e-3)
    if len(nz):
        x = x[max(0, nz[0] - 10) : nz[-1] + 1]
    f = int(SR * 0.003)
    if len(x) > 2 * f:
        x[:f] *= np.linspace(0, 1, f)
        x[-f:] *= np.linspace(1, 0, f)
    x = x / max(np.abs(x).max(), 1e-9) * gain * 0.95
    x = np.clip(x, -1, 1)
    sf.write(str(OUT / f"{name}.wav"), (x * 32767).astype(np.int16), SR, subtype="PCM_16")


def mix(length: float, *parts: tuple) -> np.ndarray:
    """parts: (起始秒, 波形, 音量)"""
    out = np.zeros(int(SR * length))
    for start, sig, gain in parts:
        i = int(SR * start)
        n = min(len(sig), len(out) - i)
        if n > 0:
            out[i : i + n] += sig[:n] * gain
    return out


def thump(sec: float = 0.16, f0: float = 150, f1: float = 55) -> np.ndarray:
    """低频「咚」：频率往下滑的正弦，很快衰减。给命中音、升档音垫分量"""
    x = np.arange(int(SR * sec)) / SR
    freq = f0 * (f1 / f0) ** (x / sec)
    return np.sin(2 * np.pi * np.cumsum(freq) / SR) * np.exp(-x * 22) * np.minimum(1, x * 500)


def shimmer(sec: float, seed: int) -> np.ndarray:
    """高频闪烁的尾音：滤掉低频的噪声慢慢衰减"""
    n = np.random.default_rng(seed).standard_normal(int(SR * sec))
    n = n - np.convolve(n, np.ones(6) / 6, mode="same")
    x = np.arange(len(n)) / SR
    return n * np.exp(-x * 6) * np.minimum(1, x * 200)


def combo_set(root: Path) -> int:
    """连击、开箱蓄力这几组叠出来的音效（docs/01 3.2：声音、震动、画面一起升级）"""
    glass = load(root, HIT_SRC)
    star = load(root, "glass_006.ogg")
    power = load(root, "powerUp2.ogg")
    chips = load(root, "chips-handle-1.ogg")
    n = 0
    for i, s in enumerate(HIT_STEPS):
        hit = mix(0.6, (0, pitch(glass, s), 1.0), (0, pitch(glass, s + 12), 0.22), (0, thump(), 0.18 + 0.03 * i))
        save(f"hit_{i}", hit, 0.8)
        n += 1
    for j, extra in enumerate([4, 7]):
        hit = mix(0.6, (0, pitch(glass, 12), 1.0), (0, pitch(glass, 12 + extra), 0.7), (0, thump(), 0.5), (0.01, shimmer(0.25, j), 0.12))
        save(f"hit_{len(HIT_STEPS) + j}", hit, 0.8)
        n += 1
    # 升档 tier_1 … tier_4：能量上扬的底 + 一串往上的琶音 + 和弦落点；档位越高调越高、琶音越长、低频和尾音越多
    arps = [[0, 4, 7], [0, 4, 7, 12], [0, 4, 7, 12, 16], [0, 4, 7, 12, 16, 19]]
    for t, arp in enumerate(arps):
        key = [0, 2, 4, 7][t]
        gap = 0.06
        parts = [(0, pitch(power, key), 0.8), (0, thump(0.22, 190, 45), 0.7 + 0.15 * t)]
        parts += [(k * gap, pitch(glass, key - 12 + a), 0.75) for k, a in enumerate(arp)]
        land = len(arp) * gap
        parts += [(land, pitch(glass, key + a), 0.6) for a in (0, 4, 7)]
        parts += [(land, pitch(star, key), 0.5), (land, thump(0.26, 170, 40), 0.6 + 0.2 * t)]
        parts += [(land, shimmer(0.45 + 0.15 * t, 10 + t), 0.1 + 0.04 * t)]
        if t >= 2:
            parts += [(land + 0.05, pitch(chips, key), 0.3)]
        save(f"tier_{t + 1}", mix(1.6, *parts), 0.85)
        n += 1
    # 断连：两个往下走的闷音
    save("combo_break", mix(0.6, (0, pitch(glass, -17), 1.0), (0.09, pitch(glass, -22), 0.9), (0, thump(0.2, 120, 50), 0.4)), 0.5)
    # 开箱蓄力：1 秒内 9 个音，越来越密、越来越高
    ts = np.cumsum([0, 0.19, 0.16, 0.14, 0.12, 0.1, 0.09, 0.08, 0.07])
    notes = [0, 2, 4, 7, 9, 12, 14, 16, 19]
    charge = [(float(ts[k]), pitch(glass, -12 + notes[k]), 0.5 + 0.06 * k) for k in range(9)]
    charge += [(float(ts[k]), thump(0.12, 140, 60), 0.3 + 0.05 * k) for k in range(9)]
    save("wheel_charge", mix(1.5, *charge), 0.75)
    return n + 2


def main() -> None:
    root = Path(sys.argv[1])
    for name, (src, gain) in PICK.items():
        save(name, load(root, src), gain)
    extra = combo_set(root)
    print(f"✓ {len(PICK) + extra} 个音效 → {OUT}")


if __name__ == "__main__":
    main()
