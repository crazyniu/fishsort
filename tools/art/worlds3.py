"""第 13–18 个海域（2026-11-17，关卡加到 360 关）：出图需求和把 Codex 出的图做成游戏里的图。

- briefs：从 art/briefs/worlds3/roster.txt 写出图需求（art/briefs/worlds3/*.txt）、切图清单 list.json 和生物表 creatures.json。
  需求的措辞照搬第 7–12 个海域（art/briefs/worlds2），只换海域、生物和颜色。
- books：art/raw/worlds3/books.png（品红底、两行六本）→ client/assets/resources/ui/skin/j_book_13..18.png
- bgs：art/raw/worlds3/sea_<海域>.png → client/assets/resources/ui/bg/sea_<海域>.jpg
- creatures：art/raw/worlds3/<海域>_<稀有度>_<n>.png → art/source/fish/<id>.png（切图同 creatures.py）

用法：python tools/art/worlds3.py [briefs|books|bgs|creatures]（不给就做后三样）
出图：bash art/raw/worlds3/gen.sh（Codex，8 个并行）。生物切好以后照常：拷进 client/assets/resources/fish、
./run.sh art-compress、./run.sh meta、python tools/art/eyes.py。
"""
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
BRIEFS = REPO / 'art/briefs/worlds3'
OLD = REPO / 'art/briefs/worlds2'
RAW = REPO / 'art/raw/worlds3'
SEAS = ['blossom', 'market', 'cloud', 'pearl', 'clockwork', 'melody']
FIRST_BOOK = 13
# 第 13–18 个海域的编号从这里接着排（第 1–12 个海域用到 c120 / u181 / r108 / e60）
START = {'common': 121, 'uncommon': 182, 'rare': 109, 'epic': 61}
PREFIX = {'common': 'c', 'uncommon': 'u', 'rare': 'r', 'epic': 'e'}
# 每张图放几只：普通 5 + 5（前 8 只在局内出场）、精良 3 × 5、稀有 5 + 4、史诗 5
SHEETS = {'common': [5, 5], 'uncommon': [5, 5, 5], 'rare': [5, 4], 'epic': [5]}
HABITAT = {
    'blossom': 'a calm spring bay where cherry blossom petals drift down into the water',
    'market': 'a cozy undersea market street with shell stalls and paper lanterns',
    'cloud': 'a dreamy sea beneath floating cloud islands',
    'pearl': 'a calm bay full of giant clams, shells and glowing pearls',
    'clockwork': 'a sunken clockwork town with big brass gears and old clocks',
    'melody': 'a musical cove where giant conch shells hum soft songs',
}
SCENE = {
    'blossom': 'Scene: a calm spring bay. Water in muted soft teal-grey with a few faded pale pink petals drifting. Rounded rocks, soft rounded blossom-like coral trees in muted dusty rose and gentle seagrass at both sides and the bottom corners in muted dusty rose, sage green and warm grey; a pale beige sand floor between them.',
    'market': 'Scene: a cozy undersea market street. Water in muted blue-green. Rounded shell-shaped stalls with faded striped awnings and a few unlit paper lanterns on strings at both sides and the bottom corners in muted teal, dusty sand and soft brown; a pale sand path floor between them.',
    'cloud': 'Scene: a dreamy sea beneath floating islands. Water in muted soft sky blue. Fluffy rounded cloud-shaped coral puffs and smooth floating rock islands with soft hanging roots at both sides and the bottom corners in muted grey-white, powder blue and pale lilac; a soft pale blue-grey sand floor between them.',
    'pearl': 'Scene: a calm pearl bay. Water in muted aqua-teal. Big rounded giant clam shells slightly open with faint soft pearls inside, scattered smooth shells and gentle sea grass at both sides and the bottom corners in muted cream, dusty lavender and sand beige; a pale ivory sand floor between them.',
    'clockwork': 'Scene: a sunken clockwork town. Water in muted blue-grey. Big rounded brass gears, an old round clock tower and soft curved copper pipes with a little sea moss at both sides and the bottom corners in muted bronze, dusty copper and slate green; a grey-brown sand floor between them.',
    'melody': 'Scene: a musical cove. Water in muted soft indigo-teal with faint ripple rings. Giant smooth conch shells, coral shaped like soft organ pipes and gentle sea fans at both sides and the bottom corners in muted plum, dusty teal and warm sand; a pale sand floor between them.',
}
BOOKS = (
    '(1) light cherry-blossom pink cover with a cream inset and an emblem of a five-petal blossom flower; '
    '(2) warm tomato red cover with a cream inset and an emblem of a small market stall with a striped awning; '
    '(3) light sky blue cover with an emblem of a fluffy cloud above a small floating island; '
    '(4) pearly ivory cover with a soft lilac inset and an emblem of an open clam holding a round pearl; '
    '(5) warm brass bronze-brown cover with an emblem of two interlocking gears; '
    '(6) fresh mint green cover with an emblem of a conch shell with a music note above it.'
)


def roster() -> list:
    rows = []
    for line in (BRIEFS / 'roster.txt').read_text().splitlines():
        if not line.strip() or line.startswith('#'):
            continue
        f = line.split('|')
        rows.append({'sea': f[0], 'rarity': f[1], 'zh': f[2], 'en': f[3], 'desc': f[4], 'extra': f[5:]})
    return rows


def template(kind: str) -> str:
    """第 7–12 个海域同稀有度的需求，海域和生物换成占位符"""
    t = (OLD / f'vent_{kind}_1.txt').read_text().strip()
    t = t.replace('warm volcanic hydrothermal vents on the deep sea floor', '{habitat}')
    t = re.sub(r'Draw \d+ new', 'Draw {n} new', t)
    t = re.sub(r'The creatures: .*? One square image', 'The creatures: {list} One square image', t)
    return t


def briefs() -> None:
    rows = roster()
    ids = dict(START)
    lst: dict = {}
    table = []
    for sea in SEAS:
        for rarity, sizes in SHEETS.items():
            group = [r for r in rows if r['sea'] == sea and r['rarity'] == rarity]
            assert len(group) == sum(sizes), (sea, rarity, len(group))
            at = 0
            for n, size in enumerate(sizes, 1):
                items = []
                for r in group[at : at + size]:
                    cid = f'{PREFIX[rarity]}{ids[rarity]}'
                    ids[rarity] += 1
                    shape = r['extra'][1] if rarity == 'common' else 'special'
                    items.append([cid, r['zh'], r['en'], r['desc'], shape])
                    row = {'sea': sea, 'rarity': rarity, 'id': cid, 'zh': r['zh'], 'en': r['en'], 'desc': r['desc']}
                    if rarity == 'common':
                        row.update(hue=r['extra'][0], shape=r['extra'][1], inLevel=r['extra'][2] == 'in')
                    table.append(row)
                at += size
                name = f'{sea}_{rarity}_{n}'
                lst[name] = [HABITAT[sea], items, rarity]
                text = ' '.join(f'({i + 1}) {it[3]}.' for i, it in enumerate(items))
                brief = template(rarity).replace('{habitat}', HABITAT[sea]).replace('{n}', str(size)).replace('{list}', text)
                (BRIEFS / f'{name}.txt').write_text(brief + '\n')
        bg = (OLD / 'sea_starsea.txt').read_text().strip()
        bg = SCENE[sea] + bg[bg.index(' Background illustration') :]
        (BRIEFS / f'sea_{sea}.txt').write_text(bg + '\n')
    book = (OLD / 'books.txt').read_text().strip()
    book = re.sub(r'\(1\) .*?; \(6\) [^.]*\.', BOOKS, book)
    (BRIEFS / 'books.txt').write_text(book + '\n')
    (BRIEFS / 'list.json').write_text(json.dumps(lst, ensure_ascii=False, indent=1) + '\n')
    (BRIEFS / 'creatures.json').write_text(json.dumps(table, ensure_ascii=False, indent=1) + '\n')
    print('briefs', len(lst), 'sheets,', len(table), 'creatures; next ids', ids)


def books() -> None:
    import numpy as np
    from PIL import Image

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from creatures import blobs, key, strays

    sheet = key(Image.open(RAW / 'books.png'))
    bxs = blobs(sheet, 6)
    assert len(bxs) == 6, f'找到 {len(bxs)} 本'
    for i, b in enumerate(bxs):
        crop = strays(sheet.crop((max(0, b[0] - 4), max(0, b[1] - 4), b[2] + 4, b[3] + 4)))
        al = np.asarray(crop)[..., 3]
        ys, xs = np.nonzero(al > 8)
        crop = crop.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
        out = crop.resize((420, round(crop.height * 420 / crop.width)), Image.LANCZOS)
        out.save(REPO / f'client/assets/resources/ui/skin/j_book_{FIRST_BOOK + i}.png')
        print(f'j_book_{FIRST_BOOK + i}', out.size)


def bgs() -> None:
    from PIL import Image

    for s in SEAS:
        src = RAW / f'sea_{s}.png'
        if not src.exists():
            print('缺', src)
            continue
        im = Image.open(src).convert('RGB')
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
    from PIL import Image

    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from creatures import OUT, blobs, fit, key

    lst = json.loads((BRIEFS / 'list.json').read_text())
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
    if what == 'briefs':
        briefs()
    if what in ('books', 'all'):
        books()
    if what in ('bgs', 'all'):
        bgs()
    if what in ('creatures', 'all'):
        creatures()
