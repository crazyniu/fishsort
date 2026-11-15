#!/usr/bin/env bash
# 项目统一入口。不带参数 = 直接启动游戏试玩。
set -euo pipefail
cd "$(dirname "$0")"

GODOT="${GODOT:-godot}"

usage() {
  cat <<'EOF'
用法: ./run.sh [命令]

  (无)                  启动游戏试玩
  editor                打开 Godot 编辑器
  test                  跑 src/core 单元测试
  lint                  代码风格检查
  check                 lint + test（与 CI 相同）
  level-gen             生成关卡
  level-verify          全量关卡校验（慢）
  level-verify-changed  只校验改动过的关卡
EOF
}

die() { echo "✗ $*" >&2; exit 1; }

need_godot() {
  command -v "$GODOT" >/dev/null || die "找不到 godot，可用 GODOT=/路径/godot ./run.sh 指定"
  [ -f project.godot ] || die "还没有 project.godot：工程脚手架在里程碑 M0 创建"
}

need_file() { [ -e "$1" ] || die "还没有 $1：$2"; }

# 首次运行或资源有变化时需要先导入
import_if_needed() { [ -d .godot ] || "$GODOT" --headless --import >/dev/null 2>&1 || true; }

cmd="${1:-play}"
[ $# -gt 0 ] && shift

case "$cmd" in
  play)
    need_godot; import_if_needed
    exec "$GODOT" --path . "$@"
    ;;
  editor)
    need_godot
    exec "$GODOT" --path . --editor "$@"
    ;;
  test)
    need_godot; need_file addons/gut/gut_cmdln.gd "GUT 在 M0 安装"
    import_if_needed
    "$GODOT" --headless --path . -s addons/gut/gut_cmdln.gd -gdir=res://tests -ginclude_subdirs -gexit "$@"
    ;;
  lint)
    command -v gdlint >/dev/null || die "找不到 gdlint，先执行: pip install gdtoolkit"
    need_file src "代码目录在 M0 创建"
    gdlint src tools tests
    gdformat --check src tools tests
    ;;
  check)
    "$0" lint
    "$0" test
    ;;
  level-gen)
    need_godot; need_file tools/level/gen.gd "关卡工具在 M1 实现"
    "$GODOT" --headless --path . -s tools/level/gen.gd -- "$@"
    ;;
  level-verify)
    need_godot; need_file tools/level/verify.gd "关卡工具在 M1 实现"
    "$GODOT" --headless --path . -s tools/level/verify.gd -- "$@"
    ;;
  level-verify-changed)
    need_godot; need_file tools/level/verify.gd "关卡工具在 M1 实现"
    base="${BASE_REF:-origin/main}"
    mapfile -t files < <(git diff --name-only --diff-filter=AM "$base" -- 'config/levels/*.json' 2>/dev/null || true)
    if [ ${#files[@]} -eq 0 ]; then echo "没有改动的关卡"; exit 0; fi
    "$GODOT" --headless --path . -s tools/level/verify.gd -- "${files[@]}"
    ;;
  -h|--help|help) usage ;;
  *) usage; exit 1 ;;
esac
