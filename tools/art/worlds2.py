"""第 7–12 个海域（2026-11-17，关卡加到 240 关）：把 Codex 出的图做成游戏里的图。

- art/raw/worlds2/books.png（品红底、两行六本）→ client/assets/resources/ui/skin/j_book_7..12.png（宽 420，和前六本一样）
- art/raw/worlds2/sea_<海域>.png → client/assets/resources/ui/bg/sea_<海域>.jpg（1024×1536，JPG 质量 86）
- art/raw/worlds2/<海域>_<稀有度>_<n>.png → art/source/fish/<id>.png（切图同 creatures.py，清单 art/briefs/worlds2/list.json）

用法：python tools/art/worlds2.py [books|bgs|creatures]（不给就全做）
生物切好以后照常：拷进 client/assets/resources/fish、./run.sh art-compress、./run.sh meta、python tools/art/eyes.py。
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from creatures import OUT, blobs, fit, key, strays  # noqa: E402

REPO = Path(__file__).resolve().parents[2]
RAW = REPO / 'art/raw/worlds2'
SEAS = ['mangrove', 'lagoon', 'vent', 'ruins', 'trench', 'starsea']


def books() -> None:
    sheet = key(Image.open(RAW / 'books.png'))
    bxs = blobs(sheet, 6)
    assert len(bxs) == 6, f'找到 {len(bxs)} 本'
    for i, b in enumerate(bxs):
        crop = strays(sheet.crop((max(0, b[0] - 4), max(0, b[1] - 4), b[2] + 4, b[3] + 4)))
        al = np.asarray(crop)[..., 3]
        ys, xs = np.nonzero(al > 8)
        crop = crop.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
        out = crop.resize((420, round(crop.height * 420 / crop.width)), Image.LANCZOS)
        out.save(REPO / f'client/assets/resources/ui/skin/j_book_{7 + i}.png')
        print(f'j_book_{7 + i}', out.size)


def bgs() -> None:
    for s in SEAS:
        src = RAW / f'sea_{s}.png'
        if not src.exists():
            print('缺', src)
            continue
        im = Image.open(src).convert('RGB')
        # 竖版 2:3，宽不够就按高裁中间
        w, h = im.size
        if abs(w / h - 2 / 3) > 0.01:
            nw = round(h * 2 / 3)
            if nw <= w:
                im = im.crop(((w - nw) // 2, 0, (w - nw) // 2 + nw, h))
            else:
                nh = round(w * 3 / 2)
                im = im.crop((0, (h - nh) // 2, w, (h - nh) // 2 + nh))
        im = im.resize((1024, 1536), Image.LANCZOS)
        im.save(REPO / f'client/assets/resources/ui/bg/sea_{s}.jpg', quality=86, optimize=True, progressive=True)
        print('sea', s)


def creatures() -> None:
    lst = json.loads((REPO / 'art/briefs/worlds2/list.json').read_text())
    OUT.mkdir(parents=True, exist_ok=True)
    for name, entry in lst.items():
        src = RAW / f'{name}.png'
        if not src.exists():
            print('缺', src)
            continue
        items = entry[1]
        sheet = key(Image.open(src))
        bxs = blobs(sheet, len(items))
        if len(bxs) != len(items):
            print(f'✗ {name}: 找到 {len(bxs)} 只，要 {len(items)} 只')
            continue
        for (cid, *_r), b in zip(items, bxs):
            crop = sheet.crop((max(0, b[0] - 6), max(0, b[1] - 6), min(sheet.width, b[2] + 6), min(sheet.height, b[3] + 6)))
            fit(crop).save(OUT / f'{cid}.png')
        print(name, len(items))


if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'all'
    if what in ('books', 'all'):
        books()
    if what in ('bgs', 'all'):
        bgs()
    if what in ('creatures', 'all'):
        creatures()
