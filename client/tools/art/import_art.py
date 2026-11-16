#!/usr/bin/env python3
"""把插画（Codex 出图 art/raw、Godot 版现有的 assets/）缩放后放进 client/assets/resources。

docs/09 第 7 节：缩小用 Lanczos、在线性空间里做；透明图先预乘再缩放（不出黑边）；
界面插画按最大显示尺寸的 3 倍；背景存 JPG。清单在 art_manifest.json：
  "输出路径（相对 resources，不带扩展名）": [来源（相对仓库根或 art/raw 的绝对路径）, 显示宽（设计单位）, "png" | "jpg"]
用法：python3 tools/art/import_art.py [--raw <art/raw 目录>]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
CLIENT = HERE.parent.parent
REPO = CLIENT.parent
RES = 3


def to_linear(c):
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(c):
    c = np.clip(c, 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * c ** (1 / 2.4) - 0.055)


def resize(im: Image.Image, w: int, h: int) -> Image.Image:
    a = np.asarray(im.convert('RGBA'), dtype=np.float64) / 255.0
    rgb = to_linear(a[..., :3]) * a[..., 3:4]  # 线性空间 + 预乘
    chans = [rgb[..., i] for i in range(3)] + [a[..., 3]]
    out = [np.asarray(Image.fromarray(c.astype(np.float32), 'F').resize((w, h), Image.LANCZOS)) for c in chans]
    alpha = np.clip(out[3], 0, 1)
    rgb = np.stack(out[:3], -1)
    safe = np.where(alpha > 1e-4, alpha, 1)[..., None]
    rgb = to_srgb(rgb / safe)
    # 透明像素的颜色用邻近颜色填上（再加一道保险，线性过滤时不出暗边）
    res = np.concatenate([rgb, alpha[..., None]], -1)
    return Image.fromarray((res * 255 + 0.5).astype(np.uint8), 'RGBA')


def main() -> None:
    raw = Path(sys.argv[sys.argv.index('--raw') + 1]) if '--raw' in sys.argv else REPO / 'art/raw'
    manifest = json.loads((HERE / 'art_manifest.json').read_text())
    done = 0
    for out, (src, width, fmt) in manifest.items():
        path = (raw / src[4:]) if src.startswith('raw:') else REPO / src
        if not path.exists():
            print(f'  缺 {src}，跳过 {out}')
            continue
        im = Image.open(path)
        w = round(width * RES) if fmt == 'png' else min(im.width, round(width * 2))
        h = round(im.height * w / im.width)
        dst = CLIENT / 'assets/resources' / f'{out}.{fmt}'
        dst.parent.mkdir(parents=True, exist_ok=True)
        if fmt == 'jpg':
            img = im.convert('RGB') if (w, h) == im.size else resize(im, w, h).convert('RGB')
            img.save(dst, quality=88, optimize=True, progressive=True)
        else:
            (im.convert('RGBA') if (w, h) == im.size else resize(im, w, h)).save(dst, optimize=True)
        done += 1
    print(f'✓ 导入 {done} / {len(manifest)} 张')


if __name__ == '__main__':
    main()
