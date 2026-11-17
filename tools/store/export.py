"""上架图导出：Codex 整张画好的宣传图（art/raw/store/posters/，store/gen.sh 出）→ 各商店要的尺寸（docs/10 第 6 节）。

用法：python3 tools/store/export.py
只做等比缩放和居中裁切，不往图上加任何东西（用户 2026-11-18：每张图都直接用 AI 生成，不要自己拼）。
出图时要求文字和主体都在中间 64% 宽里，所以裁掉两边不会切到字。
输出 store/images/<商店>/<语言>/<序号>.jpg（JPEG 质量 92）：
  app_store_6.9  1320×2868、app_store_6.5  1284×2778、google_play  1080×1920、wechat  1080×1920（只有中文）；
  google_play/<语言>/feature.jpg  1024×500。
"""
from pathlib import Path

from PIL import Image

REPO = Path(__file__).resolve().parents[2]
SRC = REPO / 'art/raw/store/posters'
OUT = REPO / 'store/images'
SIZES = {
    'app_store_6.9': (1320, 2868),
    'app_store_6.5': (1284, 2778),
    'google_play': (1080, 1920),
    'wechat': (1080, 1920),
}
LANGS = ['en', 'zh_CN']


def cover(im: Image.Image, w: int, h: int) -> Image.Image:
    k = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x = (im.width - w) // 2
    y = (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))


def main() -> None:
    for store, (w, h) in SIZES.items():
        for lang in LANGS:
            if store == 'wechat' and lang != 'zh_CN':
                continue
            folder = OUT / store / lang
            folder.mkdir(parents=True, exist_ok=True)
            n = 0
            for i in range(1, 6):
                src = SRC / f'shot_{i}_{lang}.png'
                if not src.exists():
                    print('缺', src)
                    continue
                cover(Image.open(src).convert('RGB'), w, h).save(folder / f'{i}.jpg', quality=92, optimize=True)
                n += 1
            print(store, lang, n)
    for lang in LANGS:
        src = SRC / f'feature_{lang}.png'
        if src.exists():
            folder = OUT / 'google_play' / lang
            folder.mkdir(parents=True, exist_ok=True)
            cover(Image.open(src).convert('RGB'), 1024, 500).save(folder / 'feature.jpg', quality=92, optimize=True)
            print('feature', lang)


if __name__ == '__main__':
    main()
