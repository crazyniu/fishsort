#!/usr/bin/env python3
"""裁剪游戏字体：只保留实际用到的字。

字符来源：i18n/strings.csv、client/assets/resources/config/*.json（不含 levels，关卡里没有文字），
client/assets/scripts 里字符串字面量中的汉字（core/ 除外；少数界面字如语言名「中文」写在代码里），
再加 ASCII 可打印字符、常用中英文标点。只扫字面量、不扫注释：注释里的汉字会让字体大一倍。
不再带 GB2312 一级汉字（原来为玩家昵称留的 3755 个字，字体 1.5 MB）：字体要打进微信安装包（boot 包，主包限 4 MB），
裁完约 0.3 MB；昵称里字体没有的字由系统字体逐字补上。
字体放在本地 boot 包（client/assets/boot/game.ttf）而不是 resources：微信版的 resources 在网上，
引擎适配层对下载来的 TTF 调 wx.loadFont 失败时会静默退回 Arial，界面就全成了系统字体（2026-11-18）。

用法: ./run.sh font-subset [--src 原字体.ttf] [--out 输出.ttf]
字体是荆南麦圆体（用户 2026-11-18 从五款里选的：原来的资源圆体太像系统字体，没有游戏感；
先选了荆南波波黑，看着像加粗的普通字，改成这款）。不带 --src 时用 art/raw/fonts/KNMaiyuan-Regular.ttf（不进仓库；
没有就从 https://github.com/maoken-fonts/KNMaiyuan/releases 下载 KNMaiyuan-Regular.ttf 放过去，OFL 许可）。
这款字的字形偏小、偏低：裁完按比例放大到汉字高 0.93 个字号（和原来的资源圆体一样大），
再整体上移到汉字中心对准 Cocos 的节点中心（见 normalize()）。
需要 fonttools 与 brotli：pip install fonttools brotli（Linux 上建议装进虚拟环境）。
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLIENT = ROOT / "client"
FONT = CLIENT / "assets/boot/game.ttf"
# 未裁剪的完整原字体（8 MB，不进仓库）
FULL_FONT = ROOT / "art/raw/fonts/KNMaiyuan-Regular.ttf"
FULL_FONT_URL = "https://github.com/maoken-fonts/KNMaiyuan/releases"
# 游戏字体要的字：ASCII 以外的全部字符（中日文、拉丁字母的附加符号、西里尔字母），韩文除外——荆南麦圆体没有韩文，
# 韩文另裁一份资源圆体韩文版（见 KO_*）。2026-11-19 加日韩、欧洲语言和繁体（docs/10 第 8 节）
NON_ASCII = re.compile(r"[^\x00-\x7e]")
HANGUL = re.compile(r"[\u1100-\u11ff\u3130-\u318f\uac00-\ud7af]")
# 字符串字面量；行尾 // 注释（前面不是 : 免得切掉 https://）和整行 * 注释先去掉
LITERAL = re.compile(r"'[^']*'|\"[^\"]*\"|`[^`]*`")
COMMENT = re.compile(r"(?<!:)//.*$|^\s*/?\*.*$")
PUNCT = "，。！？、；：“”‘’（）《》〈〉【】「」『』—…·～￥％＋－＝×÷℃°•★☆♥♡→←↑↓✓✕−∞«»„‚–’¡¿"
# 土耳其语的 ğ ş İ Ş Ğ 荆南麦圆体没有：用字体里有的字母和附加符号拼成组合字形（add_composites）。拼用的符号也要留下
COMPOSITES = {
    "ğ": ("g", "\u0306", "above"),
    "Ğ": ("G", "\u0306", "above"),
    "ş": ("s", "\u0327", "below"),
    "Ş": ("S", "\u0327", "below"),
    "İ": ("I", "\u0307", "above"),
}
KO_FONT = CLIENT / "assets/resources/font/game_ko.ttf"
KO_FULL_FONT = ROOT / "art/raw/fonts/ResourceHanRoundedKR-Bold.ttf"
KO_FAMILY = "FishGameKO"
KO_SAMPLE = "레벨코인설정상점도감출석시작"


def csv_columns() -> dict[str, str]:
    """strings.csv 每一列（语言）的全部文字"""
    import csv

    cols: dict[str, list[str]] = {}
    with open(ROOT / "i18n/strings.csv", encoding="utf-8", newline="") as fh:
        for row in csv.DictReader(fh):
            for k, v in row.items():
                if k != "keys":
                    cols.setdefault(k, []).append(v or "")
    return {k: "".join(v) for k, v in cols.items()}


def used_chars() -> str:
    """游戏字体：除韩文那一列以外的文案、配置、代码字面量里的非 ASCII 字符（韩文字母不要）"""
    chars: set[str] = set()
    for lang, text in csv_columns().items():
        if lang != "ko":
            chars.update(NON_ASCII.findall(text))
    for f in sorted((CLIENT / "assets/resources/config").glob("*.json")):
        chars.update(NON_ASCII.findall(f.read_text(encoding="utf-8")))
    scripts = CLIENT / "assets/scripts"
    for f in sorted(scripts.rglob("*.ts")):
        if f.relative_to(scripts).parts[0] == "core":
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            line = COMMENT.sub("", line)
            for lit in LITERAL.findall(line):
                chars.update(NON_ASCII.findall(lit))
    for base, mark, _ in COMPOSITES.values():
        chars.update(base + mark)
    return "".join(sorted(c for c in chars if not HANGUL.match(c)))


def add_composites(path: Path) -> None:
    """原字体缺的字母用「字母 + 附加符号」拼成组合字形（不画新轮廓）：符号横向居中对准字母，上方的放在字母顶上，下方的贴着基线"""
    from fontTools.ttLib import TTFont
    from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent

    f = TTFont(str(path))
    cmap = f.getBestCmap()
    glyf = f["glyf"]
    hmtx = f["hmtx"]
    upm = f["head"].unitsPerEm
    order = f.getGlyphOrder()
    added = []
    for ch, (base, mark, where) in COMPOSITES.items():
        if ord(ch) in cmap or ord(base) not in cmap or ord(mark) not in cmap:
            continue
        bn, mn = cmap[ord(base)], cmap[ord(mark)]
        b, m = glyf[bn], glyf[mn]
        b.recalcBounds(glyf)
        m.recalcBounds(glyf)
        dx = round((b.xMin + b.xMax) / 2 - (m.xMin + m.xMax) / 2)
        if where == "above":
            dy = round(b.yMax + upm * 0.04 - m.yMin)
        else:
            dy = round(min(0, b.yMin) - m.yMax + upm * 0.06)
        g = Glyph()
        g.numberOfContours = -1
        comps = []
        for name, x, y, flags in ((bn, 0, 0, 0x200 | 0x4), (mn, dx, dy, 0x4)):
            c = GlyphComponent()
            c.glyphName, c.x, c.y, c.flags = name, x, y, flags
            comps.append(c)
        g.components = comps
        gname = f"uni{ord(ch):04X}"
        glyf.glyphs[gname] = g
        order.append(gname)
        hmtx[gname] = hmtx[bn]
        for t in f["cmap"].tables:
            if t.isUnicode():
                t.cmap[ord(ch)] = gname
        added.append(ch)
    if added:
        f.setGlyphOrder(order)
        glyf.glyphOrder = order
        for gname in order[-len(added):]:
            glyf[gname].recalcBounds(glyf)
        print(f"拼出组合字形：{''.join(added)}")
        f.save(str(path))


# 字体内部的名字换成不带空格的：原名（「Resource Han Rounded CN」「KN Maiyuan」）带空格，微信的 wx.loadFont 读出的 family
# 拼进 canvas 的 font 串里认不出来，界面退回系统字体（2026-11-18；Cocos 论坛 topic/145453 同样的问题，去掉空格解决）
FAMILY = "FishGame"


# Cocos 把基线放在节点中心往下 0.37 个字号处（docs/04 第 9 节量过）；汉字的字形中心要落在节点中心
CENTER = 0.37
# 汉字（取样平均）的字形高占几个字号：原来的资源圆体是 0.93，界面的字号、留白都是按它定的
CJK_HEIGHT = 0.93
SAMPLE = "签到商店收藏等级开始关生命设置选关第"


def normalize(path: Path, sample: str = SAMPLE) -> None:
    """
    字形大小、上下位置对齐到原来的资源圆体，界面代码里的字号和居中都不用改：
    1. 改 unitsPerEm 让字整体按比例放大缩小（字宽、字距跟着一起变）；
    2. 全部字形整体上下挪，让汉字的字形中心对准节点中心。
    """
    from fontTools.ttLib import TTFont

    f = TTFont(str(path))
    cmap = f.getBestCmap()
    glyf = f["glyf"]
    boxes = [glyf[cmap[ord(c)]] for c in sample if ord(c) in cmap]
    boxes = [g for g in boxes if g.numberOfContours]
    h = sum(g.yMax - g.yMin for g in boxes) / len(boxes)
    upm = round(h / CJK_HEIGHT)
    if abs(upm - f["head"].unitsPerEm) > 2:
        print(f"字号单位 {f['head'].unitsPerEm} → {upm}（字放大 {f['head'].unitsPerEm / upm:.3f} 倍）")
        f["head"].unitsPerEm = upm
    dy = round(CENTER * upm - sum((g.yMin + g.yMax) / 2 for g in boxes) / len(boxes))
    if abs(dy) < upm * 0.01:
        f.save(str(path))
        return
    for name in f.getGlyphOrder():
        g = glyf[name]
        if g.isComposite() or not g.numberOfContours:
            continue
        g.coordinates.translate((0, dy))
        g.recalcBounds(glyf)
    for name in f.getGlyphOrder():
        g = glyf[name]
        if g.isComposite():
            g.recalcBounds(glyf)
    print(f"字形整体上移 {dy}/{upm} 个字号")
    f.save(str(path))


def rename(path: Path, family: str = FAMILY) -> None:
    from fontTools.ttLib import TTFont

    f = TTFont(str(path))
    for rec in f["name"].names:
        if rec.nameID in (1, 4, 16):
            rec.string = family
        elif rec.nameID in (3, 6):
            rec.string = f"{family}-Regular"
        elif rec.nameID in (2, 17):
            rec.string = "Regular"
    f.save(str(path))


def subset(src: str, out: str, text: str) -> None:
    ascii_chars = "".join(chr(c) for c in range(0x20, 0x7F))
    tmp = ROOT / ".font_subset_chars.txt"
    tmp.write_text(ascii_chars + PUNCT + text, encoding="utf-8")
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(
            [
                sys.executable, "-m", "fontTools.subset", src,
                f"--text-file={tmp}", f"--output-file={out}",
                "--layout-features=*", "--no-hinting", "--desubroutinize",
                "--notdef-outline", "--name-IDs=*", "--glyph-names",
            ],
            check=True,
        )
    finally:
        tmp.unlink(missing_ok=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="")
    ap.add_argument("--out", default=str(FONT))
    args = ap.parse_args()
    if not args.src:
        if not FULL_FONT.exists():
            print(f"缺原字体 {FULL_FONT}：从 {FULL_FONT_URL} 下载 {FULL_FONT.name} 放到这个位置", file=sys.stderr)
            return 1
        args.src = str(FULL_FONT)
    text = used_chars()
    subset(args.src, args.out, text)
    add_composites(Path(args.out))
    normalize(Path(args.out))
    rename(Path(args.out))
    print(f"游戏用字 {len(text)}，输出 {Path(args.out).stat().st_size} 字节")
    # 韩文：只给 App 用，放 resources（ui/res.ts 的 LANG_FONT）
    ko = csv_columns().get("ko", "")
    if ko:
        if not KO_FULL_FONT.exists():
            print(f"缺韩文原字体 {KO_FULL_FONT}（资源圆体韩文版 Resource Han Rounded KR Bold，OFL）", file=sys.stderr)
            return 1
        ko_text = "".join(sorted(set(NON_ASCII.findall(ko))))
        subset(str(KO_FULL_FONT), str(KO_FONT), ko_text)
        normalize(KO_FONT, KO_SAMPLE)
        rename(KO_FONT, KO_FAMILY)
        print(f"韩文用字 {len(ko_text)}，输出 {KO_FONT.stat().st_size} 字节")
    return 0


if __name__ == "__main__":
    sys.exit(main())
