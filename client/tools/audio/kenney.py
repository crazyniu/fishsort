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
# 连击：同一个清脆的玻璃音按五声音阶往上升（第 1 击到第 8 击及以上）
HIT_SRC = "glass_001.ogg"
HIT_STEPS = [0, 2, 4, 7, 9, 12, 14, 16]


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
    sf.write(str(OUT / f"{name}.wav"), (x * 32767).astype(np.int16), SR, subtype="PCM_16")


def main() -> None:
    root = Path(sys.argv[1])
    for name, (src, gain) in PICK.items():
        save(name, load(root, src), gain)
    base = load(root, HIT_SRC)
    for i, st in enumerate(HIT_STEPS):
        save(f"hit_{i}", pitch(base, st), 0.8)
    print(f"✓ {len(PICK) + len(HIT_STEPS)} 个音效 → {OUT}")


if __name__ == "__main__":
    main()
