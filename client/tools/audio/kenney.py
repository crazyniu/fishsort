#!/usr/bin/env python3
"""拟音类音效（水花、破泡、翻卡、洗牌、道具）：从 Kenney 的 CC0 音效包（kenney.nl：interface-sounds、casino-audio、impact-sounds）
里挑出来转成进包的 wav（22050 Hz 单声道 16 位，峰值归一）。
有音高的音效（界面点击、连击、过关、失败、金币、开箱…）不在这里，见同目录 instruments.py（真实乐器采样按谱子渲染）。

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

# 游戏里的音效名 → (包内文件名, 音量[, 最长几秒])。给了最长秒数的截到这么长，最后 0.15 秒淡出（和动画一样长，动画停了声音也停）
PICK = {
    "error": ("error_004.ogg", 0.7),  # 点了没用 / 金币不够
    "card": ("card-slide-1.ogg", 0.85),
    "shuffle": ("card-shuffle.ogg", 0.8, 1.0),  # 洗牌动画约 1 秒（2026-11-17：原来 3 秒，动画停了还在响）
    "warn": ("question_001.ogg", 0.7),
    "tick": ("tick_002.ogg", 0.6),
    "swell": ("maximize_009.ogg", 0.7),
    "blow": ("maximize_005.ogg", 0.8),
    "net": ("maximize_004.ogg", 0.7),
}
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


def trim(x: np.ndarray, sec: float) -> np.ndarray:
    """截到 sec 秒，最后 0.15 秒淡出"""
    nz = np.flatnonzero(np.abs(x) > 1e-3)
    if len(nz):
        x = x[nz[0]:]
    x = x[: int(SR * sec)].copy()
    f = min(len(x), int(SR * 0.15))
    x[-f:] *= np.linspace(1, 0, f)
    return x


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


def main() -> None:
    root = Path(sys.argv[1])
    for name, (src, gain, *rest) in PICK.items():
        x = load(root, src)
        if rest:
            x = trim(x, rest[0])
        save(name, x, gain)
    print(f"✓ {len(PICK)} 个音效 → {OUT}")


if __name__ == "__main__":
    main()
