#!/usr/bin/env python3
"""改 / 加文案：python3 tools/i18n_set.py KEY 中文 English [KEY 中文 English ...]。已有的 key 就地改，没有的加到末尾。"""
import csv, io, sys
from pathlib import Path
p = Path(__file__).resolve().parent.parent.parent / 'i18n/strings.csv'
rows = list(csv.reader(io.StringIO(p.read_text(encoding='utf-8'))))
idx = {r[0]: i for i, r in enumerate(rows)}
a = sys.argv[1:]
assert len(a) % 3 == 0, '参数要三个一组'
for k, zh, en in zip(a[::3], a[1::3], a[2::3]):
    if k in idx: rows[idx[k]] = [k, zh, en]
    else: idx[k] = len(rows); rows.append([k, zh, en])
buf = io.StringIO(); csv.writer(buf, lineterminator='\n').writerows(rows)
p.write_text(buf.getvalue(), encoding='utf-8')
