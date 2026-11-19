#!/usr/bin/env python3
"""
难度调整脚本（docs/02 第 0 节）。直接运行，按菜单选：

    python3 difficulty.py

菜单里可以：看每关的目标、改参数（改完自动存回这个文件最上面那一块）、生成关卡（在后台跑，可以关掉终端）、看进度、停止。
也可以直接带英文参数（给脚本、远程用）：

    python3 difficulty.py show [关号 …]          看目标
    python3 difficulty.py gen [起 止] [--commit]  生成（--commit = 校验通过后自动提交推送）
    python3 difficulty.py status                 看进度
    python3 difficulty.py stop                   停止

放在 Mac 上跑（14 核，全部 355 关要几个小时；Linux 4 核更慢）。跑完 Cocos 重新导入后就能玩到新难度。
「能过多少」是用机器人打几十上百局量的（core/solver/players.ts）：尺子选「想几步」时，量的是会看、会想几步的玩家
不用道具能过的比例——和认真玩的真人接近。最低几个百分点时一关只量 40 局，误差有好几个点，看个大概。
"""
import json
import os
import re
import signal
import subprocess
import sys
import time

# ============================== 在这里调难度 ==============================

# 难度曲线：（关卡号, 能过的百分比）。中间按直线连起来；第一个点之前是新手期（不收紧）
难度曲线 = [(5, 95), (6, 85), (360, 1)]

# 每 5 关一个难关、每 20 关一个超难关：比曲线低几个点
难关 = -15
超难关 = -25

# 曲线低了以后改成按比例：难关 = 普通关 × 难关_比例、超难关 = 普通关 × 超难关_比例，和上面「低几个点」取容易的那个。
# 不然后期难关、超难关都压到「最低」，和普通关一样难（0.6 时普通关 37.5% 以下开始按比例，0.4 时 41.7% 以下）
难关_比例 = 0.6
超难关_比例 = 0.4

# 任何一关都不低于这个百分比
最低 = 1

# 单独指定某几关（优先于上面的曲线），比如 {200: 30, 201: 50}
单关 = {}

# 用哪种玩家来量「能过多少」：
#   '想几步'：会看、会想几步再点的人（和认真玩的真人接近）
#   '随手点'：有缸要的就点、不动脑子的人（量出来的数字偏低，同一关对认真玩的人容易得多）
尺子 = '想几步'

# 想几步的玩家每一步在脑子里试多少种走法：越大越聪明，同样的百分比关卡就越难
想几步的深度 = 60

# 保底：想清楚的玩家（每一步试 300 种走法）至少能过多少——不超过「保底_最高」，也不低于「这一关的目标 + 保底_比目标高」。
# 保证认真想一定有路能过；越往后目标越低，保底跟着往下放
保底_最高 = 90
保底_比目标高 = 40

# 局内看得到后面几缸要什么（机器人也按这个看；改了要连局内一起改，平时别动）
预告缸数 = 3

# 难关开局暂存槽里先放几条鱼：从第几关起，[(从第几关起, 几条), …]
开局占格_从第几关起 = 41
开局占格_条数 = [(41, 1), (61, 2)]

# 同时生成几关；0 = 按这台机器的核数自动定
并行数 = 0

# ==========================================================================

ROOT = os.path.dirname(os.path.abspath(__file__))
CURVE = os.path.join(ROOT, 'client/assets/resources/config/level_curve.json')
LOG = os.path.join(ROOT, 'difficulty_run.log')
PID = os.path.join(ROOT, '.difficulty_run.pid')
TOTAL = 360


def _replace_key(text: str, key: str, value) -> str:
    """把 JSON 文本里顶层 "key": {...} 这一项整个换成新的值（只动这一项，文件其余的排版不变）"""
    m = re.search(r'\n(\s*)"%s"\s*:\s*' % re.escape(key), text)
    if not m:
        raise SystemExit(f'level_curve.json 里找不到 "{key}"')
    start = m.end()
    depth = 0
    i = start
    in_str = False
    while i < len(text):
        ch = text[i]
        if in_str:
            if ch == '\\':
                i += 1
            elif ch == '"':
                in_str = False
        elif ch == '"':
            in_str = True
        elif ch in '{[':
            depth += 1
        elif ch in '}]':
            depth -= 1
            if depth == 0:
                i += 1
                break
        i += 1
    return text[:start] + json.dumps(value, ensure_ascii=False) + text[i:]


def _knot(points, level):
    """折线取值（和 LevelCurve.knot 一样）：第一个点之前、最后一个点之后取端点"""
    if level <= points[0][0]:
        return points[0][1]
    for (a, va), (b, vb) in zip(points, points[1:]):
        if level <= b:
            return va + (level - a) * (vb - va) / (b - a)
    return points[-1][1]


def _check():
    if 尺子 not in ('想几步', '随手点'):
        raise SystemExit("尺子只能是 '想几步' 或 '随手点'")
    pts = sorted(难度曲线)
    if len(pts) < 2:
        raise SystemExit('难度曲线至少要两个点：新手期最后一关、第一个正式关')
    for lv, pct in pts:
        if not (0 <= pct <= 100):
            raise SystemExit(f'难度曲线第 {lv} 关的 {pct}% 不在 0–100 之间')
    return pts


def _targets():
    """写进 level_curve.json 的 route 那一项（比例用 0–1）"""
    pts = _check()
    return {
        'tutorial': [[pts[0][0], pts[0][1] / 100]],
        'line': [[lv, pct / 100] for lv, pct in pts[1:]],
        'hard': 难关 / 100,
        'boss': 超难关 / 100,
        'hardRatio': 难关_比例,
        'bossRatio': 超难关_比例,
        'min': 最低 / 100,
        'overrides': {str(k): v / 100 for k, v in 单关.items()},
    }


def write_config():
    with open(CURVE, encoding='utf-8') as f:
        text = f.read()
    curve = json.loads(text)
    route = curve['route']
    route['preview'] = 预告缸数
    route['targets'] = _targets()
    route['ruler'] = {'kind': 'think', 'budget': 想几步的深度, 'games': 40, 'checkGames': 100} if 尺子 == '想几步' else {'kind': 'casual', 'games': 200, 'checkGames': 500}
    route['floor'] = {'max': 保底_最高 / 100, 'gap': 保底_比目标高 / 100}
    prefill = curve.get('prefill', {'after': 0.5})
    prefill['from'] = 开局占格_从第几关起
    prefill['count'] = [[a, b] for a, b in 开局占格_条数]
    text = _replace_key(text, 'route', route)
    text = _replace_key(text, 'prefill', prefill)
    json.loads(text)  # 写坏了就别存
    with open(CURVE, 'w', encoding='utf-8') as f:
        f.write(text)


def kind_of(level: int) -> str:
    """和 LevelCurve 一样：每 20 关超难关、每 5 关难关（新手期之后）"""
    if level >= 6 and level % 20 == 0:
        return '超难关'
    if level > 5 and level % 5 == 0:
        return '难关'
    return '普通关'


def target_of(level: int):
    pts = _check()
    if level in 单关:
        return 单关[level]
    if level < pts[1][0]:
        return pts[0][1] if level >= pts[0][0] else None
    v = _knot(pts[1:], level)
    k = kind_of(level)
    if k == '超难关':
        v = max(v + 超难关, v * 超难关_比例)
    elif k == '难关':
        v = max(v + 难关, v * 难关_比例)
    return max(最低, round(v, 1))


def floor_of(level: int):
    t = target_of(level)
    return None if t is None else min(保底_最高, round(t + 保底_比目标高))


def cmd_show(levels):
    if not levels:
        levels = [5, 6, 7, 10, 20, 31, 35, 60, 61, 65, 100, 101, 105, 120, 150, 151, 155, 180, 201, 205, 220, 251, 255, 260, 301, 305, 320, 359, 360]
    print(f'尺子：{尺子}（{"每步试 %d 种走法" % 想几步的深度 if 尺子 == "想几步" else "不动脑子"}），预告 {预告缸数} 缸')
    print(f'{"关":>5}  {"类型":<4}  {"能过":>6}  {"想清楚的保底":>8}')
    for lv in levels:
        t = target_of(lv)
        if t is None:
            print(f'{lv:>5}  新手期（不收紧）')
            continue
        print(f'{lv:>5}  {kind_of(lv):<4}  {t:>5}%  {floor_of(lv):>7}%')


def _running():
    if not os.path.exists(PID):
        return None
    try:
        pid = int(open(PID).read().strip())
        os.kill(pid, 0)
        return pid
    except (ValueError, OSError):
        return None


def cmd_run(args):
    if _running():
        raise SystemExit('后台已经有一次生成在跑：先在菜单里看进度，或者停止它')
    commit = '--commit' in args
    resume = '--resume' in args
    nums = [int(a) for a in args if a.isdigit()]
    lo, hi = (nums[0], nums[1]) if len(nums) >= 2 else (nums[0], nums[0]) if nums else (6, TOTAL)
    jobs = 并行数 or max(1, (os.cpu_count() or 4) - 2)
    write_config()
    steps = [
        f'./run.sh level-route {lo} {hi} --jobs={jobs} --lab' + (' --resume' if resume else ''),
        './run.sh meta',
        './run.sh level-fixref',
        './run.sh level-verify --measure',
    ]
    if commit:
        steps.append(
            'git add client/assets/resources/config/levels client/assets/resources/config/levels_lab client/assets/resources/config/level_curve.json'
            f' && git commit -q -m "levels: 按 difficulty.py 重新生成第 {lo}–{hi} 关" && git push -q'
        )
    script = ' && '.join(f'{{ echo "@@步骤 {s}"; {s}; }}' for s in steps)
    script += ' && echo "@@完成" || echo "@@出错（往上看是哪一步）"'
    with open(LOG, 'w', encoding='utf-8') as f:
        f.write(f'@@开始 {time.strftime("%Y-%m-%d %H:%M:%S")} 第 {lo}–{hi} 关，并行 {jobs}\n')
    p = subprocess.Popen(['bash', '-c', script], cwd=ROOT, stdout=open(LOG, 'a'), stderr=subprocess.STDOUT, start_new_session=True)
    with open(PID, 'w') as f:
        f.write(str(p.pid))
    print(f'已经在后台开始生成第 {lo}–{hi} 关（并行 {jobs}）。可以关掉这个终端。')
    print('看进度：再运行 python3 difficulty.py，选「看进度」')
    print(f'全部输出：{LOG}')


def cmd_status():
    if not os.path.exists(LOG):
        print('还没跑过')
        return
    lines = open(LOG, encoding='utf-8', errors='replace').read().splitlines()
    head = next((l for l in lines if l.startswith('@@开始')), '')
    prog = [l for l in lines if re.match(r'^\[\d+/\d+', l)]
    done = any(l.startswith('@@完成') for l in lines)
    bad = any(l.startswith('@@出错') for l in lines)
    print(head.replace('@@开始 ', '开始：'))
    if prog:
        m = re.match(r'^\[(\d+)/(\d+)(?: ([\d.]+) 分)?\]', prog[-1])
        n, total = int(m.group(1)), int(m.group(2))
        mins = float(m.group(3)) if m.group(3) else None
        eta = f'，大约还要 {round(mins / n * (total - n))} 分钟' if mins and n and not done else ''
        print(f'生成：{n}/{total} 关{eta}')
        for l in prog[-5:]:
            print('  ' + l)
    step = [l for l in lines if l.startswith('@@步骤')]
    if step:
        print('现在这一步：' + step[-1].replace('@@步骤 ', ''))
    for l in lines:
        if '离目标超过' in l or l.startswith('  第 ') or '关，成功' in l or l.startswith('校验 '):
            print(l)
    if done:
        print('✓ 全部跑完。Cocos 重新导入后就能玩到新难度')
    elif bad:
        print('✗ 出错了，看 ' + LOG)
    elif _running():
        print('（还在跑）')
    else:
        print('（没在跑，也没跑完：可能被停掉了）')


def cmd_stop():
    pid = _running()
    if not pid:
        print('后台没有在跑的生成')
        return
    os.killpg(pid, signal.SIGTERM)
    print('已停掉。已经生成好的关保留着；要接着跑，在菜单里选「生成关卡」，会问要不要接着上次的跑')


# ------------------------------ 菜单 ------------------------------

# 菜单里能改的参数：（变量名，说明）。改完写回这个文件最上面那一块的同名一行
PARAMS = [
    ('难度曲线', '[(关卡号, 能过的百分比), …]，中间连直线；第一个点之前是新手期'),
    ('难关', '每 5 关的难关比曲线低几个点（写负数）'),
    ('超难关', '每 20 关的超难关比曲线低几个点（写负数）'),
    ('难关_比例', '曲线低了以后难关 = 普通关 × 几（0–1），和「低几个点」取容易的'),
    ('超难关_比例', '曲线低了以后超难关 = 普通关 × 几（0–1）'),
    ('最低', '任何一关不低于几 %'),
    ('单关', '单独指定某几关，如 {200: 30, 201: 50}；清空写 {}'),
    ('尺子', "'想几步' 或 '随手点'（要带引号）"),
    ('想几步的深度', '想几步的玩家每步试几种走法，越大越聪明、关卡越难'),
    ('保底_最高', '想清楚的玩家至少能过几 %（上限）'),
    ('保底_比目标高', '想清楚的保底 = 这一关的目标 + 几个点（不超过上面的上限）'),
    ('开局占格_从第几关起', '难关开局暂存槽先放鱼，从第几关起'),
    ('开局占格_条数', '[(从第几关起, 几条), …]'),
    ('并行数', '同时生成几关，0 = 按核数自动'),
]


def _ask(prompt: str, default: str = '') -> str:
    try:
        v = input(prompt).strip()
    except EOFError:
        print()
        return default
    return v or default


def _ask_range():
    v = _ask(f'生成哪几关？直接回车 = 第 6–{TOTAL} 关全部；一关写 200；一段写 200 260：')
    nums = [int(x) for x in re.findall(r'\d+', v)]
    if not nums:
        return 6, TOTAL
    lo, hi = (nums[0], nums[1]) if len(nums) >= 2 else (nums[0], nums[0])
    lo, hi = max(6, min(lo, hi)), min(TOTAL, max(lo, hi))
    return lo, hi


def _save_param(name: str, value) -> None:
    """把这个文件里 `名字 = …` 那一行换成新值，并更新内存里的值"""
    path = os.path.abspath(__file__)
    text = open(path, encoding='utf-8').read()
    line = f'{name} = {value!r}'
    new, n = re.subn(r'(?m)^%s = .*$' % re.escape(name), lambda _: line, text, count=1)
    if n != 1:
        raise SystemExit(f'这个文件里找不到「{name} = 」那一行')
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new)
    globals()[name] = value


def menu_params():
    import ast
    while True:
        print('\n当前参数：')
        for i, (name, _) in enumerate(PARAMS, 1):
            print(f'  {i:>2}. {name} = {globals()[name]!r}')
        v = _ask('改第几项？（直接回车返回）：')
        if not v:
            return
        if not v.isdigit() or not (1 <= int(v) <= len(PARAMS)):
            print('没有这一项')
            continue
        name, note = PARAMS[int(v) - 1]
        print(f'{name}：{note}')
        raw = _ask(f'新的值（现在是 {globals()[name]!r}，直接回车不改）：')
        if not raw:
            continue
        try:
            value = ast.literal_eval(raw)
        except (ValueError, SyntaxError):
            print('看不懂这个值，照上面的格式写（文字要带引号）')
            continue
        old = globals()[name]
        globals()[name] = value
        try:
            _check()
            target_of(6)
        except (SystemExit, Exception) as e:  # noqa: BLE001
            globals()[name] = old
            print(f'这个值不行：{e}')
            continue
        _save_param(name, value)
        print(f'已存：{name} = {value!r}')


def _last_unfinished():
    """上次生成停在半路就返回（起, 止），否则 None"""
    if not os.path.exists(LOG):
        return None
    text = open(LOG, encoding='utf-8', errors='replace').read()
    m = re.search(r'@@开始 .*? 第 (\d+)–(\d+) 关', text)
    if not m or '@@完成' in text or '@@步骤 ./run.sh meta' in text:
        return None
    return int(m.group(1)), int(m.group(2))


def menu():
    while True:
        busy = _running()
        print('\n======== 难度调整 ========' + ('（后台正在生成）' if busy else ''))
        print('  1. 看每关的目标')
        print('  2. 改参数')
        print('  3. 生成关卡（后台跑）')
        print('  4. 看进度')
        print('  5. 停止后台生成')
        print('  0. 退出')
        v = _ask('选一项：')
        if v in ('0', 'q', ''):
            return
        if v == '1':
            raw = _ask('看哪几关？空格隔开，直接回车 = 一组常看的：')
            cmd_show([int(x) for x in re.findall(r'\d+', raw)])
        elif v == '2':
            menu_params()
        elif v == '3':
            if busy:
                print('后台已经有一次生成在跑，先看进度或者停止它')
                continue
            last = _last_unfinished()
            resume = False
            if last and _ask(f'上次第 {last[0]}–{last[1]} 关没跑完，接着跑？（跳过已经生成好的）(Y/n)：').lower() != 'n':
                lo, hi, resume = last[0], last[1], True
            else:
                lo, hi = _ask_range()
            commit = _ask('校验通过后自动提交并推送？(y/N)：').lower() == 'y'
            print(f'将按当前参数生成第 {lo}–{hi} 关（{hi - lo + 1} 关）' + ('，完成后自动提交推送' if commit else '，生成的文件不提交'))
            if _ask('确定？(y/N)：').lower() == 'y':
                cmd_run([str(lo), str(hi)] + (['--commit'] if commit else []) + (['--resume'] if resume else []))
        elif v == '4':
            cmd_status()
        elif v == '5':
            if busy and _ask('确定停掉？已经生成好的关保留着 (y/N)：').lower() == 'y':
                cmd_stop()
            elif not busy:
                print('后台没有在跑的生成')
        else:
            print('没有这一项')


def main():
    args = sys.argv[1:]
    if not args:
        menu()
        return
    cmd, rest = args[0], args[1:]
    if cmd == 'show':
        cmd_show([int(a) for a in rest if a.isdigit()])
    elif cmd == 'gen':
        cmd_run(rest)
    elif cmd == 'status':
        cmd_status()
    elif cmd == 'stop':
        cmd_stop()
    else:
        print(__doc__)


if __name__ == '__main__':
    main()
