#!/usr/bin/env python3
"""把 Codex 出的白底图集抠成透明底并切成单张。

用法: slice.py <图集.png> <输出目录> <边长> <名字1,名字2,...>
按从上到下、从左到右的顺序给每个切片命名。
"""
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageFilter

WHITE = 228  # 三个通道都高于它算「接近白」
MIN_SIZE = 40  # 小于这个像素宽高的连通块当作噪点丢弃


def remove_background(img: Image.Image) -> Image.Image:
    """从四边向内泛洪，把与边缘连通的近白区域变透明；图案内部的白色高光不受影响。"""
    rgb = np.asarray(img.convert("RGB")).astype(np.int16)
    near_white = (rgb.min(axis=2) >= WHITE)
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
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8), "L")
    # 收一圈再轻微羽化，去掉描边外的白色毛边
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    out = img.convert("RGBA")
    out.putalpha(alpha)
    return out


def components(alpha: np.ndarray):
    """返回各连通块的包围盒 (top, left, bottom, right)。"""
    h, w = alpha.shape
    solid = alpha > 40
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


def main():
    src, out_dir, size, names = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4].split(",")
    img = remove_background(Image.open(src))
    boxes = reading_order(components(np.asarray(img)[:, :, 3]))
    if len(boxes) != len(names):
        sys.exit(f"✗ {src}: 切出 {len(boxes)} 块，但给了 {len(names)} 个名字")
    for (top, left, bottom, right), name in zip(boxes, names):
        piece = img.crop((left, top, right, bottom))
        side = max(piece.size) + 8
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(piece, ((side - piece.width) // 2, (side - piece.height) // 2))
        canvas.resize((size, size), Image.LANCZOS).save(f"{out_dir}/{name}.png", optimize=True)
    print(f"✓ {src}: {len(boxes)} 张 → {out_dir}")


if __name__ == "__main__":
    main()
