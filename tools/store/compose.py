"""上架图：Codex 出的插画 + 游戏风的标题排版，裁成各商店要的尺寸（docs/10 第 6 节、docs/06 第 7 节）。

用法：python3 tools/store/compose.py [语言…]
输入：art/raw/store/shot_1..5.png（竖版插画）、feature.png（横版），store/gen.sh 让 Codex 出；
      装饰件 store/kit/*.png（缎带、星形徽章、标题底板、闪光，也是 Codex 画的空白件，store/briefs/kit.txt）；
      文字 store/captions.json（语言按里面的 langs 来，现在是英文和简体中文；加语言只要补一套文字，韩文要另配字库）。
输出：store/images/<商店>/<语言>/<序号>.jpg（JPEG 质量 92）：
  app_store_6.9  1320×2868、app_store_6.5  1284×2778、google_play  1080×1920、wechat  1080×1920（只出中文），各 5 张；
  google_play/<语言>/feature.jpg  1024×500（Google Play 的置顶大图）。

排版（用户 2026-11-18：要像爆款游戏的宣传图，不是普通的字配图）：
- 标题是游戏风的立体艺术字：黄到橙的竖向渐变、上半截高光、深蓝粗描边、往下压的厚度和投影，整体微微倾斜；
- 副标题写在珊瑚色缎带上；有卖点的那几张加一枚金色星形徽章（免费、360 关）；标题旁边撒几颗闪光；
- 文字都由代码排（多语言不会错字），插画和装饰件里不带字。
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

REPO = Path(__file__).resolve().parents[2]
RAW = REPO / 'art/raw/store'
KIT = REPO / 'store/kit'
OUT = REPO / 'store/images'
FONTS = {
    'default': REPO / 'art/raw/fonts/ResourceHanRoundedCN-Bold.ttf',
    'ko': REPO / 'art/raw/fonts/ResourceHanRoundedKR-Bold.ttf',
}
GAME_FONT = REPO / 'client/assets/resources/fonts/round.ttf'
SIZES = {
    'app_store_6.9': (1320, 2868),
    'app_store_6.5': (1284, 2778),
    'google_play': (1080, 1920),
    'wechat': (1080, 1920),
}
NAVY = (13, 42, 104)
GOLD_TOP = (255, 252, 214)
GOLD_MID = (255, 226, 76)
GOLD_BOTTOM = (255, 150, 28)


def font(px: int, lang: str) -> ImageFont.FreeTypeFont:
    path = FONTS.get(lang[:2], FONTS['default'])
    if not path.exists():
        path = FONTS['default'] if FONTS['default'].exists() else GAME_FONT
    return ImageFont.truetype(str(path), px)


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    k = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = (im.width - w) // 2
    y = (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def wrap(text: str, f: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    """\\n 是手动换行；每一段再按宽度折：有空格的按词，没空格的（中日文）按字"""
    out: list[str] = []
    for part in text.split('\n'):
        words = part.split(' ') if ' ' in part else list(part)
        sep = ' ' if ' ' in part else ''
        cur = ''
        for w in words:
            nxt = (cur + sep + w) if cur else w
            if f.getlength(nxt) <= max_w or not cur:
                cur = nxt
            else:
                out.append(cur)
                cur = w
        if cur:
            out.append(cur)
    return out


def text_mask(lines: list[str], f: ImageFont.FreeTypeFont, line_h: int, width: int, stroke: int) -> Image.Image:
    """白字（L 模式），每行居中；stroke > 0 时是加粗描边后的外形"""
    pad = 24
    h = line_h * len(lines) + pad * 2 + line_h // 3
    m = Image.new('L', (width, h), 0)
    d = ImageDraw.Draw(m)
    y = pad
    for line in lines:
        lw = f.getlength(line)
        d.text(((width - lw) / 2, y), line, font=f, fill=255, stroke_width=stroke, stroke_fill=255)
        y += line_h
    return m


def gradient(size: tuple[int, int], stops: list[tuple[float, tuple[int, int, int]]]) -> Image.Image:
    w, h = size
    g = Image.new('RGB', (1, h))
    for y in range(h):
        t = y / max(1, h - 1)
        for i in range(len(stops) - 1):
            (t0, c0), (t1, c1) = stops[i], stops[i + 1]
            if t0 <= t <= t1:
                k = (t - t0) / max(1e-6, t1 - t0)
                g.putpixel((0, y), tuple(round(c0[j] + (c1[j] - c0[j]) * k) for j in range(3)))
                break
    return g.resize((w, h))


def game_title(text: str, lang: str, width: int, size: int, tilt: float = -3.0) -> Image.Image:
    """游戏风的立体标题，返回 RGBA 图（透明底）"""
    f = font(size, lang)
    lines = wrap(text, f, int(width * 0.88))
    line_h = round(size * 1.12)
    stroke = max(8, size // 7)
    depth = max(6, size // 11)
    fill = text_mask(lines, f, line_h, width, 0)
    outline = text_mask(lines, f, line_h, width, stroke)
    w, h = outline.size
    canvas = Image.new('RGBA', (w, h + depth * 2), (0, 0, 0, 0))
    # 投影
    shadow = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    shadow.paste((5, 20, 60, 150), (0, depth + size // 10), outline)
    canvas.alpha_composite(shadow.filter(ImageFilter.GaussianBlur(size // 12)))
    # 厚度：深蓝描边往下压几层
    shade = tuple(max(0, c - 22) for c in NAVY) + (255,)
    for i in range(depth, 0, -1):
        layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
        layer.paste(shade, (0, i), outline)
        canvas.alpha_composite(layer)
    # 描边
    layer = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    layer.paste(NAVY + (255,), (0, 0), outline)
    canvas.alpha_composite(layer)
    # 字身：渐变
    body = gradient((w, h), [(0.0, GOLD_TOP), (0.38, GOLD_MID), (1.0, GOLD_BOTTOM)]).convert('RGBA')
    body.putalpha(fill)
    full = Image.new('RGBA', canvas.size, (0, 0, 0, 0))
    full.paste(body, (0, 0))
    canvas.alpha_composite(full)
    # 高光：每行上半截再亮一点
    hl = Image.new('L', (w, h), 0)
    d = ImageDraw.Draw(hl)
    for i in range(len(lines)):
        top = 24 + i * line_h
        d.rectangle([0, top, w, top + round(size * 0.40)], fill=110)
    hl = ImageChops.multiply(hl, fill)
    shine = Image.new('RGBA', canvas.size, (255, 255, 255, 0))
    a = Image.new('L', canvas.size, 0)
    a.paste(hl, (0, 0))
    shine.putalpha(a)
    canvas.alpha_composite(shine)
    out = canvas.rotate(tilt, resample=Image.BICUBIC, expand=True)
    return out.crop(out.getbbox())


def ribbon(text: str, lang: str, width: int) -> Image.Image:
    """珊瑚色缎带 + 白字（深红描边）"""
    kit = Image.open(KIT / 'ribbon.png').convert('RGBA')
    rw = width
    rh = round(kit.height * rw / kit.width)
    rib = kit.resize((rw, rh), Image.LANCZOS)
    # 字放在缎带中间那段（两头折进去的尾巴不放字）
    band_w = int(rw * 0.70)
    size = round(rh * 0.30)
    f = font(size, lang)
    while f.getlength(text) > band_w and size > 18:
        size -= 2
        f = font(size, lang)
    d = ImageDraw.Draw(rib)
    tw = f.getlength(text)
    d.text(((rw - tw) / 2, rh * 0.36 - size / 2), text, font=f, fill=(255, 255, 255), stroke_width=max(3, size // 9), stroke_fill=(150, 30, 50))
    return rib


def badge(big: str, small: str, lang: str, size: int) -> Image.Image:
    """金色星形徽章：上面一个大字（数字或 FREE），下面一行小字"""
    b = Image.open(KIT / 'badge.png').convert('RGBA').resize((size, size), Image.LANCZOS)
    d = ImageDraw.Draw(b)
    fb = font(round(size * (0.30 if len(big) <= 3 else 0.20)), lang)
    bw = fb.getlength(big)
    y = size * (0.25 if small else 0.33)
    d.text(((size - bw) / 2, y), big, font=fb, fill=(226, 58, 38), stroke_width=max(4, size // 40), stroke_fill=(255, 255, 255))
    if small:
        fs = font(round(size * 0.12), lang)
        sw = fs.getlength(small)
        d.text(((size - sw) / 2, size * 0.60), small, font=fs, fill=(150, 60, 0))
    return b.rotate(12, resample=Image.BICUBIC, expand=True)


def sparkles(size: int) -> Image.Image:
    s = Image.open(KIT / 'sparkles.png').convert('RGBA')
    return s.resize((size, round(s.height * size / s.width)), Image.LANCZOS)


def shot(art: Image.Image, cap: dict, lang: str, w: int, h: int) -> Image.Image:
    # 插画整体往下挪一截，给标题和缎带让出地方（插画上面是空的水，挪下来的空当用最上面一条水面拉长补上；底下的沙地少一截）
    full = cover(art, w, h)
    off = round(h * 0.07)
    canvas = Image.new('RGBA', (w, h))
    canvas.paste(full.crop((0, 0, w, h - off)), (0, off))
    canvas.paste(full.crop((0, 0, w, max(1, off // 3))).resize((w, off), Image.BICUBIC), (0, 0))
    # 标题区上面压一层淡淡的深蓝，让金字更跳
    vh = round(h * 0.34)
    veil = Image.new('RGBA', (w, vh), (0, 30, 80, 0))
    veil.putalpha(gradient((w, vh), [(0.0, (120, 120, 120)), (1.0, (0, 0, 0))]).convert('L'))
    canvas.alpha_composite(veil)
    title = game_title(cap['title'], lang, w, round(w * (0.118 if lang == 'zh_CN' else 0.102)))
    ty = round(h * 0.04)
    canvas.alpha_composite(title, ((w - title.width) // 2, ty))
    y = ty + title.height - round(w * 0.015)
    if cap.get('ribbon'):
        rib = ribbon(cap['ribbon'], lang, round(w * 0.96))
        canvas.alpha_composite(rib, ((w - rib.width) // 2, y))
    sp = sparkles(round(w * 0.2))
    canvas.alpha_composite(sp, (w - sp.width - round(w * 0.01), max(0, ty - round(w * 0.04))))
    canvas.alpha_composite(sp.transpose(Image.FLIP_LEFT_RIGHT), (round(w * 0.01), ty + title.height // 2))
    if cap.get('badge'):
        bd = badge(cap['badge'][0], cap['badge'][1], lang, round(w * 0.30))
        canvas.alpha_composite(bd, (w - bd.width - round(w * 0.01), round(h * 0.885) - bd.height // 2))
    return canvas


def main() -> None:
    caps = json.loads((REPO / 'store/captions.json').read_text())
    langs = [l for l in caps['langs'] if not sys.argv[1:] or l in sys.argv[1:]]
    for store, (w, h) in SIZES.items():
        for lang in langs:
            if store == 'wechat' and lang != 'zh_CN':
                continue
            folder = OUT / store / lang
            folder.mkdir(parents=True, exist_ok=True)
            for i, c in enumerate(caps['shots'], 1):
                art = Image.open(RAW / f'shot_{i}.png').convert('RGBA')
                shot(art, c[lang], lang, w, h).convert('RGB').save(folder / f'{i}.jpg', quality=92, optimize=True)
            print(store, lang)
    # Google Play 置顶大图：左边游戏名（同样的艺术字）+ 缎带
    art = Image.open(RAW / 'feature.png').convert('RGBA')
    for lang in langs:
        canvas = cover(art, 1024, 500)
        name = game_title(caps['name'][lang], lang, 520, 96 if lang == 'zh_CN' else 78, tilt=-4)
        canvas.alpha_composite(name, (max(0, 250 - name.width // 2), 190 - name.height // 2))
        rib = ribbon(caps['feature'][lang], lang, 480)
        canvas.alpha_composite(rib, (10, 190 + name.height // 2 - 10))
        folder = OUT / 'google_play' / lang
        folder.mkdir(parents=True, exist_ok=True)
        canvas.convert('RGB').save(folder / 'feature.jpg', quality=92, optimize=True)
    print('feature', len(langs))


if __name__ == '__main__':
    main()
