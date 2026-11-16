#!/usr/bin/env python3
"""平面界面部件（docs/03 第 2 节，用户 2026-11-16 定）：纯色平面、圆角方块，没有渐变、高光、描边；
凸起的部件（按钮、标签牌、图标键）只在下面压一道同色系的粗边。

程序直接画，不经 Codex：形状规整、边缘干净，同一类部件的各种颜色完全一致。
输出到 client/assets/resources/ui/skin/：
  j_btn_*      五色按钮（横向三宫格）
  f_plate_blue 标签牌 / 页标题牌 / 弹窗标题牌（三宫格）
  f_dock       白色圆角小条：顶栏的资源条、局内的信息条、提示条（三宫格）
  f_card(_s)   白色容器：面板、信息块（九宫格；_s 是小圆角，给矮的用）
  f_popup      弹窗的白色底板（九宫格）
  f_inset      容器里的浅蓝格子：设置行、签到格、资料行（九宫格）
  f_block(_s)  凸起的蓝色块：列表行、商品卡、技能键（九宫格）
  f_block_gold(_s) 凸起的金色块：今天能领的那一格、选中的头像
  f_bar_*      进度条：两种槽（深色底用 track、白色容器里用 track_light）和四色填充（三宫格）
  f_slot(_warn) 局内暂存格：半透明白格子，快满时换成红的（九宫格）
  f_shelf      局内放鱼缸的木架（三宫格）
  f_order      局内的订单卡
  f_toggle_on/off 开关
  f_node_*     选关路线上的关卡圆牌
  f_ribbon     结算页的横幅（三宫格）
  f_card_<稀有度> 收藏卡的卡框
  f_key_*      图标键（设置、加号、返回、关闭）
  f_avatar(_gold) 头像框
  f_card_glass 入口图标后面垫的半透明白色方块
  f_skill      局内技能键的半透明白格子
  f_dot        红点
  f_check      完成的对勾（绿色圆片 + 白勾）
  f_g_*        平面的白色图标（放在白色容器里时由界面染成蓝色）：加号、齿轮、返回箭头、叉、摄像机（看广告）、分享、音符、喇叭、震动、地球、秒表
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
KEYS = {'blue': ('#3F8DFF', '#1E55C4'), 'green': ('#3CC62B', '#268F1B'), 'red': ('#F2553E', '#BC3320')}
AVATAR = {'': ('#8AD6FF', '#2F80F6'), '_gold': ('#FFD75E', '#D08A00')}
DOT = ('#F2453A', '#FFFFFF')
BLOCK = ('#3585F2', '#1D58C2')
BLOCK_GOLD = ('#FFB62E', '#D98A00')
WHITE_CARD = (255, 255, 255, 240)
INSET = '#E4EEFB'
TRACK = (15, 55, 140, 190)
TRACK_LIGHT = '#D3E1F4'
FILLS = {'green': '#43CF2F', 'yellow': '#FFC531', 'blue': '#4DA3FF', 'purple': '#A066F5'}
SHELF = ('#EBAA5C', '#B9762F')
NODES = {'green': ('#43CF2F', '#268F1B'), 'blue': ('#3F8DFF', '#1E55C4'), 'purple': ('#A066F5', '#6B3CC4'), 'gray': ('#B4C0CF', '#8894A8')}
RIBBON = ('#F2553E', '#BC3320')
# 收藏卡：卡框的面、下边，窗口里的底色
RARITY = {
    'common': ('#7FB6F5', '#4C86CF', '#E8F3FF'),
    'uncommon': ('#59CC4A', '#2F8F3A', '#E9FAE4'),
    'rare': ('#3F8DFF', '#1E55C4', '#E2EEFF'),
    'epic': ('#A066F5', '#6B3CC4', '#F0E6FF'),
    'legend': ('#FFB62E', '#D98A00', '#FFF4D6'),
}


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


def px(color, size):
    return Image.new('RGBA', size, color)


def raised_px(w: int, h: int, face, edge, r: int, lp: int) -> Image.Image:
    """凸起的圆角方块，圆角和下边按像素给（九宫格部件：拉大以后圆角、下边粗细不变）。"""
    W, HH = w * SS, h * SS
    im = Image.new('RGBA', (W, HH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, lp * SS, W - 1, HH - 1), r * SS, fill=edge)
    d.rounded_rectangle((0, 0, W - 1, HH - 1 - lp * SS), r * SS, fill=face)
    return im.resize((w, h), Image.LANCZOS)


def flat_px(w: int, h: int, color, r: int) -> Image.Image:
    W, HH = w * SS, h * SS
    im = Image.new('RGBA', (W, HH), (0, 0, 0, 0))
    ImageDraw.Draw(im).rounded_rectangle((0, 0, W - 1, HH - 1), r * SS, fill=color)
    return im.resize((w, h), Image.LANCZOS)


def stroke(d: ImageDraw.ImageDraw, pts, t: float, fill='white') -> None:
    """一笔圆头圆角的粗线。"""
    d.line(pts, fill=fill, width=round(t), joint='curve')
    for x, y in pts:
        d.ellipse((x - t / 2, y - t / 2, x + t / 2, y + t / 2), fill=fill)


def glyph(s: int, draw) -> Image.Image:
    S = s * SS
    im = Image.new('RGBA', (S, S), (255, 255, 255, 0))
    mask = Image.new('L', (S, S), 0)
    draw(ImageDraw.Draw(mask), S)
    im.putalpha(mask)
    return im.resize((s, s), Image.LANCZOS)


def g_back(d, S):
    t = S * 0.2
    stroke(d, [(S * 0.84, S * 0.5), (S * 0.2, S * 0.5)], t, 255)
    stroke(d, [(S * 0.46, S * 0.22), (S * 0.18, S * 0.5), (S * 0.46, S * 0.78)], t, 255)


def g_x(d, S):
    t = S * 0.22
    stroke(d, [(S * 0.22, S * 0.22), (S * 0.78, S * 0.78)], t, 255)
    stroke(d, [(S * 0.78, S * 0.22), (S * 0.22, S * 0.78)], t, 255)


def g_video(d, S):
    d.rounded_rectangle((S * 0.06, S * 0.24, S * 0.68, S * 0.76), S * 0.13, fill=255)
    d.polygon([(S * 0.62, S * 0.5), (S * 0.94, S * 0.27), (S * 0.94, S * 0.73)], fill=255)
    d.polygon([(S * 0.29, S * 0.37), (S * 0.29, S * 0.63), (S * 0.5, S * 0.5)], fill=0)


def g_share(d, S):
    a, b, c = (S * 0.72, S * 0.22), (S * 0.26, S * 0.5), (S * 0.72, S * 0.78)
    d.line([a, b, c], fill=255, width=round(S * 0.1), joint='curve')
    for x, y in (a, b, c):
        r = S * 0.17
        d.ellipse((x - r, y - r, x + r, y + r), fill=255)


def g_music(d, S):
    t = S * 0.1
    # 两个音符头 + 两根杆 + 一道横梁
    for cx, cy in ((S * 0.3, S * 0.74), (S * 0.72, S * 0.64)):
        d.ellipse((cx - S * 0.15, cy - S * 0.11, cx + S * 0.15, cy + S * 0.11), fill=255)
    d.line([(S * 0.41, S * 0.74), (S * 0.41, S * 0.22)], fill=255, width=round(t))
    d.line([(S * 0.83, S * 0.64), (S * 0.83, S * 0.12)], fill=255, width=round(t))
    d.polygon([(S * 0.36, S * 0.2), (S * 0.88, S * 0.1), (S * 0.88, S * 0.28), (S * 0.36, S * 0.38)], fill=255)


def g_sound(d, S):
    d.rounded_rectangle((S * 0.08, S * 0.36, S * 0.34, S * 0.64), S * 0.05, fill=255)
    d.polygon([(S * 0.22, S * 0.5), (S * 0.54, S * 0.16), (S * 0.54, S * 0.84)], fill=255)
    for r in (0.2, 0.36):
        d.arc((S * (0.52 - r), S * (0.5 - r), S * (0.52 + r), S * (0.5 + r)), -48, 48, fill=255, width=round(S * 0.09))


def g_vibrate(d, S):
    d.rounded_rectangle((S * 0.3, S * 0.1, S * 0.7, S * 0.9), S * 0.1, fill=255)
    d.rounded_rectangle((S * 0.38, S * 0.2, S * 0.62, S * 0.72), S * 0.03, fill=0)
    for x0, x1 in ((0.2, 0.12), (0.8, 0.88)):
        stroke(d, [(S * x0, S * 0.3), (S * x1, S * 0.4), (S * x0, S * 0.5), (S * x1, S * 0.6), (S * x0, S * 0.7)], S * 0.06, 255)


def g_globe(d, S):
    t = round(S * 0.08)
    d.ellipse((S * 0.08, S * 0.08, S * 0.92, S * 0.92), outline=255, width=t)
    d.ellipse((S * 0.3, S * 0.08, S * 0.7, S * 0.92), outline=255, width=t)
    d.line([(S * 0.1, S * 0.5), (S * 0.9, S * 0.5)], fill=255, width=t)
    d.line([(S * 0.5, S * 0.1), (S * 0.5, S * 0.9)], fill=255, width=t)


def g_timer(d, S):
    t = round(S * 0.1)
    d.ellipse((S * 0.12, S * 0.2, S * 0.88, S * 0.96), outline=255, width=t)
    d.rounded_rectangle((S * 0.38, S * 0.04, S * 0.62, S * 0.16), S * 0.04, fill=255)
    stroke(d, [(S * 0.5, S * 0.36), (S * 0.5, S * 0.58), (S * 0.66, S * 0.66)], S * 0.09, 255)


def check_badge(s: int) -> Image.Image:
    S = s * SS
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((0, 0, S - 1, S - 1), fill='#3CC62B')
    stroke(d, [(S * 0.27, S * 0.52), (S * 0.44, S * 0.68), (S * 0.73, S * 0.35)], S * 0.13, 'white')
    return im.resize((s, s), Image.LANCZOS)


def toggle(on: bool) -> Image.Image:
    w, h = 330, 157
    W, HH = w * SS, h * SS
    im = Image.new('RGBA', (W, HH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, W - 1, HH - 1), HH // 2, fill='#3CC62B' if on else '#B9C5D6')
    m = round(HH * 0.12)
    x = W - HH + m if on else m
    d.ellipse((x, m, x + HH - 2 * m, HH - m), fill='white')
    return im.resize((w, h), Image.LANCZOS)


def node(face: str, edge: str) -> Image.Image:
    """关卡圆牌：一个平面的圆，下面压一道同色系的边。"""
    w, h = 300, 310
    W, HH = w * SS, h * SS
    im = Image.new('RGBA', (W, HH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    lp = 26 * SS
    d.ellipse((0, lp, W - 1, HH - 1), fill=edge)
    d.ellipse((0, 0, W - 1, HH - 1 - lp), fill=face)
    return im.resize((w, h), Image.LANCZOS)


def ribbon(face: str, edge: str) -> Image.Image:
    """横幅：中间一块凸起的牌子，两头各露出一截折到后面去的尾巴。"""
    w3 = CAP * 2 + MID
    W, HH = w3 * SS, H * SS
    im = Image.new('RGBA', (W, HH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    tail = 70 * SS
    top, bot = round(HH * 0.3), round(HH * 0.92)
    for x0, x1, notch in ((0, tail * 2, tail * 0.7), (W - 1, W - 1 - tail * 2, W - 1 - tail * 0.7)):
        d.polygon([(x0, top), (x1, top), (x1, bot), (x0, bot), (notch, (top + bot) / 2)], fill=edge)
    lp = round(HH * 0.1)
    r = round(HH * 0.16)
    d.rounded_rectangle((tail, round(HH * 0.1) + lp, W - 1 - tail, round(HH * 0.8)), r, fill=edge)
    d.rounded_rectangle((tail, round(HH * 0.1), W - 1 - tail, round(HH * 0.8) - lp), r, fill=face)
    return im.resize((w3, H), Image.LANCZOS)


def card_frame(face: str, edge: str, inner: str) -> Image.Image:
    """收藏卡的卡框 600×803：稀有度颜色的凸起卡片，上面一扇浅色的窗（放生物），下面一条浅色的名字条。"""
    w, h = 600, 803
    W, HH = w * SS, h * SS
    im = Image.new('RGBA', (W, HH), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    lp, r = 30 * SS, 64 * SS
    d.rounded_rectangle((0, lp, W - 1, HH - 1), r, fill=edge)
    d.rounded_rectangle((0, 0, W - 1, HH - 1 - lp), r, fill=face)
    m = 38 * SS
    d.rounded_rectangle((m, m, W - 1 - m, round(HH * 0.69)), 40 * SS, fill=inner)
    d.rounded_rectangle((m + 30 * SS, round(HH * 0.735), W - 1 - m - 30 * SS, round(HH * 0.895)), 46 * SS, fill=inner)
    return im.resize((w, h), Image.LANCZOS)


def main() -> None:
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else OUT
    out.mkdir(parents=True, exist_ok=True)
    slices = json.loads(SLICES.read_text()) if SLICES.exists() else {}
    w3 = CAP * 2 + MID

    def save(name: str, im: Image.Image, three: bool = False, nine: int = 0, bottom: int = 0) -> None:
        im.save(out / f'{name}.png')
        if three:
            slices[name] = [0, 0, CAP, CAP]
        if nine:
            # 上、下、左、右；凸起的部件下面多留一道边
            slices[name] = [nine, bottom or nine, nine, nine]
        print(f'  {name}: {im.size}')

    for name, (face, edge) in BUTTONS.items():
        save(f'j_btn_{name}', raised(w3, H, face, edge, 0.24), True)
    save('f_plate_blue', raised(w3, H, *PLATE_BLUE, 0.3, 0.12), True)
    # 白色圆角小条（容器一律是白的，上面写深蓝字）
    save('f_dock', flat(w3, H, (255, 255, 255, 238), 0.3), True)
    for name, (face, edge) in KEYS.items():
        save(f'f_key_{name}', raised(256, 256, face, edge, 0.3))
    for name, (face, edge) in AVATAR.items():
        save(f'f_avatar{name}', raised(256, 256, face, edge, 0.26))
    # 入口图标后面垫的半透明白色方块：大小形状各不相同的图标放进同样的格子里，排起来才整齐
    save('f_card_glass', flat(256, 256, (255, 255, 255, 74), 0.24))
    # 局内技能键的格子：比入口的格子实一点（下面的场景花，太透了看不出是个键）
    save('f_skill', flat(256, 256, (255, 255, 255, 132), 0.24))
    save('f_dot', dot(96, *DOT))
    save('f_g_plus', glyph_plus(192))
    save('f_g_gear', glyph_gear(192))
    for name, fn in (('back', g_back), ('x', g_x), ('video', g_video), ('share', g_share), ('music', g_music), ('sound', g_sound), ('vibrate', g_vibrate), ('globe', g_globe), ('timer', g_timer)):
        save(f'f_g_{name}', glyph(192, fn))
    save('f_check', check_badge(192))
    # 容器（九宫格，图是 3 倍的：圆角 30 → 90 像素）
    save('f_card', flat_px(240, 240, WHITE_CARD, 90), nine=116)
    save('f_card_s', flat_px(180, 180, WHITE_CARD, 60), nine=88)
    save('f_popup', flat_px(300, 300, (255, 255, 255, 255), 126), nine=146)
    save('f_inset', flat_px(180, 180, INSET, 60), nine=88)
    # 凸起的块：圆角 26、下边 10（小的：20、8）
    save('f_block', raised_px(240, 240, *BLOCK, 78, 30), nine=110, bottom=126)
    save('f_block_s', raised_px(180, 180, *BLOCK, 60, 24), nine=82, bottom=94)
    save('f_block_gold', raised_px(240, 240, *BLOCK_GOLD, 78, 30), nine=110, bottom=126)
    save('f_block_gold_s', raised_px(180, 180, *BLOCK_GOLD, 60, 24), nine=82, bottom=94)
    # 进度条：槽和填充都是平的圆头条
    save('f_bar_track', flat(w3, H, TRACK, 0.5), True)
    save('f_bar_track_light', flat(w3, H, TRACK_LIGHT, 0.5), True)
    for name, color in FILLS.items():
        save(f'f_bar_{name}', flat(w3, H, color, 0.5), True)
    # 局内
    save('f_slot', flat_px(216, 216, (255, 255, 255, 76), 60), nine=100)
    save('f_slot_warn', flat_px(216, 216, (255, 90, 78, 150), 60), nine=100)
    save('f_shelf', raised(w3, H, *SHELF, 0.34, 0.22), True)
    # 订单卡（鱼缸前面叠着的卡，一张卡一条鱼）：白色小卡片，下面压一道浅蓝灰的边；鱼画在上面，颜色最清楚
    save('f_order', raised_px(300, 386, '#FFFFFF', '#BFD0E6', 42, 18))
    save('f_toggle_on', toggle(True))
    save('f_toggle_off', toggle(False))
    for name, (face, edge) in NODES.items():
        save(f'f_node_{name}', node(face, edge))
    save('f_ribbon', ribbon(*RIBBON), True)
    for name, (face, edge, inner) in RARITY.items():
        save(f'f_card_{name}', card_frame(face, edge, inner))
    if out == OUT:
        SLICES.write_text(json.dumps(slices, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
