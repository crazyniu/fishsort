"""找每只生物的眼睛在哪（眨眼动画用），写到 client/assets/resources/config/fish_eyes.json。

用法：python tools/art/eyes.py [--sheet 对照图.png]
生物图都是 192×192、大眼睛：深色的圆形瞳孔，里面有白色高光。按这个找：
- 深色（亮度低）的连通块，面积在一定范围里、外接框接近正方形、填得比较满（描边是细长的、嘴是细线，都会被排除）；
- 块里或紧挨着有白色高光；
- 最多取两只，两只大小要差不多。
每只眼睛记外接框（以图中心为原点、y 向上，单位是图的像素）和眼皮颜色（眼睛正上方一圈皮肤的颜色）。
找不到眼睛的生物不写，游戏里就不眨眼。--sheet 出一张标了框的对照图，人工看一遍。
"""
import json
import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
# 自动找不到的（瞳孔不是深色的：青色、灰蓝色），手量的眼睛外接框，图上的像素坐标 (x0, y0, x1, y1)。重跑时照样写进去
MANUAL = {
    'e16': [(49, 59, 73, 85)],  # 极光母：青色大眼睛（眼睛上方是星空花纹，眼皮颜色另取，见 LID）
    'u69': [(42, 94, 64, 118)],  # 睡鲨鲨：灰蓝色眼睛
}
# 眼睛上方不是皮肤（花纹、头饰）时，手取的眼皮颜色
LID = {
    'e16': '#B58AFA',  # 眼睛旁边的淡紫色皮肤
}
SRC = REPO / 'client/assets/resources/fish'
OUT = REPO / 'client/assets/resources/config/fish_eyes.json'


def blobs(mask: np.ndarray) -> list:
    h, w = mask.shape
    seen = np.zeros_like(mask)
    out = []
    for y in range(h):
        for x in range(w):
            if not mask[y, x] or seen[y, x]:
                continue
            q = deque([(y, x)])
            seen[y, x] = True
            pts = []
            while q:
                cy, cx = q.popleft()
                pts.append((cy, cx))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            out.append(pts)
    return out


def find(path: Path):
    a = np.asarray(Image.open(path).convert('RGBA')).astype(np.float32) / 255.0
    rgb, al = a[..., :3], a[..., 3]
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    white = (lum > 0.88) & (al > 0.5)
    # 瞳孔 = 深色 + 高光：先把高光也算进去（高光会把瞳孔切成几块）
    dark = (lum < 0.28) & (al > 0.6)
    eye = dark | white
    h, w = lum.shape
    cands = []
    for pts in blobs(dark):
        n = len(pts)
        if n < 25 or n > 1600:
            continue
        ys = [p[0] for p in pts]
        xs = [p[1] for p in pts]
        y0, y1, x0, x1 = min(ys), max(ys), min(xs), max(xs)
        bw, bh = x1 - x0 + 1, y1 - y0 + 1
        if bw < 6 or bh < 6 or bw > 60 or bh > 60:
            continue
        if not (0.55 <= bw / bh <= 1.8):
            continue
        # 框里（含高光）填得满：描边、嘴这种细线填不满
        box = eye[y0:y1 + 1, x0:x1 + 1]
        if box.mean() < 0.62:
            continue
        # 要有白色高光
        gy0, gy1, gx0, gx1 = max(0, y0 - 2), min(h, y1 + 3), max(0, x0 - 2), min(w, x1 + 3)
        if white[gy0:gy1, gx0:gx1].sum() < 3:
            continue
        cands.append((n, x0, y0, x1, y1))
    cands.sort(reverse=True)
    if not cands:
        return None
    eyes = [cands[0]]
    for c in cands[1:]:
        if c[0] >= cands[0][0] * 0.35 and len(eyes) < 2:
            # 两只眼睛高度差不多
            if abs((c[2] + c[4]) / 2 - (eyes[0][2] + eyes[0][4]) / 2) < 30:
                eyes.append(c)
    return describe(a, [(x0, y0, x1, y1) for _n, x0, y0, x1, y1 in eyes])


def describe(a: np.ndarray, boxes) -> list:
    """每只眼睛：中心（图中心为原点、y 向上）、宽高、眼皮颜色"""
    rgb, al = a[..., :3], a[..., 3]
    h, w = al.shape
    res = []
    for x0, y0, x1, y1 in boxes:
        # 眼皮颜色：眼睛正上方 3–8 像素那一圈、不透明也不深的像素取中位数
        ys0, ys1 = max(0, y0 - 9), max(0, y0 - 2)
        patch = a[ys0:ys1, x0:x1 + 1].reshape(-1, 4)
        ok = patch[(patch[:, 3] > 0.8) & ((patch[:, :3] @ np.array([0.299, 0.587, 0.114])) > 0.3)]
        col = np.median(ok[:, :3], axis=0) if len(ok) >= 3 else np.median(rgb[al > 0.8], axis=0)
        cx, cy = (x0 + x1 + 1) / 2 - w / 2, h / 2 - (y0 + y1 + 1) / 2
        res.append({'x': round(cx, 1), 'y': round(cy, 1), 'w': x1 - x0 + 1, 'h': y1 - y0 + 1, 'lid': '#%02X%02X%02X' % tuple(int(v * 255 + 0.5) for v in col)})
    return res


def main() -> None:
    out = {}
    for p in sorted(SRC.glob('*.png')):
        if p.stem in MANUAL:
            a = np.asarray(Image.open(p).convert('RGBA')).astype(np.float32) / 255.0
            out[p.stem] = describe(a, MANUAL[p.stem])
            if p.stem in LID:
                for e in out[p.stem]:
                    e['lid'] = LID[p.stem]
            continue
        e = find(p)
        if e:
            out[p.stem] = e
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n')
    total = len(list(SRC.glob('*.png')))
    print(f'找到眼睛 {len(out)} / {total}；没找到：', ' '.join(p.stem for p in sorted(SRC.glob('*.png')) if p.stem not in out))
    if '--sheet' in sys.argv:
        dst = Path(sys.argv[sys.argv.index('--sheet') + 1])
        ids = [p.stem for p in sorted(SRC.glob('*.png'))]
        W, cols = 128, 20
        rows = (len(ids) + cols - 1) // cols
        s = Image.new('RGBA', (W * cols, W * rows), (40, 90, 150, 255))
        d = ImageDraw.Draw(s)
        for i, k in enumerate(ids):
            im = Image.open(SRC / f'{k}.png').convert('RGBA').resize((W, W))
            ox, oy = (i % cols) * W, (i // cols) * W
            s.alpha_composite(im, (ox, oy))
            for e in out.get(k, []):
                f = W / 192
                x0 = ox + (e['x'] + 96 - e['w'] / 2) * f
                y0 = oy + (96 - e['y'] - e['h'] / 2) * f
                d.rectangle([x0, y0, x0 + e['w'] * f, y0 + e['h'] * f], outline=(255, 60, 60, 255), width=2)
        s.convert('RGB').save(dst, quality=85)


if __name__ == '__main__':
    main()
