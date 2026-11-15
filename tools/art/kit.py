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


def box(w, h, radius, top, bottom=None, border=None, border_w=0.0, shadow=0.0, blur=0.0, drop=0.0, shine=0.0, hard=0.0, edge=None):
    """一个圆角块。返回 (图, 投影留边)。尺寸单位是设计像素。"""
    bottom = bottom or top
    pad = math.ceil(blur * 2 + drop) if shadow else 0
    pad = max(pad, math.ceil(hard))
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
    if hard:
        # 2.5D 的厚度：同形状往下错开，用更深的同色系
        hs = shape(size, (outer[0], outer[1] + hard * K, outer[2], outer[3] + hard * K), radius * K)
        img.alpha_composite(tint(hs, edge))
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


def radial(size: int, inner: float, outer: float, power: float = 2.0) -> Image.Image:
    """白色径向渐变：inner 以内全亮，到 outer 渐隐。用于光晕，由代码染色。"""
    S = size * DENSITY * SS
    img = Image.new("L", (S, S), 0)
    px = img.load()
    c = (S - 1) / 2
    for y in range(S):
        for x in range(S):
            d = math.hypot(x - c, y - c) / c
            v = 1.0 if d <= inner else max(0.0, 1 - (d - inner) / (outer - inner)) ** power
            px[x, y] = round(v * 255)
    return tint(img, (255, 255, 255, 255))


def ring(size: int, width: float) -> Image.Image:
    S = size * K
    img = Image.new("L", (S, S), 0)
    w = round(width * K)
    ImageDraw.Draw(img).ellipse((w, w, S - w, S - w), outline=255, width=w)
    return tint(img.filter(ImageFilter.GaussianBlur(K * 0.8)), (255, 255, 255, 255))


def spark(size: int) -> Image.Image:
    """四角星闪光。"""
    S = size * K
    img = Image.new("L", (S, S), 0)
    c = S / 2
    pts = []
    for i in range(8):
        a = math.tau * i / 8
        r = c * (1.0 if i % 2 == 0 else 0.16)
        pts.append((c + math.cos(a) * r, c + math.sin(a) * r))
    ImageDraw.Draw(img).polygon(pts, fill=255)
    return tint(img.filter(ImageFilter.GaussianBlur(K * 0.5)), (255, 255, 255, 255))


def edge_glow(size: int, depth: float) -> Image.Image:
    """四边向内渐隐的白色边光，中间透明；九宫格拉伸后铺满全屏。"""
    S = size * DENSITY * SS
    img = Image.new("L", (S, S), 0)
    px = img.load()
    d = depth * DENSITY * SS
    for y in range(S):
        for x in range(S):
            m = min(x, y, S - 1 - x, S - 1 - y)
            px[x, y] = round(max(0.0, 1 - m / d) ** 1.8 * 255)
    return tint(img, (255, 255, 255, 255))


def ribbon(w: int, h: int) -> Image.Image:
    """过关横幅：红色缎带，两端燕尾，后面露出深色折角。"""
    W, H = w * K, h * K
    img = Image.new("RGBA", (W, H + 14 * K), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    tail, fold = 70 * K, 46 * K
    dark, deep = rgba("B3261A"), rgba("7E150D")
    for sx in (0, 1):
        x0 = 0 if sx == 0 else W
        sgn = 1 if sx == 0 else -1
        y0 = 14 * K
        d.polygon([(x0, y0), (x0 + sgn * (tail + fold), y0), (x0 + sgn * (tail + fold), y0 + H), (x0, y0 + H), (x0 + sgn * 30 * K, y0 + H / 2)], fill=dark)
        d.polygon([(x0 + sgn * tail, H), (x0 + sgn * (tail + fold), H), (x0 + sgn * (tail + fold), H + 14 * K)], fill=deep)
    body = gradient((W - 2 * tail, H), rgba("FF6A55"), rgba("E23A28"), 0, H)
    mask = shape((W - 2 * tail, H), (0, 0, W - 2 * tail - 1, H - 1), 10 * K)
    body.putalpha(mask)
    img.alpha_composite(body, (tail, 0))
    d.line((tail + 16 * K, 9 * K, W - tail - 16 * K, 9 * K), fill=rgba("FFFFFF", 0.45), width=2 * K)
    d.line((tail + 16 * K, H - 9 * K, W - tail - 16 * K, H - 9 * K), fill=rgba("7E150D", 0.5), width=2 * K)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for old in list(OUT.glob("*.png")) + list(OUT.glob("*.png.import")):
        old.unlink()
    white = rgba("FFFFFF")
    # 按钮：纵向渐变 + 一条高光线 + 下沿深色厚度，不描粗边
    families = {
        "blue": ("52B0FF", "2A7FE6", "1A57B0"),
        "green": ("74DA4E", "43B528", "2A8618"),
        "orange": ("FFBA4A", "F58A12", "B85F00"),
        "purple": ("AE7EF0", "8553D6", "5B32A3"),
        "red": ("FF7A66", "E0452F", "A52A18"),
    }

    def button(name, radius=22, w=96, h=92):
        top, bottom, edge = (rgba(c) for c in families[name])
        return box(w, h, radius, top, bottom, rgba("FFFFFF", 0.6), 2, shadow=0.22, blur=4, drop=6, shine=0.55, hard=6, edge=edge)

    for name in families:
        save(f"btn_{name}", button(name))
    save("tile", button("blue", 22, 108, 108))
    save("btn_gear", stamp(button("blue", 18, 72, 72), gear(44)), stretch=False)
    save("btn_close", stamp(button("red", 18, 72, 72), cross(44, False)), stretch=False)

    # 实色蓝条：顶栏、底栏、暂存槽托盘
    save("glass", box(96, 96, 22, rgba("3E95F2"), rgba("2364CC"), rgba("8CCBFF"), 2.5, shadow=0.3, blur=5, drop=5, shine=0.45, hard=4, edge=rgba("163F8E")))
    # 选中的页签：更亮的青蓝，带白边
    save("tab_on", box(72, 72, 18, rgba("6CD0FF"), rgba("2F9BF0"), white, 2.5, shine=0.6, hard=4, edge=rgba("1A62B8")))
    # 白色胶囊：数字、进度底；深蓝字
    save("chip", box(72, 60, 30, rgba("FFFFFF"), rgba("E2EEFB"), None, 0, shadow=0.25, blur=2, drop=2, hard=2.5, edge=rgba("9DB8DA")))
    # 暂存格：深一点的蓝色凹槽
    save("slot", box(76, 76, 12, rgba("1A4F9E"), rgba("2563BE"), rgba("74B8FF"), 2))
    save("fill", box(72, 44, 22, rgba("74DA4E"), rgba("43B528"), None, 0, shine=0.45))
    # 深海底板：图鉴等列表页的内容区
    save("deep", box(96, 96, 24, rgba("1A3E80"), rgba("102A5C"), rgba("3A6CC0"), 2.5, shadow=0.3, blur=6, drop=6))
    # 深色轨道 + 白色选中块：分段页签
    save("track", box(72, 60, 30, rgba("0F2C63"), rgba("173A7A"), rgba("3C6FC4"), 2))
    save("seg_on", box(72, 60, 26, rgba("FFFFFF"), rgba("DCEBFC"), None, 0, shadow=0.25, blur=2, drop=2))
    # 浅色面板：弹窗、列表行、卡片
    save("panel", box(120, 120, 34, white, rgba("EEF6FF"), white, 3, shadow=0.34, blur=12, drop=14))
    save("row", box(96, 96, 22, white, rgba("EAF4FF"), None, 0, shadow=0.2, blur=4, drop=4, hard=3, edge=rgba("A9C4E6")))
    save("card", box(96, 96, 22, white, rgba("EAF4FF"), None, 0, shadow=0.2, blur=4, drop=4, hard=3, edge=rgba("A9C4E6")))
    save("card_gold", box(96, 96, 22, rgba("FFF1BF"), rgba("FFDC7A"), None, 0, shadow=0.2, blur=4, drop=4, hard=3, edge=rgba("D9A93A")))
    # 木架子：暖色木板 + 顶部亮线 + 下沿深色厚度
    save("shelf", box(96, 28, 8, rgba("F2B46A"), rgba("D78A44"), rgba("FFD9A3"), 2, shadow=0.3, blur=4, drop=4, shine=0.6, hard=6, edge=rgba("9A5A26")))

    # 底部渐隐条：从透明过渡到深蓝，衬托页签和道具键
    fade = gradient((8 * K, 96 * K), NAVY + (0,), NAVY + (190,), 0, 96 * K)
    save("fade", fade)

    save("badge_green", circle(80, rgba("63D444"), rgba("3FAE25")), stretch=False)
    save("badge_purple", circle(80, rgba("A274E6"), rgba("7B49CC")), stretch=False)
    save("dot_red", circle(40, rgba("F56B59"), rgba("E0452F"), ring_w=3), stretch=False)
    save("plus", stamp(circle(56, rgba("63D444"), rgba("3FAE25")), cross(40, True)), stretch=False)

    # 特效贴图：白色，由代码染色
    save("fx_glow", radial(128, 0.05, 1.0, 2.2), stretch=False)
    save("fx_ring", ring(128, 7), stretch=False)
    save("fx_spark", spark(64), stretch=False)
    save("fx_edge", edge_glow(96, 46))
    save("ribbon", ribbon(640, 120), stretch=False)

    (OUT / "kit.json").write_text(json.dumps({"density": DENSITY, "pieces": pieces}, indent=1) + "\n")
    print(f"✓ 生成 {len(pieces)} 个部件 → {OUT}")


if __name__ == "__main__":
    main()
