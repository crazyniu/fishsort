"""Codex 出的两张图做成游戏里的图（2026-11-17）：

1. 小卡框 art/raw/redesign/card_frames.png（品红底、一排五张：普通、精良、稀有、史诗、传说）
   → client/assets/resources/ui/skin/j_card_<稀有度>.png。奖品格、稀客小卡用：只有一个大窗口，没有名字白条
   （用户：奖品里的卡下面那条空白条不要，换成 AI 画的卡片）。窗口在卡上的位置（比例）打印出来，写进代码。
2. 洗牌图标 art/raw/redesign/skill_shuffle.png（透明底）→ client/assets/resources/ui/icon/skill_shuffle.png，
   384×384，长边 358，和另外三个技能图标一样大（原来是两根交叉的直箭头，像个叉，用户要改）。

用法：python tools/art/cards_icons.py
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from creatures import blobs, key, strays  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
RAW = REPO / 'art/raw/redesign'
SKIN = REPO / 'client/assets/resources/ui/skin'
ICON = REPO / 'client/assets/resources/ui/icon'
RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legend']
CARD_W = 360


def window(im: Image.Image) -> tuple:
    """卡中间那块浅色窗口：从中心往四个方向走，走到颜色明显变了为止。返回 (左, 上, 右, 下) 占卡宽高的比例"""
    a = np.asarray(im.convert('RGBA')).astype(np.float32)
    h, w = a.shape[:2]
    cy, cx = h // 2, w // 2
    c = a[cy, cx, :3]

    def walk(dy: int, dx: int) -> int:
        y, x = cy, cx
        while 0 < y < h - 1 and 0 < x < w - 1 and np.abs(a[y + dy, x + dx, :3] - c).sum() < 60:
            y += dy
            x += dx
        return y if dy else x

    return (walk(0, -1) / w, walk(-1, 0) / h, walk(0, 1) / w, walk(1, 0) / h)


def cards() -> None:
    sheet = key(Image.open(RAW / 'card_frames.png'))
    bxs = blobs(sheet, 5)
    assert len(bxs) == 5, f'找到 {len(bxs)} 张卡'
    for rar, b in zip(RARITIES, sorted(bxs, key=lambda b: b[0])):
        crop = strays(sheet.crop((max(0, b[0] - 4), max(0, b[1] - 4), b[2] + 4, b[3] + 4)))
        al = np.asarray(crop)[..., 3]
        ys, xs = np.nonzero(al > 8)
        crop = crop.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
        out = crop.resize((CARD_W, round(crop.height * CARD_W / crop.width)), Image.LANCZOS)
        out.save(SKIN / f'j_card_{rar}.png')
        l, t, r, btm = window(out)
        print(f'j_card_{rar}: {out.size}  窗口 左 {l:.3f} 上 {t:.3f} 右 {r:.3f} 下 {btm:.3f}')


def shuffle() -> None:
    im = strays(Image.open(RAW / 'skill_shuffle.png').convert('RGBA'))
    # 透明底的图边上还有几粒散的红点：只留最大的那一块（strays 只去贴着边的）
    a = np.asarray(im).copy()
    mask = a[..., 3] > 8
    small = mask[::4, ::4]
    from collections import deque
    h, w = small.shape
    lab = np.zeros((h, w), np.int32)
    sizes = {}
    k = 0
    for y in range(h):
        for x in range(w):
            if small[y, x] and not lab[y, x]:
                k += 1
                q = deque([(y, x)])
                lab[y, x] = k
                n = 0
                while q:
                    cy, cx = q.popleft()
                    n += 1
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not lab[ny, nx]:
                                lab[ny, nx] = k
                                q.append((ny, nx))
                sizes[k] = n
    keep = max(sizes, key=sizes.get)
    big = np.kron(lab == keep, np.ones((4, 4), bool))[: a.shape[0], : a.shape[1]]
    # 主体周围留 2 格（8 像素）的边，抗锯齿的边不切掉
    grow = big.copy()
    for _ in range(2):
        g = grow.copy()
        g[1:] |= grow[:-1]
        g[:-1] |= grow[1:]
        g[:, 1:] |= grow[:, :-1]
        g[:, :-1] |= grow[:, 1:]
        grow = g
    a[~grow, 3] = 0
    im = Image.fromarray(a, 'RGBA')
    ys, xs = np.nonzero(a[..., 3] > 8)
    im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    s = 358 / max(im.size)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.LANCZOS)
    out = Image.new('RGBA', (384, 384), (0, 0, 0, 0))
    out.paste(im, ((384 - im.width) // 2, (384 - im.height) // 2))
    out.save(ICON / 'skill_shuffle.png')
    print('skill_shuffle:', im.size)


if __name__ == '__main__':
    cards()
    shuffle()
