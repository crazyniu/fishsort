#!/usr/bin/env python3
"""局内障碍和鱼缸目标卡的部件（docs/ux/game.md、docs/03 第 3 节），全部是 Codex 出图（2026-11-16），这里只切图：
  - j_fog：迷雾泡上蒙的那团雾。fog.png，黑底出图，按亮度还原透明度。
  - j_mystery：雾里每个鱼位放的问号球，「?」画在图里。obstacle_parts.png 左边那颗。
  - j_ice_bead：冰晶连线的一节（横放的六角冰晶），沿连线方向一节节排开。obstacle_parts.png 中间那颗。
  - j_frost：冰晶连线咬住依赖泡的那一头（一簇冰刺）。obstacle_parts.png 右边那颗。
  - icon/ice_thick0/1/2：厚冰（docs/01 9.3，连着的气泡全部破了才化）的冰面：完整、裂一道、裂两道，同一块冰换图。
    thick_ice.png 从左到右三块（2026-11-19，参照现有的 icon/ice 出的）。
  - icon/kind_hard、icon/kind_boss：难关的火苗、超难关的鲨鱼鳍（art/raw/ui_icons/level_kind.png，art/briefs/ui_icons/level_kind.txt）。
  - icon/skill_undo、icon/skill_hint、icon/lucky_ring、icon/first3：撤销、提示两个技能键，幸运泡的金圈，首次三星的奖章
    （art/raw/ui_icons/{skill_undo,skill_hint,lucky_ring,first_3star}.png，各一张图一个物件，需求在 art/briefs/ui_icons/）。
  - j_goal：木架下面钉着的目标卡（一叠两张白边相片，里面是空的水下小景；游戏在上面画要的那种鱼和「0/3」）。goal_card.png。
出图需求在 art/briefs/ui_skin/{fog,obstacle_parts,thick_ice}.txt、art/briefs/redesign/goal_card.txt。
用法：python3 tools/art/obstacles.py [art/raw/ui_skin]   之后跑 ./run.sh meta 和 ./run.sh art-compress
"""
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from skin import OUT, REPO, key_magenta, light_on_black, scaled  # noqa: E402


def key_flood(path) -> Image.Image:
    """紫色、粉色的物件不能用 key_magenta（按「品红度」算透明度，紫色会被抠成半透明、变蓝）：
    改成从四角往里泛洪——和背景色差得不多、又和图边连着的才算背景；物件内部一律不透明，只有贴着背景的 2 像素按色差做软边、减掉混进去的品红。
    物件要是一整块、中间没有镂空（镂空处泛洪够不着）"""
    import numpy as np
    from PIL import ImageDraw, ImageFilter

    src = Image.open(path).convert('RGB')
    a = np.asarray(src).astype(np.float32) / 255.0
    bg = np.median(np.concatenate([a[:8, :8].reshape(-1, 3), a[-8:, -8:].reshape(-1, 3)]), axis=0)
    dist = np.sqrt(((a - bg) ** 2).sum(axis=2))
    near = Image.fromarray(((dist < 0.3) * 255).astype(np.uint8), 'L').copy()
    for xy in ((0, 0), (src.width - 1, 0), (0, src.height - 1), (src.width - 1, src.height - 1)):
        ImageDraw.floodfill(near, xy, 128)
    back = np.asarray(near) == 128
    band = np.asarray(Image.fromarray((back * 255).astype(np.uint8), 'L').filter(ImageFilter.MaxFilter(5))) > 0
    alpha = np.where(back, 0.0, np.where(band, np.clip(dist / 0.45, 0.0, 1.0), 1.0))
    a3 = np.clip(alpha, 0.05, 1.0)[..., None]
    col = np.clip((a - (1.0 - a3) * bg) / a3, 0.0, 1.0)
    out = Image.fromarray(np.clip(np.dstack([col, alpha]) * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA')
    return out.crop(out.getbbox())


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
    # 难关的火苗、超难关的鲨鱼鳍（docs/ux/level-types.md，2026-11-19 Codex 出图 art/raw/ui_icons/level_kind.png，左右两个）
    kinds = REPO / 'art/raw/ui_icons/level_kind.png'
    if kinds.exists():
        sheet = Image.open(kinds)
        w = sheet.width // 2
        icons = [key_magenta(sheet.crop((k * w, 0, (k + 1) * w, sheet.height))) for k in range(2)]
        icons = [c.crop(c.getbbox()) for c in icons]
        side = max(max(c.width, c.height) for c in icons)
        icon = REPO / 'client/assets/resources/ui/icon'
        for name, c in zip(('kind_hard', 'kind_boss'), icons):
            c = scaled(c, 180 / side)
            canvas = Image.new('RGBA', (192, 192), (0, 0, 0, 0))
            canvas.alpha_composite(c, ((192 - c.width) // 2, (192 - c.height) // 2))
            canvas.save(icon / f'{name}.png')
            print(f'  icon/{name}', canvas.size)
    # 撤销、提示、幸运泡金圈、首次三星奖章（docs/ux/route-2026-11-19.md，2026-11-19 Codex 出图）：一张图一个物件，
    # 抠掉品红底、裁边、等比放进透明方画布（技能图标和现有的 skill_* 一样 384 见方）
    icon = REPO / 'client/assets/resources/ui/icon'
    for src, name, side, inner in (
        ('skill_undo', 'skill_undo', 384, 356),
        ('skill_hint', 'skill_hint', 384, 356),
        ('lucky_ring', 'lucky_ring', 384, 380),
        ('first_3star', 'first3', 240, 232),
    ):
        f = REPO / 'art/raw/ui_icons' / f'{src}.png'
        if not f.exists():
            continue
        # 撤销的箭头是紫色的，按品红度抠会变蓝、半透明，用泛洪抠
        c = key_flood(f) if name == 'skill_undo' else key_magenta(f)
        c = c.crop(c.getbbox())
        c = scaled(c, inner / max(c.width, c.height))
        canvas = Image.new('RGBA', (side, side), (0, 0, 0, 0))
        canvas.alpha_composite(c, ((side - c.width) // 2, (side - c.height) // 2))
        canvas.save(icon / f'{name}.png')
        print(f'  icon/{name}', canvas.size)
    if (raw / 'goal_card.png').exists():
        card = key_magenta(raw / 'goal_card.png')
        card = card.crop(card.getbbox())
        save('j_goal', scaled(card, 480 / card.width))


if __name__ == '__main__':
    main()
