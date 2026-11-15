#!/usr/bin/env bash
# 项目统一入口。不带参数 = 直接启动游戏试玩。
set -euo pipefail
cd "$(dirname "$0")"

# 找 Godot：优先用 GODOT 环境变量，其次 PATH，最后是 macOS 的应用程序目录
find_godot() {
  if [ -n "${GODOT:-}" ]; then echo "$GODOT"; return; fi
  if command -v godot >/dev/null 2>&1; then echo godot; return; fi
  local app bin
  for app in /Applications/Godot*.app "$HOME"/Applications/Godot*.app; do
    for bin in "$app"/Contents/MacOS/*; do
      if [ -x "$bin" ]; then echo "$bin"; return; fi
    done
  done
  echo godot
}
GODOT="$(find_godot)"

usage() {
  cat <<'EOF'
用法: ./run.sh [命令]

  (无)                  启动游戏试玩（金币、星星、鱼票、道具已加满，方便测试）
                        FISHSORT_LEVEL=65 ./run.sh 直接跳到第 65 关（仅试玩模式）
  real                  启动游戏，按真实存档进度玩，不加资源
  editor                打开 Godot 编辑器
  test                  跑 src/core 单元测试
  lint                  代码风格检查
  check                 lint + test（与 CI 相同）
  level-gen             生成关卡
  level-verify          全量关卡校验（慢）
  level-verify-changed  只校验改动过的关卡
  font-subset           重新裁剪字体（需要 python3 与 fonttools、brotli）
EOF
}

die() { echo "✗ $*" >&2; exit 1; }

need_godot() {
  command -v "$GODOT" >/dev/null || die "找不到 Godot：请把 Godot.app 放进「应用程序」目录，或用 GODOT=/路径/godot ./run.sh 指定"
}

need_file() { [ -e "$1" ] || die "还没有 $1：$2"; }

# 刷新 Godot 的类名缓存与资源导入；新增脚本后 headless 工具依赖它
import_project() {
  # 全新检出时要导入两遍：第一遍字体还没导入完，引用它的资源会报错
  [ -d .godot ] || "$GODOT" --headless --path . --import >/dev/null 2>&1 || true
  "$GODOT" --headless --path . --import >/dev/null 2>&1 || true
}

cmd="${1:-play}"
[ $# -gt 0 ] && shift

case "$cmd" in
  play)
    need_godot; import_project
    # 默认把金币、星星、鱼票、道具加满方便测试；想按真实进度玩用 ./run.sh real
    # FISHSORT_LEVEL=N 可直接跳到第 N 关，由 save_service 读取
    FISHSORT_BOOST=1 exec "$GODOT" --path . "$@"
    ;;
  real)
    need_godot; import_project
    exec "$GODOT" --path . "$@"
    ;;
  editor)
    need_godot
    exec "$GODOT" --path . --editor "$@"
    ;;
  test)
    need_godot; import_project
    "$GODOT" --headless --path . -s tests/run_tests.gd "$@"
    ;;
  lint)
    command -v gdlint >/dev/null || die "找不到 gdlint，先执行: pip install gdtoolkit"
    gdlint src tools tests
    gdformat --check src tools tests
    ;;
  check)
    "$0" lint
    "$0" test
    ;;
  level-gen)
    need_godot; import_project
    "$GODOT" --headless --path . -s tools/level/gen.gd -- "$@"
    ;;
  level-verify)
    need_godot; import_project
    "$GODOT" --headless --path . -s tools/level/verify.gd -- "$@"
    ;;
  level-verify-changed)
    need_godot; import_project
    base="${BASE_REF:-origin/main}"
    files="$(git diff --name-only --diff-filter=AM "$base" -- 'config/levels/*.json' 2>/dev/null || true)"
    if [ -z "$files" ]; then echo "没有改动的关卡"; exit 0; fi
    # 关卡文件名不含空格，按空白拆分即可（兼容 macOS 自带的 bash 3.2）
    # shellcheck disable=SC2086
    "$GODOT" --headless --path . -s tools/level/verify.gd -- $files
    ;;
  font-subset)
    python3 tools/font/subset.py "$@"
    ;;
  -h|--help|help) usage ;;
  *) usage; exit 1 ;;
esac
