#!/usr/bin/env python3
"""局内障碍和鱼缸目标卡的部件（docs/ux/game.md、docs/03 第 3 节），全部是 Codex 出图（2026-11-16），这里只切图：
  - j_fog：迷雾泡上蒙的那团雾。fog.png，黑底出图，按亮度还原透明度。
  - j_mystery：雾里每个鱼位放的问号球，「?」画在图里。obstacle_parts.png 左边那颗。
  - j_ice_bead：冰晶连线的一节（横放的六角冰晶），沿连线方向一节节排开。obstacle_parts.png 中间那颗。
  - j_frost：冰晶连线咬住依赖泡的那一头（一簇冰刺）。obstacle_parts.png 右边那颗。
  - icon/ice_thick0/1/2：厚冰（docs/01 9.3，连着的气泡全部破了才化）的冰面：完整、裂一道、裂两道，同一块冰换图。
    thick_ice.png 从左到右三块（2026-11-19，参照现有的 icon/ice 出的）。
  - j_goal：木架下面钉着的目标卡（一叠两张白边相片，里面是空的水下小景；游戏在上面画要的那种鱼和「0/3」）。goal_card.png。
出图需求在 art/briefs/ui_skin/{fog,obstacle_parts,thick_ice}.txt、art/briefs/redesign/goal_card.txt。
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
    if (raw / 'thick_ice.png').exists():
        sheet = Image.open(raw / 'thick_ice.png')
        w = sheet.width // 3
        cubes = [key_magenta(sheet.crop((k * w, 0, (k + 1) * w, sheet.height))) for k in range(3)]
        # 三块按同一个比例缩到 480 见方的画布里、居中（和 icon/ice 一样大），换图时冰块不跳
        side = max(max(c.width, c.height) for c in cubes)
        icon = REPO / 'client/assets/resources/ui/icon'
        for k, c in enumerate(cubes):
            c = scaled(c, 440 / side)
            canvas = Image.new('RGBA', (480, 480), (0, 0, 0, 0))
            canvas.alpha_composite(c, ((480 - c.width) // 2, (480 - c.height) // 2))
            canvas.save(icon / f'ice_thick{k}.png')
            print(f'  icon/ice_thick{k}', canvas.size)
    if (raw / 'goal_card.png').exists():
        card = key_magenta(raw / 'goal_card.png')
        card = card.crop(card.getbbox())
        save('j_goal', scaled(card, 480 / card.width))


if __name__ == '__main__':
    main()
