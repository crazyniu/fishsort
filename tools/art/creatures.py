"""把 Codex 出的品红底生物图切成一张一只，放到 art/source/fish/（第二批局内生物 c31–c60、第三批精良以上的卡）。

用法：python tools/art/creatures.py [原图目录] [清单 list.json]（默认 art/raw/creatures2 与 art/briefs/creatures2/list.json）
清单：{图名: [海域描述, [[id, 中文名, 英文名, 描述, 轮廓], …], …]}，每张图里从左到右、从上到下是哪几只。
第三批（精良 / 稀有 / 史诗 140 张卡）：art/raw/cards3 与 art/briefs/cards3/list.json。

抠图不按「品红度」算透明（粉色、半透明粉的生物里面会被抠穿），而是从图边泛洪：和底色接近、又连着图边的才是底；
生物都有一圈深色描边，泛洪进不去。描边外侧一两像素按品红度算半透明，再把混进去的品红减掉。
每只裁到外接矩形，等比缩到长边 187、放进 192×192 的正中（和现有 60 只一样的留边）。
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'art/source/fish'
SIZE = 192
FILL = 187


def key(src: Image.Image) -> Image.Image:
    a = np.asarray(src.convert('RGB')).astype(np.float32) / 255.0
    h, w, _ = a.shape
    corners = np.concatenate([a[:8, :8].reshape(-1, 3), a[:8, -8:].reshape(-1, 3), a[-8:, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)])
    bg = np.median(corners, axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(-1))
    near = dist < 0.35
    # 从四条边泛洪
    seen = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if near[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if near[y, x] and not seen[y, x]:
                seen[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and near[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                q.append((ny, nx))
    # 几乎就是底色的封闭小块（卷起来的身体中间）也算底
    bgmask = seen | (dist < 0.12)
    # 底的边上一圈按品红度给半透明
    m0 = min(bg[0], bg[2]) - bg[1]
    mag = np.clip((np.minimum(a[..., 0], a[..., 2]) - a[..., 1]) / (m0 * 0.85), 0, 1)
    edge = np.zeros_like(bgmask)
    for dy in (-2, -1, 0, 1, 2):
        for dx in (-2, -1, 0, 1, 2):
            edge |= np.roll(np.roll(bgmask, dy, 0), dx, 1)
    alpha = np.where(bgmask, 0.0, np.where(edge, 1.0 - mag, 1.0))
    a3 = np.clip(alpha, 0.02, 1.0)[..., None]
    col = np.clip((a - (1.0 - a3) * bg) / a3, 0.0, 1.0)
    return Image.fromarray(np.clip(np.dstack([col, alpha]) * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA')


def blobs(im: Image.Image, n: int) -> list:
    """不透明区域按连通块分开，取最大的 n 块（按先上后下、先左后右排）"""
    al = np.asarray(im)[..., 3] > 40
    small = al[::4, ::4]
    # 先膨胀几格：触须、细腿和身体断开时并进同一块
    grow = small.copy()
    for _ in range(1):
        g = grow.copy()
        g[1:] |= grow[:-1]
        g[:-1] |= grow[1:]
        g[:, 1:] |= grow[:, :-1]
        g[:, :-1] |= grow[:, 1:]
        grow = g
    small = grow
    h, w = small.shape
    lab = np.zeros((h, w), np.int32)
    boxes = []
    cur = 0
    for y in range(h):
        for x in range(w):
            if small[y, x] and not lab[y, x]:
                cur += 1
                q = deque([(y, x)])
                lab[y, x] = cur
                x0 = x1 = x
                y0 = y1 = y
                cnt = 0
                while q:
                    cy, cx = q.popleft()
                    cnt += 1
                    x0, x1, y0, y1 = min(x0, cx), max(x1, cx), min(y0, cy), max(y1, cy)
                    for dy in (-1, 0, 1):
                        for dx in (-1, 0, 1):
                            ny, nx = cy + dy, cx + dx
                            if 0 <= ny < h and 0 <= nx < w and small[ny, nx] and not lab[ny, nx]:
                                lab[ny, nx] = cur
                                q.append((ny, nx))
                boxes.append((cnt, x0 * 4, y0 * 4, (x1 + 1) * 4, (y1 + 1) * 4))
    boxes.sort(reverse=True)
    big = [b[1:] for b in boxes[:n]]
    # 分行：中心 y 相差不到图高的 1/6 算同一行
    big.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows, row = [], []
    for b in big:
        if row and (b[1] + b[3]) / 2 - (row[0][1] + row[0][3]) / 2 > im.height / 6:
            rows.append(row)
            row = []
        row.append(b)
    rows.append(row)
    return [b for r in rows for b in sorted(r, key=lambda b: b[0])]


def strays(im: Image.Image) -> Image.Image:
    """裁出来的框里挨着框边的小碎块（旁边那只的一角）去掉"""
    arr = np.asarray(im).copy()
    al = arr[..., 3] > 8
    h, w = al.shape
    lab = np.zeros((h, w), np.int32)
    parts = []
    for y in range(h):
        for x in range(w):
            if al[y, x] and not lab[y, x]:
                k = len(parts) + 1
                lab[y, x] = k
                q = deque([(y, x)])
                pts = []
                edge = False
                while q:
                    cy, cx = q.popleft()
                    pts.append((cy, cx))
                    edge |= cy in (0, h - 1) or cx in (0, w - 1)
                    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        ny, nx = cy + dy, cx + dx
                        if 0 <= ny < h and 0 <= nx < w and al[ny, nx] and not lab[ny, nx]:
                            lab[ny, nx] = k
                            q.append((ny, nx))
                parts.append((len(pts), edge, pts))
    total = sum(p[0] for p in parts)
    biggest = max((p[0] for p in parts), default=0)
    # 挨着框边、又比主体小得多的块：是旁边那只伸进来的（2026-11-17：火山神蟹左边带进了邻居的鳍和钳子）
    for n, edge, pts in parts:
        if edge and (n < total * 0.01 or n < biggest * 0.15):
            for y, x in pts:
                arr[y, x, 3] = 0
    return Image.fromarray(arr, 'RGBA')


def fit(im: Image.Image) -> Image.Image:
    im = strays(im)
    al = np.asarray(im)[..., 3]
    ys, xs = np.nonzero(al > 8)
    im = im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    s = FILL / max(im.size)
    # 预乘后缩放，边上不出深色描边
    arr = np.asarray(im).astype(np.float32) / 255.0
    pre = arr.copy()
    pre[..., :3] *= pre[..., 3:4]
    pim = Image.fromarray((pre * 255 + 0.5).astype(np.uint8), 'RGBA')
    nw, nh = max(1, round(im.width * s)), max(1, round(im.height * s))
    pim = pim.resize((nw, nh), Image.LANCZOS)
    p = np.asarray(pim).astype(np.float32) / 255.0
    a = np.clip(p[..., 3:4], 1e-4, 1)
    p[..., :3] = np.where(p[..., 3:4] > 0, np.clip(p[..., :3] / a, 0, 1), 0)
    small = Image.fromarray((p * 255 + 0.5).astype(np.uint8), 'RGBA')
    out = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
    out.paste(small, ((SIZE - nw) // 2, (SIZE - nh) // 2))
    return out


def main() -> None:
    raw = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / 'art/raw/creatures2'
    lst_path = Path(sys.argv[2]) if len(sys.argv) > 2 else REPO / 'art/briefs/creatures2/list.json'
    lst = json.loads(lst_path.read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for sheet_name, entry in lst.items():
        items = entry[1]
        sheet = key(Image.open(raw / f'{sheet_name}.png'))
        bxs = blobs(sheet, len(items))
        assert len(bxs) == len(items), f'{sheet_name}: 找到 {len(bxs)} 只'
        for (cid, *_rest), b in zip(items, bxs):
            pad = 6
            crop = sheet.crop((max(0, b[0] - pad), max(0, b[1] - pad), min(sheet.width, b[2] + pad), min(sheet.height, b[3] + pad)))
            fit(crop).save(OUT / f'{cid}.png')
            print(cid, sheet_name, b)


if __name__ == '__main__':
    main()
