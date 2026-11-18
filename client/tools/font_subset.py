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
字体是荆南波波黑 Bold（用户 2026-11-18 从五款里选的：原来的资源圆体太像系统字体，没有游戏感）。
不带 --src 时用 art/raw/fonts/KNBobohei-Bold.ttf（不进仓库；没有就从
https://github.com/maoken-fonts/KNBobohei/releases 下载 KNBobohei-Bold.ttf 放过去，OFL 许可）。
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
# 未裁剪的完整原字体（5 MB，不进仓库）
FULL_FONT = ROOT / "art/raw/fonts/KNBobohei-Bold.ttf"
FULL_FONT_URL = "https://github.com/maoken-fonts/KNBobohei/releases"
CJK = re.compile(r"[　-〿一-鿿＀-￯ -⁯]")
# 字符串字面量；行尾 // 注释（前面不是 : 免得切掉 https://）和整行 * 注释先去掉
LITERAL = re.compile(r"'[^']*'|\"[^\"]*\"|`[^`]*`")
COMMENT = re.compile(r"(?<!:)//.*$|^\s*/?\*.*$")
PUNCT = "，。！？、；：“”‘’（）《》〈〉【】「」『』—…·～￥％＋－＝×÷℃°•★☆♥♡→←↑↓✓✕−∞"



def used_chars() -> str:
    chars: set[str] = set()
    files = [ROOT / "i18n/strings.csv"]
    files += sorted((CLIENT / "assets/resources/config").glob("*.json"))
    for f in files:
        chars.update(CJK.findall(f.read_text(encoding="utf-8")))
    scripts = CLIENT / "assets/scripts"
    for f in sorted(scripts.rglob("*.ts")):
        if f.relative_to(scripts).parts[0] == "core":
            continue
        for line in f.read_text(encoding="utf-8").splitlines():
            line = COMMENT.sub("", line)
            for lit in LITERAL.findall(line):
                chars.update(CJK.findall(lit))
    return "".join(sorted(chars))


# 字体内部的名字换成不带空格的：原名（「Resource Han Rounded CN」「KN Bobohei」）带空格，微信的 wx.loadFont 读出的 family
# 拼进 canvas 的 font 串里认不出来，界面退回系统字体（2026-11-18；Cocos 论坛 topic/145453 同样的问题，去掉空格解决）
FAMILY = "FishGame"


def rename(path: Path) -> None:
    from fontTools.ttLib import TTFont

    f = TTFont(str(path))
    for rec in f["name"].names:
        if rec.nameID in (1, 4, 16):
            rec.string = FAMILY
        elif rec.nameID == 6:
            rec.string = f"{FAMILY}-Bold"
        elif rec.nameID == 3:
            rec.string = f"{FAMILY}-Bold"
        elif rec.nameID in (2, 17):
            rec.string = "Bold"
    f.save(str(path))


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
    ascii_chars = "".join(chr(c) for c in range(0x20, 0x7F))
    allchars = ascii_chars + PUNCT + text
    tmp = ROOT / ".font_subset_chars.txt"
    tmp.write_text(allchars, encoding="utf-8")
    try:
        subprocess.run(
            [
                sys.executable, "-m", "fontTools.subset", args.src,
                f"--text-file={tmp}", f"--output-file={args.out}",
                "--layout-features=*", "--no-hinting", "--desubroutinize",
                "--notdef-outline", "--name-IDs=*", "--glyph-names",
            ],
            check=True,
        )
    finally:
        tmp.unlink(missing_ok=True)
    rename(Path(args.out))
    print(f"游戏用字 {len(text)}，输出 {Path(args.out).stat().st_size} 字节")
    return 0


if __name__ == "__main__":
    sys.exit(main())
