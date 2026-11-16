#!/usr/bin/env python3
"""把 Codex 出的界面部件图（白底）切成可拉伸的部件，放进 client/assets/resources/ui/skin。

docs/03 第 5 节「界面部件」：部件由 Codex 画一张母版，这里负责
  - 抠成透明底、按阅读顺序切开；
  - 横向三宫格压缩：留左右两头，中间只留一条（运行时横向拉伸），接缝处向中间色过渡；
  - 换色：一张母版按色相转成整套语义色（形状、高光完全一致）；
  - 边距写进 client/tools/art/slices_skin.json（.meta 生成时读）。
用法：python3 tools/art/skin.py [art/raw/ui_skin]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from slice import components, reading_order, remove_background  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'client/assets/resources/ui/skin'
SLICES = REPO / 'client/tools/art/slices_skin.json'


def cut(path: Path):
    im = remove_background(Image.open(path))
    boxes = reading_order(components(np.asarray(im)[:, :, 3]))
    return [im.crop((l, t, r, b)) for t, l, b, r in boxes]


def scale_h(im: Image.Image, h: int) -> Image.Image:
    w = round(im.width * h / im.height)
    return im.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')


def three(im: Image.Image, h: int, cap_frac: float, mid: int = 4):
    """横向三宫格：缩到高 h，留两头各 cap_frac×h，中间压成 mid 像素。返回 (图, 边距)。"""
    im = scale_h(im, h)
    a = np.asarray(im).astype(np.float32)
    w = a.shape[1]
    cap = round(h * cap_frac)
    assert w > cap * 2 + 8, '部件太短，切不出三宫格'
    centre = a[:, int(w * 0.4):int(w * 0.6), :].mean(axis=1, keepdims=True)
    left, right = a[:, :cap, :].copy(), a[:, w - cap:, :].copy()
    # 两头靠里的 30% 逐渐过渡到中间色，接缝看不出来
    n = max(2, round(cap * 0.3))
    t = np.linspace(0, 1, n, dtype=np.float32)[None, :, None]
    left[:, cap - n:, :] = left[:, cap - n:, :] * (1 - t) + centre * t
    right[:, :n, :] = right[:, :n, :] * t[:, ::-1, :] + centre * (1 - t[:, ::-1, :])
    out = np.concatenate([left, np.repeat(centre, mid, axis=1), right], axis=1)
    return Image.fromarray(np.clip(out + 0.5, 0, 255).astype(np.uint8), 'RGBA'), [0, 0, cap, cap]


def bake(im: Image.Image, w: int, h: int, top: float = 0.4, bottom: float = 0.3) -> Image.Image:
    """把方块烤成 w×h：整体按宽度缩放，上 top、下 bottom 保持不变，中间一段纵向拉伸。"""
    im = im.convert('RGBa').resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    a = np.asarray(im)
    ih = a.shape[0]
    t, b = round(ih * top), round(ih * bottom)
    midsrc = Image.fromarray(a[t:ih - b], 'RGBa').resize((w, h - t - b), Image.LANCZOS)
    out = np.concatenate([a[:t], np.asarray(midsrc), a[ih - b:]], axis=0)
    return Image.fromarray(out, 'RGBa').convert('RGBA')


def nine(im: Image.Image, size: int, cap: int, mid: int = 24):
    """九宫格：缩到宽 size，四角各留 cap 像素；中间横向取正中一列（左右必须均匀），纵向按原比例取 mid 行（保住上下渐变）。"""
    im = im.convert('RGBa').resize((size, round(im.height * size / im.width)), Image.LANCZOS)
    a = np.asarray(im)
    h, w = a.shape[:2]
    rows = np.r_[0:cap, np.linspace(cap, h - cap - 1, mid).round().astype(int), h - cap:h]
    cols = np.r_[0:cap, np.full(mid, w // 2), w - cap:w]
    out = a[np.ix_(rows, cols)]
    return Image.fromarray(out, 'RGBa').convert('RGBA'), [cap, cap, cap, cap]


def rgb2hsv(c):
    r, g, b = c[..., 0], c[..., 1], c[..., 2]
    mx, mn = c.max(-1), c.min(-1)
    d = mx - mn
    h = np.zeros_like(mx)
    m = d > 1e-6
    rc = np.where(m, (mx - r) / np.where(m, d, 1), 0)
    gc = np.where(m, (mx - g) / np.where(m, d, 1), 0)
    bc = np.where(m, (mx - b) / np.where(m, d, 1), 0)
    h = np.where(mx == r, bc - gc, np.where(mx == g, 2.0 + rc - bc, 4.0 + gc - rc))
    h = (h / 6.0) % 1.0
    s = np.where(mx > 1e-6, d / np.where(mx > 1e-6, mx, 1), 0)
    return h, s, mx


def hsv2rgb(h, s, v):
    i = np.floor(h * 6.0)
    f = h * 6.0 - i
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    i = i.astype(int) % 6
    r = np.choose(i, [v, q, p, p, t, v])
    g = np.choose(i, [t, v, v, q, p, p])
    b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)


def recolor(im: Image.Image, src: float, dst: float, k: float = 1.0, sat: float = 1.0, val: float = 1.0, gamma: float = 1.0) -> Image.Image:
    """色相从 src 转到 dst（度）。k：母版里围绕 src 的色相起伏保留多少（负数 = 反向，暖色上浅下深用）。"""
    a = np.asarray(im).astype(np.float32) / 255.0
    h, s, v = rgb2hsv(a[..., :3])
    dh = ((h * 360.0 - src + 180.0) % 360.0) - 180.0
    h2 = ((dst + k * dh) % 360.0) / 360.0
    rgb = hsv2rgb(h2, np.clip(s * sat, 0, 1), np.clip((v ** gamma) * val, 0, 1))
    out = np.concatenate([rgb, a[..., 3:4]], -1)
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def recolor_band(im: Image.Image, src: float, width: float, dst: float, k: float = 1.0, sat: float = 1.0, val: float = 1.0) -> Image.Image:
    """只把色相在 src±width 里的像素换色（收藏卡框：紫框换色，蓝色画框不动），边上平滑过渡。"""
    a = np.asarray(im).astype(np.float32) / 255.0
    h, s, v = rgb2hsv(a[..., :3])
    dh = ((h * 360.0 - src + 180.0) % 360.0) - 180.0
    w = np.clip(1.0 - (np.abs(dh) - width * 0.6) / (width * 0.4), 0, 1) * np.clip((s - 0.12) / 0.15, 0, 1)
    h2 = ((dst + k * dh) % 360.0) / 360.0
    rgb2 = hsv2rgb(h2, np.clip(s * sat, 0, 1), np.clip(v * val, 0, 1))
    rgb = a[..., :3] * (1 - w[..., None]) + rgb2 * w[..., None]
    out = np.concatenate([rgb, a[..., 3:4]], -1)
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def glass(path: Path, width: int) -> Image.Image:
    """白底上的玻璃器皿：轮廓外是背景；轮廓里按「越白越透明」还原 alpha（白色成分去掉），高光保留一点白。"""
    im = remove_background(Image.open(path))
    (box,) = [b for b in [components(np.asarray(im)[:, :, 3])] for b in b][:1] or [None]
    a = np.asarray(im).astype(np.float32) / 255.0
    rgb, al = a[..., :3], a[..., 3]
    inside = al > 0.5
    m = rgb.min(-1)
    alpha = np.clip((1.0 - m) / 0.42, 0.0, 1.0)
    # 高光（接近纯白）留成半透明白
    hi = np.clip((m - 0.93) / 0.07, 0, 1)
    alpha = np.maximum(alpha, 0.10 + 0.55 * hi)
    alpha = np.where(inside, alpha, al)
    safe = np.clip(alpha, 0.05, 1.0)[..., None]
    col = np.clip((rgb - (1 - safe)) / safe, 0, 1)
    col = np.where(hi[..., None] > 0, rgb * hi[..., None] + col * (1 - hi[..., None]), col)
    out = np.concatenate([col, alpha[..., None]], -1)
    res = Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA')
    if box:
        t, l, b, r = box
        res = res.crop((l, t, r, b))
    return res.convert('RGBa').resize((width, round(res.height * width / res.width)), Image.LANCZOS).convert('RGBA')


def cut_grid(path: Path, cols: int, rows: int):
    """按网格切：同一格里的碎块（字旁边的小星星、气泡）并成一张。按行优先返回。"""
    im = remove_background(Image.open(path))
    W, H = im.size
    cells = {}
    for t, l, b, r in components(np.asarray(im)[:, :, 3]):
        cx, cy = (l + r) / 2, (t + b) / 2
        k = (int(cy * rows / H), int(cx * cols / W))
        u = cells.get(k)
        cells[k] = (min(u[0], t), min(u[1], l), max(u[2], b), max(u[3], r)) if u else (t, l, b, r)
    return [im.crop((l, t, r, b)) for (_, _), (t, l, b, r) in sorted(cells.items())]


def scaled(im: Image.Image, k: float) -> Image.Image:
    return im.convert('RGBa').resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.LANCZOS).convert('RGBA')


def light_on_black(path: Path, size: int) -> Image.Image:
    """黑底上的发光 / 透明物体：alpha = 最亮通道，颜色 = rgb / alpha（反预乘）。裁到外接正方形再缩放。"""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32) / 255.0
    al = np.clip((a.max(-1) - 0.04) / 0.96, 0, 1)
    col = np.clip(a / np.maximum(al, 1e-3)[..., None], 0, 1)
    out = Image.fromarray(np.clip(np.dstack([col, al]) * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA')
    ys, xs = np.nonzero(al > 0.08)
    cx, cy = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2
    r = max(xs.max() - xs.min(), ys.max() - ys.min()) / 2 + 4
    out = out.crop((int(cx - r), int(cy - r), int(cx + r), int(cy + r)))
    return out.convert('RGBa').resize((size, size), Image.LANCZOS).convert('RGBA')


def main() -> None:
    raw = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / 'art/raw/ui_skin'
    OUT.mkdir(parents=True, exist_ok=True)
    slices = {}

    def save(name: str, im: Image.Image, border=None) -> None:
        im.save(OUT / f'{name}.png')
        if border:
            slices[name] = border
        print(f'  {name}: {im.size} {border or ""}')

    # 按钮：一张绿色母版转出整套语义色（docs/03 第 2 节：绿主行动、蓝次行动、琥珀广告与奖励、红危险、灰不可用）
    (btn,) = cut(raw / 'btn.png')
    g, border = three(btn, 300, 0.62)
    save('j_btn_green', g, border)
    save('j_btn_blue', recolor(g, 105, 216, 0.6, 1.0, 1.0), border)
    save('j_btn_amber', recolor(g, 105, 40, -0.55, 1.0, 1.06, 0.85), border)
    save('j_btn_red', recolor(g, 105, 4, -0.4, 0.92, 1.04, 0.9), border)
    save('j_btn_gray', recolor(g, 105, 214, 0.2, 0.16, 0.9), border)

    # 蓝色条：顶栏、底栏、标签条
    top, tab, plate = cut(raw / 'bars.png')
    save('j_bar_top', *three(top, 288, 0.5))
    save('j_bar_tab', *three(tab, 492, 0.4))
    save('j_plate', *three(plate, 216, 0.55))

    # 方块：选中页签的亮块、图标键、头像框
    tile, key, avatar = cut(raw / 'keys.png')
    save('j_tile', bake(tile, 420, 512))
    k = key.convert('RGBa').resize((288, round(key.height * 288 / key.width)), Image.LANCZOS).convert('RGBA')
    save('j_key_blue', k)
    save('j_key_green', recolor(k, 222, 112, 0.7, 0.9, 0.92))
    save('j_key_red', recolor(k, 222, 4, 0.5, 0.86, 1.0))
    av = avatar.convert('RGBa').resize((336, round(avatar.height * 336 / avatar.width)), Image.LANCZOS).convert('RGBA')
    save('j_avatar', av)
    # 集齐收藏后的金色头像框
    save('j_avatar_gold', recolor(av, 215, 44, -0.3, 1.0, 1.1, 0.8))

    # 蓝色玻璃卡片（商店的技能卡、列表卡）：九宫格，按 3 倍图用（ui/kit.ts 的 slice）
    if (raw / 'panel.png').exists():
        (panel,) = cut(raw / 'panel.png')
        pim, pb = nine(panel, 800, 156)
        # 略微透一点场景（定版图的卡片是半透明玻璃）
        pa = np.asarray(pim).astype(np.float32)
        pa[..., 3] *= 0.93
        save('j_panel', Image.fromarray(pa.astype(np.uint8), 'RGBA'), pb)
        # 小圆角版（列表行、小卡片）：同一张母版缩小切，角约 26 设计单位
        rim, rb = nine(panel, 400, 78)
        ra = np.asarray(rim).astype(np.float32)
        ra[..., 3] *= 0.93
        save('j_row', Image.fromarray(ra.astype(np.uint8), 'RGBA'), rb)

    # 弹窗框：宝蓝厚框 + 浅天蓝内容区（九宫格）
    (popup,) = cut(raw / 'popup.png')
    save('j_popup', *nine(popup, 840, 140))

    # 横幅（通关等）：两头带折角飘带，中间横向拉伸；两头留到飘带和圆角都在里面
    (rib,) = cut(raw / 'ribbon.png')
    rh = 300
    rw = rib.width * rh / rib.height
    save('j_ribbon', *three(rib, rh, 0.3 * rw / rh))

    # 选关节点：已过（蓝）、当前（绿 + 金圈）、未开（灰）、挑战（紫 + 金圈）
    for nm, im in zip(['blue', 'green', 'gray', 'purple'], cut(raw / 'nodes.png')):
        save(f'j_node_{nm}', im.convert('RGBa').resize((300, round(im.height * 300 / im.width)), Image.LANCZOS).convert('RGBA'))

    # 局内：木架（横向三宫格）、暂存格
    shelf, slot = cut(raw / 'shelf.png')
    save('j_shelf', *three(shelf, 120, 1.2))
    j, jb = nine(slot, 300, 96)
    save('j_slot', j, jb)
    # 暂存格快满时的警告色
    save('j_slot_warn', recolor(j, 205, 2, 0.4, 1.0, 1.25, 0.85), jb)

    # 排行奖牌：金、银、铜
    if (raw / 'medals.png').exists():
        for nm, im in zip(['1', '2', '3'], cut(raw / 'medals.png')):
            save(f'j_medal_{nm}', im.convert('RGBa').resize((round(im.width * 300 / im.height), 300), Image.LANCZOS).convert('RGBA'))

    # 金色卡片（签到的今天、当前头像）：蓝色卡片换成金色
    (panel,) = cut(raw / 'panel.png')
    gim, gb = nine(panel, 400, 78)
    save('j_row_gold', recolor(gim, 212, 42, -0.3, 1.0, 1.12, 0.8), gb)

    # 收藏卡框：一张紫色（史诗）母版，只把紫色那部分换成各稀有度的颜色，蓝色的画框里面不动
    (card,) = cut(raw / 'card.png')
    card = card.convert('RGBa').resize((600, round(card.height * 600 / card.width)), Image.LANCZOS).convert('RGBA')
    for nm, (dst, k, sat, val) in {
        'common': (208, 0.3, 0.45, 0.96),
        'uncommon': (112, 0.6, 0.95, 0.95),
        'rare': (214, 0.6, 1.0, 1.0),
        'epic': (280, 1.0, 1.0, 1.0),
        'legend': (42, -0.4, 1.0, 1.12),
    }.items():
        save(f'j_card_{nm}', recolor_band(card, 280, 45, dst, k, sat, val))

    # 收藏册封面：六个海域
    for i, im in enumerate(cut(raw / 'books.png')):
        save(f'j_book_{i + 1}', im.convert('RGBa').resize((420, round(im.height * 420 / im.width)), Image.LANCZOS).convert('RGBA'))

    # 开关、进度条
    ton, toff, track, fy, fg = cut(raw / 'controls.png')
    for nm, im in (('j_toggle_on', ton), ('j_toggle_off', toff)):
        save(nm, im.convert('RGBa').resize((330, round(im.height * 330 / im.width)), Image.LANCZOS).convert('RGBA'))
    save('j_bar_track', *three(track, 90, 0.5))
    y3, yb = three(fy, 72, 0.5)
    g3, gbb = three(fg, 72, 0.5)
    save('j_bar_yellow', y3, yb)
    save('j_bar_green', g3, gbb)
    save('j_bar_blue', recolor(g3, 110, 205, 0.6, 1.0, 1.0), gbb)
    save('j_bar_purple', recolor(g3, 110, 280, 0.6, 0.9, 1.0), gbb)

    # 鱼缸：玻璃要透明（白底上的玻璃按「越白越透」还原）
    save('j_bowl', glass(raw / 'bowl.png', 450))

    # 连击艺术字（Codex）：四档夸奖词、数字 0-9、×、「连击」；爆炸星、火焰圆章
    if (raw / 'praise.png').exists():
        for i, im in enumerate(cut_grid(raw / 'praise.png', 2, 2)):
            save(f'j_praise_{i + 1}', scaled(im, 660 / im.width))
    if (raw / 'digits.png').exists():
        gl = cut_grid(raw / 'digits.png', 6, 2)
        k = 180 / float(np.median([g.height for g in gl[:10]]))
        for i, g in enumerate(gl[:10]):
            save(f'j_dg_{i}', scaled(g, k))
        save('j_dg_x', scaled(gl[10], k))
        save('j_combo_word', scaled(gl[11], k))
    if (raw / 'burst.png').exists():
        b, f = cut_grid(raw / 'burst.png', 2, 1)
        save('j_burst', scaled(b, 600 / b.width))
        save('j_flame', scaled(f, 420 / f.width))

    # 局内零件：教学手指、挑战旗、锁链、红点
    if (raw / 'misc.png').exists():
        finger, flag, chain, dot = cut_grid(raw / 'misc.png', 2, 2)
        save('j_finger', scaled(finger, 330 / finger.height))
        save('j_flag', scaled(flag, 270 / flag.height))
        save('j_chain', scaled(chain, 450 / chain.width))
        save('j_dot', scaled(dot, 96 / dot.width))
    # 气泡：黑底上出图，按亮度还原透明度（光是「加」上去的，里面全透明，高光和彩虹边都留住）
    if (raw / 'bubble.png').exists():
        save('j_bubble', light_on_black(raw / 'bubble.png', 480))

    save('j_inset', *inset())

    # 宝箱（关 / 开各一对）：抽奖页的紫色宝箱、过关和等级宝箱的蓝贝壳宝箱。放进 ui/icon；
    # 一对里两张用同一个缩放、箱底对齐、箱体左右居中，换图时箱子不跳
    for src, names in (('chest_wheel', ('chest_wheel', 'chest_wheel_open')), ('chest_level', ('chest', 'chest_open'))):
        if not (raw / f'{src}.png').exists():
            continue
        pair = cut_grid(raw / f'{src}.png', 2, 1)
        k = min(640 / max(im.width for im in pair), 652 / max(im.height for im in pair))
        for name, im in zip(names, pair):
            im = scaled(im, k)
            a = np.asarray(im)[:, :, 3]
            # 箱体中线：最下面三成里不透明像素的左右中点
            xs = np.nonzero(a[int(im.height * 0.7) :].max(0) > 40)[0]
            cx = (xs.min() + xs.max()) / 2
            canvas = Image.new('RGBA', (660, 660), (0, 0, 0, 0))
            canvas.alpha_composite(im, (max(0, min(660 - im.width, round(330 - cx))), 660 - 4 - im.height))
            canvas.save(OUT.parent / 'icon' / f'{name}.png')
            print(f'  icon/{name}: {im.size}')

    SLICES.write_text(json.dumps(slices, indent=2) + '\n')



def white_glyph(src: Path, hole_seeds=()) -> Image.Image:
    """彩色果冻图标 → 白色图标（深蓝描边保留），放在蓝色图标键上用。hole_seeds：图标里要挖空的白色区域的种子点。"""
    from collections import deque

    im = Image.open(src).convert('RGBA')
    a = np.asarray(im).astype(np.float32) / 255.0
    rgb, al = a[..., :3].copy(), a[..., 3].copy()
    h, w = al.shape
    comp = rgb * al[..., None] + (1 - al[..., None])
    near = comp.min(-1) >= 0.9
    hole = np.zeros((h, w), bool)
    q = deque(hole_seeds)
    while q:
        y, x = q.popleft()
        if y < 0 or y >= h or x < 0 or x >= w or hole[y, x] or not near[y, x]:
            continue
        hole[y, x] = True
        q.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    lum = comp[..., 0] * 0.299 + comp[..., 1] * 0.587 + comp[..., 2] * 0.114
    # 挖空处边缘按亮度过渡（越白越透明）
    grown = hole.copy()
    for _ in range(2):
        g = grown.copy()
        g[1:] |= grown[:-1]; g[:-1] |= grown[1:]; g[:, 1:] |= grown[:, :-1]; g[:, :-1] |= grown[:, 1:]
        grown = g
    band = grown & ~hole
    al[hole] = 0
    al[band] *= np.clip(1 - (lum[band] - 0.35) / 0.6, 0, 1)
    # 暗 = 描边（深蓝），亮 = 白色的面，带一点蓝灰的明暗
    t = np.clip((lum - 0.30) / 0.2, 0, 1)[..., None]
    shade = np.clip((lum - 0.45) / 0.45, 0, 1)[..., None]
    face = np.array([0.80, 0.90, 1.0]) * (1 - shade) + np.array([1.0, 1.0, 1.0]) * shade
    navy = np.array([0.05, 0.20, 0.55])
    out = np.concatenate([navy * (1 - t) + face * t, al[..., None]], -1)
    return Image.fromarray(np.clip(out * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def inset(h: int = 192):
    """数字凹槽（顶栏里金币、生命后面那条）：深蓝半透明圆角条，上沿内阴影、下沿一丝亮边。简单几何，直接画。"""
    from PIL import ImageDraw, ImageFilter

    ss = 4
    cap = round(h * 0.4)
    w = cap * 2 + 4
    W, H, r = w * ss, h * ss, round(h * 0.3) * ss
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), r, fill=255)
    y = np.linspace(0, 1, H, dtype=np.float32)[:, None]
    # 上沿深、往下变浅的内阴影
    alpha = (0.62 - 0.22 * np.clip(y / 0.45, 0, 1)) * np.ones((H, W), np.float32)
    rim = Image.new('L', (W, H), 0)
    ImageDraw.Draw(rim).rounded_rectangle((0, 0, W - 1, H - 1), r, outline=255, width=3 * ss)
    rim = np.asarray(rim, np.float32) / 255 * np.clip((y - 0.55) / 0.45, 0, 1)
    rgb = np.array([4, 22, 96], np.float32)[None, None, :] * (1 - rim[..., None]) + np.array([150, 215, 255], np.float32) * rim[..., None]
    a = np.maximum(alpha, rim * 0.55) * (np.asarray(mask, np.float32) / 255)
    out = Image.fromarray(np.dstack([rgb, a[..., None] * 255]).astype(np.uint8), 'RGBA')
    return out.convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA'), [0, 0, cap, cap]


def glyphs() -> None:
    kit = REPO / 'client/assets/resources/ui/kit'
    white_glyph(kit / 'ic_gear.png', [(96, 96)]).save(OUT / 'g_gear.png')
    print('  g_gear')


if __name__ == '__main__':
    main()
    glyphs()
