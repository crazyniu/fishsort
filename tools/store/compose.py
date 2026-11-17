"""上架图：Codex 出的插画加标题，裁成各商店要的尺寸（docs/06 第 7 节、docs/10）。

用法：python3 tools/store/compose.py
输入：art/raw/store/shot_1..5.png（竖版插画，store/gen.sh 出）、feature.png（横版）；标题在 store/captions.json。
输出：store/images/<商店>/<语言>/<序号>.png，每个尺寸 5 张：
  app_store_6.9   1320×2868（iPhone 6.9 英寸，App Store 必交）
  app_store_6.5   1284×2778（iPhone 6.5 英寸）
  google_play     1080×1920（手机，9:16）
  wechat          1080×1920（微信小游戏详情页的宣传图，只出中文）
  另有 google_play/<语言>/feature.png 1024×500（Google Play 的置顶大图）
标题用游戏的圆体（完整字库 art/raw/fonts/ResourceHanRoundedCN-Bold.ttf，没有就退回包里的子集字体），白字深蓝描边，
放在插画上面那段留空的水里；插画按「盖满」缩放后居中裁两边（出图时要求主体在中间六成宽里）。
"""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO = Path(__file__).resolve().parents[2]
RAW = REPO / 'art/raw/store'
OUT = REPO / 'store/images'
FULL_FONT = REPO / 'art/raw/fonts/ResourceHanRoundedCN-Bold.ttf'
GAME_FONT = REPO / 'client/assets/resources/fonts/round.ttf'
SIZES = {
    'app_store_6.9': (1320, 2868),
    'app_store_6.5': (1284, 2778),
    'google_play': (1080, 1920),
    'wechat': (1080, 1920),
}
LANGS = {'app_store_6.9': ['en', 'zh_CN'], 'app_store_6.5': ['en', 'zh_CN'], 'google_play': ['en', 'zh_CN'], 'wechat': ['zh_CN']}
INK = (16, 52, 120)


def font(px: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(FULL_FONT if FULL_FONT.exists() else GAME_FONT), px)


def cover(im: Image.Image, w: int, h: int, focus_y: float = 0.5) -> Image.Image:
    k = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = (im.width - w) // 2
    y = round((im.height - h) * focus_y)
    return im.crop((x, y, x + w, y + h))


def wrap(text: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    """按宽度折行：英文按词，中文按字"""
    words = text.split(' ') if ' ' in text else list(text)
    sep = ' ' if ' ' in text else ''
    lines: list[str] = []
    cur = ''
    for w in words:
        nxt = (cur + sep + w) if cur else w
        if f.getlength(nxt) <= max_w or not cur:
            cur = nxt
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def title(canvas: Image.Image, text: str, sub: str, top: int, size: int) -> None:
    """白字、深蓝粗描边、柔和的投影；两行以内，居中"""
    w = canvas.width
    f = font(size)
    lines = [l for part in text.split('\n') for l in wrap(part, f, int(w * 0.9))]
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    y = top
    stroke = max(6, size // 9)
    for line in lines:
        lw = f.getlength(line)
        d.text(((w - lw) / 2, y), line, font=f, fill=(255, 255, 255, 255), stroke_width=stroke, stroke_fill=INK + (255,))
        y += round(size * 1.18)
    if sub:
        fs = font(round(size * 0.46))
        sw = fs.getlength(sub)
        d.text(((w - sw) / 2, y + size * 0.1), sub, font=fs, fill=(255, 255, 255, 255), stroke_width=max(4, stroke // 2), stroke_fill=INK + (255,))
    shadow = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    shadow.paste((10, 30, 80, 110), mask=layer.split()[3])
    shadow = shadow.filter(ImageFilter.GaussianBlur(size // 10))
    canvas.alpha_composite(shadow, (0, size // 14))
    canvas.alpha_composite(layer)


def shots() -> None:
    caps = json.loads((REPO / 'store/captions.json').read_text())
    for store, (w, h) in SIZES.items():
        for lang in LANGS[store]:
            folder = OUT / store / lang
            folder.mkdir(parents=True, exist_ok=True)
            for i, cap in enumerate(caps['shots'], 1):
                art = Image.open(RAW / f'shot_{i}.png').convert('RGBA')
                # 插画上面四分之一是留给标题的空水；长屏让插画往下靠一点，标题区更高
                canvas = cover(art, w, h, focus_y=0.5)
                size = round(w * (0.105 if lang == 'zh_CN' else 0.092))
                title(canvas, cap[lang], cap.get(f'{lang}_sub', ''), round(h * 0.055), size)
                canvas.convert('RGB').save(folder / f'{i}.png', optimize=True)
            print(store, lang, len(caps['shots']))


def feature() -> None:
    caps = json.loads((REPO / 'store/captions.json').read_text())
    art = Image.open(RAW / 'feature.png').convert('RGBA')
    for lang in ['en', 'zh_CN']:
        canvas = cover(art, 1024, 500)
        # 左边留空的水里放游戏名
        f = font(78 if lang == 'zh_CN' else 70)
        name = caps['name'][lang]
        layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        lines = wrap(name, f, 420)
        y = 250 - len(lines) * 50
        for line in lines:
            d.text((60, y), line, font=f, fill=(255, 255, 255, 255), stroke_width=9, stroke_fill=INK + (255,))
            y += 96
        canvas.alpha_composite(layer)
        folder = OUT / 'google_play' / lang
        folder.mkdir(parents=True, exist_ok=True)
        canvas.convert('RGB').save(folder / 'feature.png', optimize=True)
    print('feature 2')


if __name__ == '__main__':
    shots()
    feature()
