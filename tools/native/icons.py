"""应用图标和启动画面（docs/10-开发底座.md）：从一张 1024 的方形图标和一张竖版背景生成各平台要的尺寸，结果进仓库。

用法：python3 tools/native/icons.py [图标.png] [背景.jpg]
  默认图标 art/approved/logo/logo_1024.png，背景 client/assets/resources/ui/bg/home.jpg。换了图标再跑一次。

- iOS：native/engine/ios/Images.xcassets/AppIcon.appiconset/*.png（按 Contents.json 的尺寸，不带透明，App Store 要求）
       native/engine/ios/LaunchScreenBackground.png（启动屏：背景铺满、图标居中，和游戏里的加载页一样）
- Android：native/engine/android/res/mipmap-*/ic_launcher.png（圆角）
- 商店：store/images/icon/app_store_1024.png、google_play_512.png
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

REPO = Path(__file__).resolve().parents[2]
ENGINE = REPO / 'client/native/engine'
ICON = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / 'art/approved/logo/logo_1024.png'
BG = Path(sys.argv[2]) if len(sys.argv) > 2 else REPO / 'client/assets/resources/ui/bg/home.jpg'


def square(size: int) -> Image.Image:
    return Image.open(ICON).convert('RGB').resize((size, size), Image.LANCZOS)


def rounded(size: int) -> Image.Image:
    im = square(size).convert('RGBA')
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=size * 4 * 0.18, fill=255)
    im.putalpha(mask.resize((size, size), Image.LANCZOS))
    return im


def ios() -> None:
    folder = ENGINE / 'ios/Images.xcassets/AppIcon.appiconset'
    meta = json.loads((folder / 'Contents.json').read_text())
    for img in meta['images']:
        px = int(img.get('expected-size') or round(float(img['size'].split('x')[0]) * int(img['scale'][0])))
        square(px).save(folder / img['filename'])
    # 启动屏：竖版 1290×2796（storyboard 里按 scaleAspectFill 铺满，别的尺寸裁边）
    w, h = 1290, 2796
    bg = Image.open(BG).convert('RGB')
    k = max(w / bg.width, h / bg.height)
    bg = bg.resize((round(bg.width * k), round(bg.height * k)), Image.LANCZOS)
    bg = bg.crop(((bg.width - w) // 2, (bg.height - h) // 2, (bg.width - w) // 2 + w, (bg.height - h) // 2 + h))
    logo = rounded(560)
    bg.paste(logo, ((w - 560) // 2, round(h * 0.36) - 280), logo)
    # Cocos 构建时按方向把 LaunchScreenBackgroundPortrait.png 拷成 LaunchScreenBackground.png，三张都放我们的
    for name in ('LaunchScreenBackground', 'LaunchScreenBackgroundPortrait'):
        bg.save(ENGINE / f'ios/{name}.png')
    land = Image.open(BG).convert('RGB')
    k = max(2796 / land.width, 1290 / land.height)
    land = land.resize((round(land.width * k), round(land.height * k)), Image.LANCZOS)
    land = land.crop(((land.width - 2796) // 2, (land.height - 1290) // 2, (land.width - 2796) // 2 + 2796, (land.height - 1290) // 2 + 1290))
    land.paste(logo, ((2796 - 560) // 2, (1290 - 560) // 2), logo)
    land.save(ENGINE / 'ios/LaunchScreenBackgroundLandscape.png')
    print('ios', len(meta['images']), 'icons + launch screen')


def android() -> None:
    for name, px in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
        folder = ENGINE / f'android/res/mipmap-{name}'
        folder.mkdir(parents=True, exist_ok=True)
        rounded(px).save(folder / 'ic_launcher.png')
    print('android 5 icons')


def store() -> None:
    out = REPO / 'store/images/icon'
    out.mkdir(parents=True, exist_ok=True)
    square(1024).save(out / 'app_store_1024.png')
    square(512).save(out / 'google_play_512.png')
    square(144).save(out / 'wechat_144.png')
    print('store icons')


if __name__ == '__main__':
    ios()
    android()
    store()
