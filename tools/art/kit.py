#!/usr/bin/env python3
"""用代码绘制整套 UI 部件：「轻玻璃」风格（用户 2026-11-15 选定），面板一律实心不透明（用户反馈透明组件看不清）。

半透明玻璃底 + 细白边 + 柔和投影；按钮只有很淡的纵向渐变和一条细高光线；
圆角适中；不做果冻感和大块高光。尺寸与对齐完全由代码控制。

输出 assets/kit/*.png（3 倍密度）和 kit.json（九宫格边距与投影留边，单位是设计像素）。
用法: python3 tools/art/kit.py
"""
import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

OUT = Path(__file__).resolve().parents[2] / "assets" / "kit"
DENSITY = 3  # 贴图像素 / 设计像素
SS = 2  # 额外超采样，缩小后边缘平滑
K = DENSITY * SS
NAVY = (6, 31, 77)
pieces = {}


def rgba(hex_: str, alpha: float = 1.0):
    hex_ = hex_.lstrip("#")
    return tuple(int(hex_[i:i + 2], 16) for i in (0, 2, 4)) + (round(alpha * 255),)


def mix(a, b, t: float):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(4))


def shape(size, box, radius) -> Image.Image:
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle(box, radius=max(0, radius), fill=255)
    return m


def gradient(size, top, bottom, y0: int, y1: int) -> Image.Image:
    col = Image.new("RGBA", (1, size[1]))
    for y in range(size[1]):
        t = min(1.0, max(0.0, (y - y0) / max(1, y1 - y0)))
        col.putpixel((0, y), mix(top, bottom, t))
    return col.resize(size)


def tint(mask: Image.Image, color) -> Image.Image:
    """把灰度蒙版染成指定颜色，蒙版亮度乘以颜色自身的透明度。"""
    alpha = mask.point(lambda v: v * color[3] // 255)
    return Image.merge("RGBA", [Image.new("L", mask.size, c) for c in color[:3]] + [alpha])


def box(w, h, radius, top, bottom=None, border=None, border_w=0.0, shadow=0.0, blur=0.0, drop=0.0, shine=0.0):
    """一个圆角块。返回 (图, 投影留边)。尺寸单位是设计像素。"""
    bottom = bottom or top
    pad = math.ceil(blur * 2 + drop) if shadow else 0
    size = ((w + pad * 2) * K, (h + pad * 2) * K)
    p, bw = pad * K, round(border_w * K)
    outer = (p, p, p + w * K - 1, p + h * K - 1)
    inner = (p + bw, p + bw, p + w * K - 1 - bw, p + h * K - 1 - bw)
    outer_mask = shape(size, outer, radius * K)
    inner_mask = shape(size, inner, radius * K - bw)
    img = Image.new("RGBA", size, (0, 0, 0, 0))
    if shadow:
        sh = shape(size, (outer[0], outer[1] + drop * K, outer[2], outer[3] + drop * K), radius * K)
        sh = sh.filter(ImageFilter.GaussianBlur(blur * K))
        # 投影只留在部件外面，否则会透过半透明的玻璃把它压暗
        img.alpha_composite(tint(ImageChops.subtract(sh, outer_mask), NAVY + (round(shadow * 255),)))
    if border and bw:
        img.alpha_composite(tint(ImageChops.subtract(outer_mask, inner_mask), border))
    face = gradient(size, top, bottom, inner[1], inner[3])
    face.putalpha(ImageChops.multiply(face.getchannel("A"), inner_mask))
    img.alpha_composite(face)
    if shine:
        line = Image.new("L", size, 0)
        y = inner[1] + round(1.5 * K)
        inset = radius * K * 0.55
        ImageDraw.Draw(line).rounded_rectangle((inner[0] + inset, y, inner[2] - inset, y + round(1.5 * K)), radius=K, fill=255)
        img.alpha_composite(tint(line, (255, 255, 255, round(shine * 255))))
    return img, pad


def save(name: str, made, stretch: bool = True) -> None:
    img, pad = made if isinstance(made, tuple) else (made, 0)
    img = img.resize((img.width // SS, img.height // SS), Image.LANCZOS)
    img.save(OUT / f"{name}.png", optimize=True)
    w, h = img.width / DENSITY, img.height / DENSITY
    # 九宫格边距取一半再留 1 像素中缝：这些部件都是规则圆角块，中间可任意拉伸
    pieces[name] = {"pad": pad, "mx": math.floor(w / 2) - 1 if stretch else 0, "my": math.floor(h / 2) - 1 if stretch else 0}


def circle(d, top, bottom, ring_w=4.0, shadow=0.25):
    blur, drop = 4, 3
    pad = math.ceil(blur * 2 + drop)
    S = (d + pad * 2) * K
    p = pad * K
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    disc = Image.new("L", (S, S), 0)
    ImageDraw.Draw(disc).ellipse((p, p, p + d * K - 1, p + d * K - 1), fill=255)
    sh = ImageChops.offset(disc, 0, drop * K).filter(ImageFilter.GaussianBlur(blur * K))
    img.alpha_composite(tint(ImageChops.subtract(sh, disc), NAVY + (round(shadow * 255),)))
    img.alpha_composite(tint(disc, (255, 255, 255, 255)))
    r = round(ring_w * K)
    inner = Image.new("L", (S, S), 0)
    ImageDraw.Draw(inner).ellipse((p + r, p + r, p + d * K - 1 - r, p + d * K - 1 - r), fill=255)
    face = gradient((S, S), top, bottom, p, p + d * K)
    face.putalpha(inner)
    img.alpha_composite(face)
    return img, pad


def gear(size):
    """白色齿轮：8 个齿 + 中心孔。"""
    S = size * K
    img = Image.new("L", (S, S), 0)
    draw = ImageDraw.Draw(img)
    c = S / 2
    for i in range(8):
        a = math.tau * i / 8
        pts = [(c + math.cos(a + da) * S * rr, c + math.sin(a + da) * S * rr) for da, rr in ((-0.2, 0.3), (-0.13, 0.46), (0.13, 0.46), (0.2, 0.3))]
        draw.polygon(pts, fill=255)
    draw.ellipse((c - S * 0.34, c - S * 0.34, c + S * 0.34, c + S * 0.34), fill=255)
    draw.ellipse((c - S * 0.14, c - S * 0.14, c + S * 0.14, c + S * 0.14), fill=0)
    return tint(img, (255, 255, 255, 255))


def stamp(made, glyph: Image.Image):
    img, pad = made
    img.alpha_composite(glyph, ((img.width - glyph.width) // 2, (img.height - glyph.height) // 2))
    return img, pad


def cross(size, plus: bool):
    S = size * K
    img = Image.new("L", (S, S), 0)
    d = ImageDraw.Draw(img)
    c, r, wd = S / 2, S * 0.3, round(S * 0.17)
    if plus:
        d.rounded_rectangle((c - r, c - wd / 2, c + r, c + wd / 2), radius=wd / 2, fill=255)
        d.rounded_rectangle((c - wd / 2, c - r, c + wd / 2, c + r), radius=wd / 2, fill=255)
    else:
        for sx in (1, -1):
            d.line((c - r, c - r * sx, c + r, c + r * sx), fill=255, width=wd)
    return tint(img, (255, 255, 255, 255))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in list(OUT.glob("*.png")) + list(OUT.glob("*.png.import")):
        old.unlink()
    white = rgba("FFFFFF")

    # 按钮：淡渐变 + 细白边 + 一条高光线 + 柔和投影
    families = {
        "blue": ("4AA5F8", "2A86EA"),
        "green": ("63D444", "43B528"),
        "orange": ("FFAE45", "F58A12"),
        "purple": ("A274E6", "8553D6"),
        "red": ("F56B59", "E0452F"),
    }

    def button(name, radius=30, w=96, h=92):
        top, bottom = (rgba(c) for c in families[name])
        return box(w, h, radius, top, bottom, rgba("FFFFFF", 0.55), 2, shadow=0.24, blur=5, drop=6, shine=0.5)

    for name in families:
        save(f"btn_{name}", button(name))
    save("tile", button("blue", 30, 108, 108))
    save("btn_gear", stamp(button("blue", 22, 72, 72), gear(44)), stretch=False)
    save("btn_close", stamp(button("red", 22, 72, 72), cross(44, False)), stretch=False)

    # 实心面板：顶栏、底栏、暂存槽托盘、选中的页签（不透明，背景再花也读得清）
    save("glass", box(96, 96, 30, rgba("2C7AD2"), rgba("1C5AAE"), rgba("A5D4FF", 0.9), 2.5, shadow=0.3, blur=6, drop=6, shine=0.35))
    save("tab_on", box(72, 72, 24, rgba("5DB8FF"), rgba("2F8FEA"), rgba("FFFFFF", 0.85), 2.5, shine=0.5))
    # 深色胶囊：数字底、进度条底、暂存格（同样实心）
    save("chip", box(72, 60, 30, rgba("123F84"), rgba("0E3170"), rgba("6FB0F0", 0.7), 2))
    save("slot", box(76, 76, 18, rgba("1A5CAB"), rgba("144C93"), rgba("5AA0EA", 0.8), 2))
    save("fill", box(72, 44, 22, rgba("63D444"), rgba("43B528"), rgba("FFFFFF", 0.5), 2, shine=0.45))
    # 浅色面板：弹窗、列表行、卡片
    save("panel", box(120, 120, 44, rgba("FFFFFF"), rgba("EEF7FF"), white, 3, shadow=0.34, blur=12, drop=14))
    save("row", box(96, 96, 28, rgba("FFFFFF"), rgba("EAF4FF"), white, 3, shadow=0.16, blur=5, drop=5))
    save("card", box(96, 96, 28, rgba("FFFFFF"), rgba("EAF4FF"), white, 3, shadow=0.16, blur=5, drop=5))
    save("card_gold", box(96, 96, 28, rgba("FFF1BF"), rgba("FFDF86"), white, 3, shadow=0.2, blur=5, drop=5))
    # 鱼缸架：一条玻璃搁板
    save("shelf", box(96, 24, 12, rgba("9AD6F6"), rgba("5CB0E4"), rgba("D8F1FF"), 2, shadow=0.25, blur=4, drop=4))

    # 底部渐隐条：从透明过渡到深蓝，衬托页签和道具键
    fade = gradient((8 * K, 96 * K), NAVY + (0,), NAVY + (215,), 0, 96 * K)
    save("fade", fade)

    save("badge_green", circle(80, rgba("63D444"), rgba("3FAE25")), stretch=False)
    save("badge_purple", circle(80, rgba("A274E6"), rgba("7B49CC")), stretch=False)
    save("dot_red", circle(40, rgba("F56B59"), rgba("E0452F"), ring_w=3), stretch=False)
    save("plus", stamp(circle(56, rgba("63D444"), rgba("3FAE25")), cross(40, True)), stretch=False)

    (OUT / "kit.json").write_text(json.dumps({"density": DENSITY, "pieces": pieces}, indent=1) + "\n")
    print(f"✓ 生成 {len(pieces)} 个部件 → {OUT}")


if __name__ == "__main__":
    main()
