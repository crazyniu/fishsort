#!/usr/bin/env python3
"""局内障碍的两个部件（docs/ux/game.md、docs/03 第 3 节「气泡」）：
  - j_fog：迷雾泡上蒙的那团雾。程序生成：一圈软边的圆团并成一朵云，左上受光、右下带一点淡紫的暗面，边缘淡出。
  - j_mystery：雾里每个鱼位放的问号球。用 Codex 出的那颗果冻圆球（art/raw/ui_skin/misc.png 右下角的红点）换成淡紫蓝；
    问号由界面用艺术字体叠上去，不画进图里。
冰晶连线不出新图：把已有的冰块图（ui/icon/ice）缩小排成一串。
用法：python3 tools/art/obstacles.py [art/raw/ui_skin]   之后跑 ./run.sh meta 和 ./run.sh art-compress
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from skin import OUT, REPO, cut_grid, recolor, scaled  # noqa: E402


def fog(size: int = 480) -> Image.Image:
    n = size * 2  # 两倍画，缩回去边缘更软
    ys, xs = np.mgrid[0:n, 0:n].astype(np.float32)
    x = (xs / n - 0.5) * 2.0
    y = (ys / n - 0.5) * 2.0
    rng = np.random.default_rng(7)
    # 中间一大团，外面两圈小团：并起来是一朵圆滚滚的云
    blobs = [(0.0, 0.0, 0.66)]
    for k in range(8):
        a = k / 8 * np.pi * 2 + rng.uniform(-0.25, 0.25)
        d = 0.58 + rng.uniform(-0.07, 0.05)
        blobs.append((np.cos(a) * d, np.sin(a) * d, rng.uniform(0.24, 0.36)))
    for k in range(5):
        a = k / 5 * np.pi * 2 + rng.uniform(0.0, 1.0)
        blobs.append((np.cos(a) * 0.3, np.sin(a) * 0.3, rng.uniform(0.28, 0.38)))
    alpha = np.zeros((n, n), np.float32)
    light = np.zeros((n, n), np.float32)
    weight = np.zeros((n, n), np.float32)
    for bx, by, br in blobs:
        d = np.hypot(x - bx, y - by) / br
        cover = np.clip((1.0 - d) / 0.34, 0.0, 1.0)  # 软边
        cover = cover * cover * (3 - 2 * cover)
        alpha = np.maximum(alpha, cover)
        # 每个团自己的明暗：光从左上来
        shade = np.clip(0.62 - 0.5 * ((x - bx) * 0.6 + (y - by) * 0.8) / br, 0.0, 1.0)
        light += shade * cover
        weight += cover
    light = light / np.maximum(weight, 1e-3)
    # 整体再从上到下暗一点点；最外沿淡出，不留硬边
    light = np.clip(light * (1.0 - 0.1 * (y + 1) / 2), 0, 1)
    r = np.hypot(x, y)
    alpha *= np.clip((0.97 - r) / 0.14, 0.0, 1.0)
    lo = np.array([196, 204, 236], np.float32)  # 暗面：淡紫蓝
    hi = np.array([255, 255, 255], np.float32)
    rgb = lo + (hi - lo) * light[..., None]
    out = np.dstack([rgb, alpha * 255.0 * 0.96])
    im = Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), 'RGBA')
    return im.convert('RGBa').resize((size, size), Image.LANCZOS).convert('RGBA')


def main() -> None:
    raw = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / 'art/raw/ui_skin'
    fog().save(OUT / 'j_fog.png')
    print('  j_fog')
    if (raw / 'misc.png').exists():
        dot = cut_grid(raw / 'misc.png', 2, 2)[3]
        # 红 → 淡紫蓝，饱和度降一些：像一颗不知道装着什么的果冻球
        ball = recolor(scaled(dot, 160 / dot.width), 0, 232, k=0.0, sat=0.62, val=1.08)
        ball.save(OUT / 'j_mystery.png')
        print('  j_mystery', ball.size)
    else:
        print('  没有 art/raw/ui_skin/misc.png，j_mystery 没重新生成')


if __name__ == '__main__':
    main()
