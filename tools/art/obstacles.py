#!/usr/bin/env python3
"""局内障碍和鱼缸订单卡的部件（docs/ux/game.md、docs/03 第 3 节），全部是 Codex 出图（2026-11-16），这里只切图：
  - j_fog：迷雾泡上蒙的那团雾。fog.png，黑底出图，按亮度还原透明度。
  - j_mystery：雾里每个鱼位放的问号球，「?」画在图里。obstacle_parts.png 左边那颗。
  - j_ice_bead：冰晶连线的一节（横放的六角冰晶），沿连线方向一节节排开。obstacle_parts.png 中间那颗。
  - j_frost：冰晶连线咬住依赖泡的那一头（一簇冰刺）。obstacle_parts.png 右边那颗。
  - j_order：鱼缸前面叠的订单卡（手绘风格的奶油色水彩纸，用户 2026-11-16 要求不用亮面）。order_card.png。
出图需求在 art/briefs/ui_skin/{fog,obstacle_parts,order_card}.txt。
用法：python3 tools/art/obstacles.py [art/raw/ui_skin]   之后跑 ./run.sh meta 和 ./run.sh art-compress
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from skin import OUT, REPO, key_magenta, light_on_black, scaled  # noqa: E402


def save(name: str, im: Image.Image) -> None:
    im.save(OUT / f'{name}.png')
    print(f'  {name}', im.size)


def main() -> None:
    raw = Path(sys.argv[1]) if len(sys.argv) > 1 else REPO / 'art/raw/ui_skin'
    if (raw / 'fog.png').exists():
        save('j_fog', light_on_black(raw / 'fog.png', 384))
    if (raw / 'obstacle_parts.png').exists():
        sheet = Image.open(raw / 'obstacle_parts.png')
        w = sheet.width // 3
        mystery, bead, frost = (key_magenta(sheet.crop((k * w, 0, (k + 1) * w, sheet.height))) for k in range(3))
        save('j_mystery', scaled(mystery, 160 / mystery.width))
        save('j_ice_bead', scaled(bead, 120 / bead.width))
        save('j_frost', scaled(frost, 120 / frost.width))
    if (raw / 'order_card.png').exists():
        card = key_magenta(raw / 'order_card.png')
        save('j_order', scaled(card, 200 / card.width))


if __name__ == '__main__':
    main()
