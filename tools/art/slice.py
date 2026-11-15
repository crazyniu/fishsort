#!/usr/bin/env python3
"""把 Codex 出的白底图集抠成透明底并切成单张。

用法: slice.py <图集.png> <输出目录> <边长> <名字1,名字2,...>
边长为负数时保持长宽比，只把宽度缩到该绝对值。
可选第 5 个参数「列x行」（如 3x3）：按网格归并碎块。
按从上到下、从左到右的顺序给每个切片命名。
"""
import sys
from collections import deque

import numpy as np
from PIL import Image

WHITE = 240  # 三个通道都高于它算背景白
EDGE_DARK = 90  # 过渡带里暗于它的像素视为完全不透明
MIN_SIZE = 40  # 小于这个像素宽高的连通块当作噪点丢弃


def _grow(mask: np.ndarray, steps: int) -> np.ndarray:
    """把布尔蒙版向外扩 steps 个像素（四邻域）。"""
    out = mask.copy()
    for _ in range(steps):
        g = out.copy()
        g[1:, :] |= out[:-1, :]
        g[:-1, :] |= out[1:, :]
        g[:, 1:] |= out[:, :-1]
        g[:, :-1] |= out[:, 1:]
        out = g
    return out


def remove_background(img: Image.Image) -> Image.Image:
    """从四边向内泛洪找出白色背景并去掉，边缘做真正的抗锯齿。

    出图时图案边缘的像素是「图案色与白底的混合」。这里按混入白色的比例还原出
    半透明度，并把颜色里的白色成分减掉，所以放到任何底色上都不会有白边或锯齿。
    图案内部的白色高光不与边缘连通，不受影响。
    """
    rgb = np.asarray(img.convert("RGB")).astype(np.float32)
    near_white = rgb.min(axis=2) >= WHITE
    h, w = near_white.shape
    bg = np.zeros((h, w), dtype=bool)
    queue = deque()
    for x in range(w):
        queue.append((0, x)); queue.append((h - 1, x))
    for y in range(h):
        queue.append((y, 0)); queue.append((y, w - 1))
    while queue:
        y, x = queue.popleft()
        if y < 0 or y >= h or x < 0 or x >= w or bg[y, x] or not near_white[y, x]:
            continue
        bg[y, x] = True
        queue.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    alpha = np.where(bg, 0.0, 1.0).astype(np.float32)
    # 紧贴背景的 2 像素是过渡带：越白越透明
    band = _grow(bg, 2) & ~bg
    whiteness = np.clip((rgb.min(axis=2) - EDGE_DARK) / (255.0 - EDGE_DARK), 0.0, 1.0)
    alpha[band] = 1.0 - whiteness[band]
    # 还原被白底冲淡的颜色：C = (混合色 - (1 - a) * 白) / a
    a3 = np.clip(alpha, 0.05, 1.0)[:, :, None]
    fixed = np.clip((rgb - (1.0 - a3) * 255.0) / a3, 0.0, 255.0)
    rgb = np.where(band[:, :, None], fixed, rgb)
    out = np.dstack([rgb, alpha * 255.0]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def components(alpha: np.ndarray):
    """返回各连通块的包围盒 (top, left, bottom, right)。"""
    h, w = alpha.shape
    solid = alpha > 100
    seen = np.zeros((h, w), dtype=bool)
    boxes = []
    for sy in range(0, h, 4):
        for sx in range(0, w, 4):
            if not solid[sy, sx] or seen[sy, sx]:
                continue
            top, left, bottom, right = sy, sx, sy, sx
            queue = deque([(sy, sx)])
            seen[sy, sx] = True
            while queue:
                y, x = queue.popleft()
                top, bottom, left, right = min(top, y), max(bottom, y), min(left, x), max(right, x)
                for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                    if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        queue.append((ny, nx))
            if bottom - top >= MIN_SIZE and right - left >= MIN_SIZE:
                boxes.append((top, left, bottom + 1, right + 1))
    return boxes


def reading_order(boxes):
    """先按行分组（中心 y 接近的算一行），行内按 x 排。"""
    boxes = sorted(boxes, key=lambda b: (b[0] + b[2]) / 2)
    rows, current = [], []
    for b in boxes:
        cy = (b[0] + b[2]) / 2
        if current and cy - (current[-1][0] + current[-1][2]) / 2 > (current[-1][2] - current[-1][0]) * 0.5:
            rows.append(current)
            current = []
        current.append(b)
    if current:
        rows.append(current)
    return [b for row in rows for b in sorted(row, key=lambda b: b[1])]


def resize(img: Image.Image, size) -> Image.Image:
    """用预乘 alpha 缩放，透明像素的颜色不会渗进边缘造成杂边。"""
    if img.size == tuple(size):
        return img
    return img.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")


def main():
    src, out_dir, size, names = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4].split(",")
    img = remove_background(Image.open(src))
    boxes = components(np.asarray(img)[:, :, 3])
    if len(sys.argv) > 5:
        # 给了「列x行」：把落在同一格的碎块并成一个（图标内部有脱开的小零件时用）
        cols, rows = (int(v) for v in sys.argv[5].split("x"))
        cells = {}
        for top, left, bottom, right in boxes:
            key = (int((top + bottom) / 2 * rows / img.height), int((left + right) / 2 * cols / img.width))
            t, l, b_, r = cells.get(key, (top, left, bottom, right))
            cells[key] = (min(t, top), min(l, left), max(b_, bottom), max(r, right))
        boxes = [cells[k] for k in sorted(cells)]
    else:
        boxes = reading_order(boxes)
    if len(boxes) != len(names):
        sys.exit(f"✗ {src}: 切出 {len(boxes)} 块，但给了 {len(names)} 个名字")
    for (top, left, bottom, right), name in zip(boxes, names):
        piece = img.crop((left, top, right, bottom))
        if size < 0:
            # 负数：保持原始长宽比，只把宽度缩到 |size|（按钮、面板等九宫格贴图用）
            scale = min(1.0, -size / piece.width)
            piece = resize(piece, (round(piece.width * scale), round(piece.height * scale)))
            piece.save(f"{out_dir}/{name}.png", optimize=True)
            continue
        side = max(piece.size) + 8
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(piece, ((side - piece.width) // 2, (side - piece.height) // 2))
        resize(canvas, (size, size)).save(f"{out_dir}/{name}.png", optimize=True)
    print(f"✓ {src}: {len(boxes)} 张 → {out_dir}")


if __name__ == "__main__":
    main()
