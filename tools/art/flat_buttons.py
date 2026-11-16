#!/usr/bin/env python3
"""平面按钮（docs/03 第 2 节，用户 2026-11-16 定）：纯色平面、圆角方块，只在下面压一道同色系的粗边，没有渐变、高光、描边。

程序直接画，不经 Codex：形状规整、边缘干净，五种颜色完全一致。输出横向三宫格到 client/assets/resources/ui/skin/j_btn_*.png，
边距写进 client/tools/art/slices_skin.json。用法：python3 tools/art/flat_buttons.py [输出目录]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'client/assets/resources/ui/skin'
SLICES = REPO / 'client/tools/art/slices_skin.json'

H = 300          # 部件高（和原来的按钮一样，运行时按高度缩放）
CAP = 186        # 左右两头各留多宽（中间 4 像素横向拉伸）
MID = 4
RADIUS = 0.24    # 圆角 = 按钮高的几分之几
LIP = 0.11       # 下面那道粗边 = 按钮高的几分之几
SS = 4           # 超采样倍数

# 面的颜色、下边的颜色
COLORS = {
    'green': ('#3CC62B', '#268F1B'),
    'blue': ('#3F8DFF', '#1E55C4'),
    'amber': ('#FFAA1C', '#D07C00'),
    'red': ('#F2553E', '#BC3320'),
    'gray': ('#B4C0CF', '#8894A8'),
}


def draw(face: str, edge: str) -> Image.Image:
    w = CAP * 2 + MID
    W, HH = w * SS, H * SS
    im = Image.new('RGBA', (W, HH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    lip = round(HH * LIP)
    r = round(HH * RADIUS)
    # 底下的粗边：整块深色圆角方块；面：同样的圆角方块，往上让出粗边的高度
    d.rounded_rectangle((0, lip, W - 1, HH - 1), r, fill=edge)
    d.rounded_rectangle((0, 0, W - 1, HH - 1 - lip), r, fill=face)
    return im.resize((w, H), Image.LANCZOS)


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT
    out.mkdir(parents=True, exist_ok=True)
    slices = json.loads(SLICES.read_text()) if SLICES.exists() else {}
    for name, (face, edge) in COLORS.items():
        draw(face, edge).save(out / f'j_btn_{name}.png')
        slices[f'j_btn_{name}'] = [0, 0, CAP, CAP]
        print(f'  j_btn_{name}')
    if out == OUT:
        SLICES.write_text(json.dumps(slices, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
