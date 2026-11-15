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

# 找 Cocos Creator：优先用 COCOS_CREATOR 环境变量，其次 macOS 上 3.8.8 的默认安装位置
COCOS_VERSION=3.8.8
find_cocos() {
  if [ -n "${COCOS_CREATOR:-}" ]; then echo "$COCOS_CREATOR"; return; fi
  local bin
  for bin in /Applications/Cocos/Creator/$COCOS_VERSION/CocosCreator.app/Contents/MacOS/CocosCreator \
             "$HOME"/Applications/Cocos/Creator/$COCOS_VERSION/CocosCreator.app/Contents/MacOS/CocosCreator; do
    if [ -x "$bin" ]; then echo "$bin"; return; fi
  done
  echo CocosCreator
}
COCOS="$(find_cocos)"
CLIENT="$PWD/client"
WEB_PORT="${WEB_PORT:-8080}"

usage() {
  cat <<'EOF'
用法: ./run.sh [命令]

  (无)                  启动游戏试玩（金币、星星、鱼票、道具已加满，方便测试）
                        FISHSORT_LEVEL=65 ./run.sh 直接跳到第 65 关（仅试玩模式）
                        FISHSORT_AUTOPLAY=1 ./run.sh 机器人代打（仅调试构建，验收用）
  real                  启动游戏，按真实存档进度玩，不加资源
  editor                打开 Godot 编辑器
  test                  跑 src/core 单元测试
  lint                  代码风格检查
  check                 lint + test（与 CI 相同）
  level-gen             生成关卡
  level-verify          全量关卡校验（慢）
  level-verify-changed  只校验改动过的关卡
  font-subset           重新裁剪字体（需要 python3 与 fonttools、brotli）
  golden <目录>         导出黄金数据给 Cocos 版做对比（Godot 版核心逻辑在固定输入下的输出）

Cocos 版（client/，迁移中，见 docs/09）：
  web [real]            构建 web-mobile，起本地服务并在浏览器里打开（端口 WEB_PORT，默认 8080）
                        默认试玩模式（金币、技能加满）；real = 按真实存档；
                        FISHSORT_LEVEL=65 跳到第 65 关，FISHSORT_AUTOPLAY=1 机器人代打
  web-build             只构建 web-mobile → client/build/web-mobile
  web-serve             不重新构建，直接起服务打开上次的构建
  wechat-build          构建微信小游戏包 → client/build/wechatgame
  cocos-editor          用 Cocos Creator 打开 client/
  meta                  给 client/assets 里缺 .meta 的资源补 .meta（Linux 上跑，结果要提交）
  ts-test               client/ 的 TypeScript 单测（Node，Linux 上跑）
  ts-check              类型检查 + 单测 + .meta 检查
  ts-level-verify       用 TS 版核心校验 client/ 里的全部关卡（--runs=N，或给文件名只校验这些）
  ts-level-gen          用 TS 版核心生成关卡 [起始关] [结束关]
EOF
}

die() { echo "✗ $*" >&2; exit 1; }

need_godot() {
  command -v "$GODOT" >/dev/null || die "找不到 Godot：请把 Godot.app 放进「应用程序」目录，或用 GODOT=/路径/godot ./run.sh 指定"
}

need_cocos() {
  [ -x "$COCOS" ] || command -v "$COCOS" >/dev/null || die "找不到 Cocos Creator ${COCOS_VERSION}：装到 /Applications/Cocos/Creator/$COCOS_VERSION/，或用 COCOS_CREATOR=/路径/CocosCreator ./run.sh 指定"
}

# 命令行构建；Cocos 成功时退出码是 36（32 = 参数错误，34 = 构建出错）
cocos_build() {
  local platform="$1" code=0
  need_cocos
  "$COCOS" --project "$CLIENT" --build "configPath=$CLIENT/build-config/$platform.json" || code=$?
  [ "$code" -eq 36 ] || die "Cocos 构建 $platform 失败（退出码 ${code}）"
  echo "✓ 已构建 $platform → client/build/$platform"
  # Cocos 可能改写 .meta；Mac 上不提交这些改动，下次拉代码前用 git checkout -- client 还原
  if [ -n "$(git status --porcelain -- client 2>/dev/null)" ]; then
    echo "! Cocos 改动了 client/ 下的文件（多半是 .meta），不要在这台机器上提交："
    git status --short -- client
  fi
}

# 调试开关走网页地址参数（client/assets/scripts/services/launch.ts）
web_url() {
  local q=""
  [ "${1:-}" = "real" ] && q="${q}&real=1"
  [ -n "${FISHSORT_LEVEL:-}" ] && q="${q}&level=${FISHSORT_LEVEL}"
  [ "${FISHSORT_AUTOPLAY:-}" = "1" ] && q="${q}&autoplay=1"
  echo "http://localhost:${WEB_PORT}/${q:+?${q#&}}"
}

web_serve() {
  local dir="$CLIENT/build/web-mobile" url
  url="$(web_url "${1:-}")"
  need_file "$dir/index.html" "先跑 ./run.sh web-build"
  echo "→ ${url}（Ctrl+C 停止）"
  # macOS：用独立的临时 Chrome 配置开一个手机大小的应用窗口，不打扰平时用的浏览器，截图也只截到游戏
  local chrome=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome
  if [ -x "$chrome" ]; then
    (sleep 1; "$chrome" --user-data-dir="${TMPDIR:-/tmp}/fishsort-chrome" --no-first-run \
      --no-default-browser-check --app="$url" --window-size=450,832 >/dev/null 2>&1) &
  elif command -v open >/dev/null; then
    (sleep 1; open "$url") &
  fi
  exec python3 -m http.server "$WEB_PORT" --bind 127.0.0.1 --directory "$dir"
}

need_node_modules() {
  command -v node >/dev/null || die "找不到 node（需要 Node 22 以上）"
  [ -d client/node_modules ] || (cd client && npm ci)
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
  golden)
    need_godot; import_project
    [ $# -ge 1 ] || die "用法: ./run.sh golden <输出目录> [--runs=N]"
    "$GODOT" --headless --path . -s tools/golden/export.gd -- "$@"
    ;;
  web)
    cocos_build web-mobile
    web_serve "$@"
    ;;
  web-build)    cocos_build web-mobile ;;
  web-serve)    web_serve "$@" ;;
  wechat-build) cocos_build wechatgame ;;
  cocos-editor)
    need_cocos
    exec "$COCOS" --project "$CLIENT" "$@"
    ;;
  meta)
    node tools/cocos/meta.mjs "$@"
    ;;
  ts-test)
    need_node_modules
    (cd client && npx tsx --test tests/*.test.ts "$@")
    ;;
  ts-check)
    need_node_modules
    node tools/cocos/meta.mjs --check
    # Cocos 3.8 构建用的 Babel 不认「as 后面跟联合类型」，打包脚本会失败，Linux 上的 tsc 查不出来
    if grep -rnE '^[^/]*[^/]\bas [^;,)=]*\|' client/assets/scripts --include='*.ts'; then
      die "上面几处是 as X | Y 的写法，Cocos 构建会失败，换成函数收窄"
    fi
    (cd client && npx tsc -p tsconfig.core.json && npx tsc -p tsconfig.tools.json)
    # 用到 cc 的脚本要 Cocos 的类型声明（client/.cc-types，从 Mac 的 Cocos 取，不进仓库）；没有就跳过
    if [ -f client/.cc-types/cc.d.ts ]; then (cd client && npx tsc -p tsconfig.client.json); else echo "（没有 client/.cc-types，跳过界面层类型检查）"; fi
    (cd client && npx tsx --test tests/*.test.ts)
    ;;
  ts-level-verify)
    need_node_modules
    (cd client && npx tsx tools/level/verify.ts "$@")
    ;;
  ts-level-gen)
    need_node_modules
    (cd client && npx tsx tools/level/gen.ts "$@")
    ;;
  -h|--help|help) usage ;;
  *) usage; exit 1 ;;
esac
