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


def key_magenta(path) -> Image.Image:
    """品红底上的图案抠出来（白色的艺术字不能用白底：字里封闭的空隙泛洪够不着，会留成白的）。
    品红度 = min(R, B) - G：背景约等于 1，白、绿都 ≤ 0。按它算透明度，再把边缘混进去的品红减掉。裁到外接矩形。"""
    src = path if isinstance(path, Image.Image) else Image.open(path)
    a = np.asarray(src.convert('RGB')).astype(np.float32) / 255.0
    corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    m0 = min(bg[0], bg[2]) - bg[1]
    m = np.minimum(a[..., 0], a[..., 2]) - a[..., 1]
    alpha = 1.0 - np.clip(m / (m0 * 0.85), 0.0, 1.0)
    a3 = np.clip(alpha, 0.02, 1.0)[..., None]
    col = np.clip((a - (1.0 - a3) * bg) / a3, 0.0, 1.0)
    out = Image.fromarray(np.clip(np.dstack([col, alpha]) * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA')
    ys, xs = np.nonzero(alpha > 0.05)
    return out.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def main() -> None:
    raw = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / 'art/raw/ui_skin'
    OUT.mkdir(parents=True, exist_ok=True)
    slices = {}

    def save(name: str, im: Image.Image, border=None) -> None:
        im.save(OUT / f'{name}.png')
        if border:
            slices[name] = border
        print(f'  {name}: {im.size} {border or ""}')

    # 平面的界面部件（按钮、面板、图标键、进度条、开关……）不在这里出：2026-11-16 起整套界面改成平面设计，
    # 由 tools/art/flat_skin.py 程序画；这里只出还在用的插画。保存时把 flat_skin.py 写的边距一起写回
    slices.update({k: v for k, v in (json.loads(SLICES.read_text()) if SLICES.exists() else {}).items() if not k.startswith('j_') or k.startswith('j_btn_')})

    # 排行奖牌：金、银、铜
    if (raw / 'medals.png').exists():
        for nm, im in zip(['1', '2', '3'], cut(raw / 'medals.png')):
            save(f'j_medal_{nm}', im.convert('RGBa').resize((round(im.width * 300 / im.height), 300), Image.LANCZOS).convert('RGBA'))

    # 收藏册封面：六个海域
    for i, im in enumerate(cut(raw / 'books.png')):
        save(f'j_book_{i + 1}', im.convert('RGBa').resize((420, round(im.height * 420 / im.width)), Image.LANCZOS).convert('RGBA'))

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
        # 出图里右边还有一个火焰圆章，没用上，不切
        b = cut_grid(raw / 'burst.png', 2, 1)[0]
        save('j_burst', scaled(b, 600 / b.width))

    # 局内零件：教学手指、挑战旗、锁链
    if (raw / 'misc.png').exists():
        finger, flag, chain, _dot = cut_grid(raw / 'misc.png', 2, 2)
        save('j_finger', scaled(finger, 330 / finger.height))
        save('j_flag', scaled(flag, 270 / flag.height))
        save('j_chain', scaled(chain, 450 / chain.width))
    # 气泡：黑底上出图，按亮度还原透明度（光是「加」上去的，里面全透明，高光和彩虹边都留住）
    if (raw / 'bubble.png').exists():
        save('j_bubble', light_on_black(raw / 'bubble.png', 480))

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


if __name__ == '__main__':
    main()
