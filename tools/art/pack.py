#!/usr/bin/env python3
"""进包前处理 PNG：裁掉全透明边、压缩，最后打印压缩前后的大小表。

用法: pack.py [选项] <文件或目录> ...
  -o DIR        输出到 DIR（保持相对目录结构）；省略则原地覆盖
  --keep GLOB   这些文件不裁边（游戏按画布尺寸摆放它们），可重复；
                默认读 tools/art/pack_keep.txt，每行一个 glob，# 开头为注释
  --no-trim     全部不裁边，只压缩
  --dry-run     只算不写，打印表格

压缩：有 pngquant 就用它（质量 65–90），没有就用 Pillow 的 optimize。
幂等：只有结果比原文件小才替换，重复运行不会再变。裁边只在确实有透明边时才做。
"""
import argparse
import fnmatch
import io
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
KEEP_FILE = Path(__file__).with_name("pack_keep.txt")
MAX_SIDE = 2048  # docs/03：单张贴图不超过 2048 × 2048


def load_keep(extra: list[str]) -> list[str]:
    globs = list(extra)
    if KEEP_FILE.exists():
        for line in KEEP_FILE.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                globs.append(line)
    return globs


def is_kept(path: Path, globs: list[str]) -> bool:
    try:
        rel = path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        rel = path.as_posix()
    return any(fnmatch.fnmatch(rel, g) for g in globs)


def trim(img: Image.Image) -> Image.Image:
    """裁掉全透明（alpha = 0）的外圈；没有 alpha 通道或没有透明边则原样返回。"""
    if "A" not in img.getbands():
        return img
    box = img.getchannel("A").getbbox()
    if box is None or box == (0, 0, img.width, img.height):
        return img
    return img.crop(box)


def encode(img: Image.Image) -> bytes:
    """编码成压缩过的 PNG 字节。"""
    buf = io.BytesIO()
    img.save(buf, "PNG", optimize=True)
    raw = buf.getvalue()
    if shutil.which("pngquant"):
        res = subprocess.run(
            ["pngquant", "--quality=65-90", "--speed=1", "--strip", "-"],
            input=raw,
            capture_output=True,
        )
        # 退出码 99 = 质量达不到下限，沿用 Pillow 结果
        if res.returncode == 0 and res.stdout:
            return res.stdout if len(res.stdout) < len(raw) else raw
    return raw


def collect(paths: list[str]) -> list[Path]:
    out: list[Path] = []
    for p in map(Path, paths):
        out += sorted(p.rglob("*.png")) if p.is_dir() else [p]
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    ap.add_argument("paths", nargs="+")
    ap.add_argument("-o", dest="out")
    ap.add_argument("--keep", action="append", default=[])
    ap.add_argument("--no-trim", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    keep = load_keep(args.keep)
    rows: list[tuple[str, int, int, str]] = []
    for src in collect(args.paths):
        before = src.stat().st_size
        img = Image.open(src)
        img.load()
        note = ""
        if img.mode not in ("RGBA", "RGB", "P", "L", "LA"):
            img = img.convert("RGBA")
        if not args.no_trim and not is_kept(src, keep):
            t = trim(img.convert("RGBA") if img.mode == "P" else img)
            if t is not img:
                note = "裁边 %dx%d→%dx%d" % (img.width, img.height, t.width, t.height)
                img = t
        if max(img.size) > MAX_SIDE:
            note += " 超过 %d！" % MAX_SIDE
        data = encode(img)
        # 没变小就保留原文件字节（幂等）；有裁边则一定要写
        if len(data) >= before and not note.startswith("裁边"):
            data = src.read_bytes()
        after = len(data)
        dest = Path(args.out) / src.name if args.out else src
        if args.out:
            try:
                dest = Path(args.out) / src.resolve().relative_to(ROOT)
            except ValueError:
                dest = Path(args.out) / src.name
        if not args.dry_run and (args.out or data != src.read_bytes()):
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
        rows.append((src.as_posix(), before, after, note))

    width = max((len(r[0]) for r in rows), default=4)
    print("%-*s %10s %10s %7s  %s" % (width, "文件", "之前", "之后", "变化", "备注"))
    for name, b, a, note in rows:
        pct = (a - b) * 100.0 / b if b else 0.0
        print("%-*s %10d %10d %6.1f%%  %s" % (width, name, b, a, pct, note))
    tb = sum(r[1] for r in rows)
    ta = sum(r[2] for r in rows)
    print("%-*s %10d %10d %6.1f%%" % (width, "合计 %d 个" % len(rows), tb, ta, (ta - tb) * 100.0 / tb if tb else 0.0))
    return 0


if __name__ == "__main__":
    sys.exit(main())
