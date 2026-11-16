#!/usr/bin/env python3
"""平面界面部件（docs/03 第 2 节，用户 2026-11-16 定）：纯色平面、圆角方块，没有渐变、高光、描边；
凸起的部件（按钮、标签牌、图标键）只在下面压一道同色系的粗边。

程序直接画，不经 Codex：形状规整、边缘干净，同一类部件的各种颜色完全一致。
输出到 client/assets/resources/ui/skin/：
  j_btn_*      五色按钮（横向三宫格）
  f_plate_blue 标签牌 / 页标题牌（三宫格）
  f_dock       白色圆角托盘：底栏、顶栏的资源小条（三宫格）
  f_tile       底栏选中的页签垫的那一块亮蓝
  f_key_*      图标键（设置、加号、返回）
  f_avatar(_gold) 头像框
  f_card_glass 入口图标后面垫的半透明白色方块
  f_dot        红点
  f_g_plus、f_g_gear 平面的白色加号、齿轮（放在图标键上）
三宫格的边距写进 client/tools/art/slices_skin.json。用法：python3 tools/art/flat_skin.py [输出目录]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'client/assets/resources/ui/skin'
SLICES = REPO / 'client/tools/art/slices_skin.json'

SS = 4            # 超采样倍数
H = 300           # 三宫格部件的高（运行时按高度缩放）
CAP = 186         # 三宫格左右两头各留多宽（中间 4 像素横向拉伸）
MID = 4
LIP = 0.11        # 下面那道粗边 = 部件高的几分之几

# 面的颜色、下边的颜色
BUTTONS = {
    'green': ('#3CC62B', '#268F1B'),
    'blue': ('#3F8DFF', '#1E55C4'),
    'amber': ('#FFAA1C', '#D07C00'),
    'red': ('#F2553E', '#BC3320'),
    'gray': ('#B4C0CF', '#8894A8'),
}
PLATE_BLUE = ('#2B7BEF', '#1A52BE')
TILE = '#3F9CFF'
KEYS = {'blue': ('#3F8DFF', '#1E55C4'), 'green': ('#3CC62B', '#268F1B'), 'red': ('#F2553E', '#BC3320')}
AVATAR = {'': ('#8AD6FF', '#2F80F6'), '_gold': ('#FFD75E', '#D08A00')}
DOT = ('#F2453A', '#FFFFFF')


def raised(w: int, h: int, face: str, edge: str, radius: float, lip: float = LIP) -> Image.Image:
    """凸起的圆角方块：底下一块深色的，面往上让出一道边。radius、lip 是高的几分之几。"""
    W, HH = w * SS, h * SS
    im = Image.new('RGBA', (W, HH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    lp = round(HH * lip)
    r = round(HH * radius)
    d.rounded_rectangle((0, lp, W - 1, HH - 1), r, fill=edge)
    d.rounded_rectangle((0, 0, W - 1, HH - 1 - lp), r, fill=face)
    return im.resize((w, h), Image.LANCZOS)


def flat(w: int, h: int, color: str, radius: float, corners=(True, True, True, True)) -> Image.Image:
    """不凸起的圆角方块。corners：左上、右上、右下、左下哪几个角是圆的。"""
    W, HH = w * SS, h * SS
    im = Image.new('RGBA', (W, HH), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, W - 1, HH - 1), round(HH * radius), fill=color, corners=corners)
    return im.resize((w, h), Image.LANCZOS)


def dot(s: int, color: str, ring: str) -> Image.Image:
    S = s * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((0, 0, S - 1, S - 1), fill=ring)
    k = round(S * 0.1)
    d.ellipse((k, k, S - 1 - k, S - 1 - k), fill=color)
    return im.resize((s, s), Image.LANCZOS)


def glyph_plus(s: int) -> Image.Image:
    """白色加号：两根圆头的粗杠。"""
    S = s * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    t, m = round(S * 0.24), round(S * 0.12)
    d.rounded_rectangle((m, S // 2 - t // 2, S - m, S // 2 + t // 2), t // 2, fill='white')
    d.rounded_rectangle((S // 2 - t // 2, m, S // 2 + t // 2, S - m), t // 2, fill='white')
    return im.resize((s, s), Image.LANCZOS)


def glyph_gear(s: int, teeth: int = 8) -> Image.Image:
    """白色齿轮：圆盘 + 一圈圆角方齿，中间挖一个洞。"""
    import math
    S = s * SS
    c = S / 2
    mask = Image.new('L', (S, S), 0)
    d = ImageDraw.Draw(mask)
    r_body, r_tip, r_hole = S * 0.33, S * 0.46, S * 0.15
    half = math.pi / teeth * 0.52
    for i in range(teeth):
        a = 2 * math.pi * i / teeth
        pts = []
        for da, r in ((-half, r_body * 0.9), (-half * 0.72, r_tip), (half * 0.72, r_tip), (half, r_body * 0.9)):
            pts.append((c + r * math.cos(a + da), c + r * math.sin(a + da)))
        d.polygon(pts, fill=255)
    d.ellipse((c - r_body, c - r_body, c + r_body, c + r_body), fill=255)
    d.ellipse((c - r_hole, c - r_hole, c + r_hole, c + r_hole), fill=0)
    im = Image.new('RGBA', (S, S), (255, 255, 255, 0))
    im.putalpha(mask)
    return im.resize((s, s), Image.LANCZOS)


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT
    out.mkdir(parents=True, exist_ok=True)
    slices = json.loads(SLICES.read_text()) if SLICES.exists() else {}
    w3 = CAP * 2 + MID

    def save(name: str, im: Image.Image, three: bool = False) -> None:
        im.save(out / f'{name}.png')
        if three:
            slices[name] = [0, 0, CAP, CAP]
        print(f'  {name}: {im.size}')

    for name, (face, edge) in BUTTONS.items():
        save(f'j_btn_{name}', raised(w3, H, face, edge, 0.24), True)
    save('f_plate_blue', raised(w3, H, *PLATE_BLUE, 0.3, 0.12), True)
    # 底栏：一块浮着的白色圆角托盘（用户 2026-11-16：整条深蓝底不好看，不要那种背景色），选中的页签是托盘上一块平的亮蓝
    save('f_dock', flat(w3, H, (255, 255, 255, 238), 0.3), True)
    save('f_tile', flat(384, 450, TILE, 0.17))
    for name, (face, edge) in KEYS.items():
        save(f'f_key_{name}', raised(256, 256, face, edge, 0.3))
    for name, (face, edge) in AVATAR.items():
        save(f'f_avatar{name}', raised(256, 256, face, edge, 0.26))
    # 入口图标后面垫的半透明白色方块：大小形状各不相同的图标放进同样的格子里，排起来才整齐
    save('f_card_glass', flat(256, 256, (255, 255, 255, 74), 0.24))
    save('f_dot', dot(96, *DOT))
    save('f_g_plus', glyph_plus(192))
    save('f_g_gear', glyph_gear(192))
    if out == OUT:
        SLICES.write_text(json.dumps(slices, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
