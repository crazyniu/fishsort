#!/usr/bin/env python3
"""裁剪游戏字体：只保留实际用到的字。

字符来源：i18n/strings.csv、client/assets/resources/config/*.json（不含 levels，关卡里没有文字）、
client/assets/scripts 里出现的汉字，再加 ASCII 可打印字符、常用中英文标点、GB2312 一级汉字
（3755 个，保证玩家昵称常见字能显示）。

用法: ./run.sh font-subset [--src 原字体.ttf] [--out 输出.ttf]
不带 --src 时，从 git 提交 22617f8 取未裁剪的完整原字体作为输入，所以可以重复执行、随时加字。
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
# 完整原字体在仓库历史里的路径（Godot 版时期提交的）
FULL_FONT_PATH = "assets/fonts/ResourceHanRoundedCN-Heavy.ttf"
CJK = re.compile(r"[　-〿一-鿿＀-￯ -⁯]")
FULL_FONT_COMMIT = "22617f8"
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
        src = ROOT / ".font_full_src.ttf"
        blob = subprocess.run(
            ["git", "show", f"{FULL_FONT_COMMIT}:{FULL_FONT_PATH}"],
            cwd=ROOT, check=True, capture_output=True,
        ).stdout
        src.write_bytes(blob)
        args.src = str(src)
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
        (ROOT / ".font_full_src.ttf").unlink(missing_ok=True)
    print(f"游戏用字 {len(text)}，GB2312 一级 {len(gb)}，输出 {Path(args.out).stat().st_size} 字节")
    return 0


if __name__ == "__main__":
    sys.exit(main())
