#!/usr/bin/env python3
"""裁剪游戏字体：只保留实际用到的字。

字符来源：i18n/strings.csv、client/assets/resources/config/*.json（不含 levels，关卡里没有文字）、
client/assets/scripts 里出现的汉字，再加 ASCII 可打印字符、常用中英文标点、GB2312 一级汉字
（3755 个，保证玩家昵称常见字能显示）。

用法: ./run.sh font-subset [--src 原字体.ttf] [--out 输出.ttf]
字重用 Bold（用户 2026-11-16：原来的 Heavy 看着太粗太重）。不带 --src 时用 art/raw/fonts/ResourceHanRoundedCN-Bold.ttf
（不进仓库；没有就从 https://github.com/CyanoHao/Resource-Han-Rounded/releases 的 RHR-CN-0.990.7z 里解出来放过去，OFL 许可）。
需要 fonttools 与 brotli：pip install fonttools brotli（Linux 上建议装进虚拟环境）。
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CLIENT = ROOT / "client"
FONT = CLIENT / "assets/resources/fonts/round.ttf"
# 未裁剪的完整原字体（13 MB，不进仓库）
FULL_FONT = ROOT / "art/raw/fonts/ResourceHanRoundedCN-Bold.ttf"
FULL_FONT_URL = "https://github.com/CyanoHao/Resource-Han-Rounded/releases/tag/v0.990"
CJK = re.compile(r"[　-〿一-鿿＀-￯ -⁯]")
PUNCT = "，。！？、；：“”‘’（）《》〈〉【】「」『』—…·～￥％＋－＝×÷℃°•★☆♥♡→←↑↓✓✕−∞"


def gb2312_level1() -> str:
    out = []
    for hi in range(0xB0, 0xD8):
        for lo in range(0xA1, 0xFF):
            try:
                out.append(bytes([hi, lo]).decode("gb2312"))
            except UnicodeDecodeError:
                pass
    return "".join(out)


def used_chars() -> str:
    chars: set[str] = set()
    files = [ROOT / "i18n/strings.csv"]
    files += sorted((CLIENT / "assets/resources/config").glob("*.json"))
    files += sorted((CLIENT / "assets/scripts").rglob("*.ts"))
    for f in files:
        chars.update(CJK.findall(f.read_text(encoding="utf-8")))
    return "".join(sorted(chars))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="")
    ap.add_argument("--out", default=str(FONT))
    args = ap.parse_args()
    if not args.src:
        if not FULL_FONT.exists():
            print(f"缺原字体 {FULL_FONT}：从 {FULL_FONT_URL} 下载 RHR-CN 包，解出 {FULL_FONT.name} 放到这个位置", file=sys.stderr)
            return 1
        args.src = str(FULL_FONT)
    text = used_chars()
    gb = gb2312_level1()
    ascii_chars = "".join(chr(c) for c in range(0x20, 0x7F))
    allchars = ascii_chars + PUNCT + text + gb
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
    print(f"游戏用字 {len(text)}，GB2312 一级 {len(gb)}，输出 {Path(args.out).stat().st_size} 字节")
    return 0


if __name__ == "__main__":
    sys.exit(main())
