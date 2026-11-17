#!/usr/bin/env bash
# 项目统一入口。不带参数 = 构建网页版并打开试玩。
set -euo pipefail
cd "$(dirname "$0")"
# 原样留一份参数：拉到新代码后用新的 run.sh 重跑一遍
ORIG_ARGS=("$@")

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

试玩（在装了 Cocos Creator 3.8.8 的 Mac 上）：
  (无)                  构建网页版并在浏览器里打开。试玩模式：金币、技能已加满
  level <N>             同上，直接进第 N 关
  auto [起] [止]        同上，由机器人代打：过关自动进下一关、输了重打，一直打到最后一关（看连击、结算、宝箱等画面用）；
                        给了起就从第几关开始，否则从当前关；再给止就打到第几关为止
  page <名字>           同上，启动后直接打开某一页（levels、shop、wheel、daily、tasks…）
  real                  按真实存档进度玩，不加资源
                        以上参数可以连着写：./run.sh real level 65 auto
  serve [同上的参数]    不重新构建，直接打开上次的构建
  build                 只构建网页版 → client/build/web-mobile
  wechat-build          构建微信小游戏包 → client/build/wechatgame
  editor                用 Cocos Creator 打开 client/
  clean                 清掉 Cocos 的缓存（client/library、temp、build、local），资源导入出错时用
  cdp logs [秒] | eval '<表达式>' | shot <图> | burst <目录> <张数> <间隔毫秒> '<JS>'
                        调试：读试玩浏览器的控制台、在页面里求值、截图、连拍

开发（Linux 或 CI，只需要 Node 22 以上）：
  check                 类型检查 + 单元测试 + .meta 与图片压缩检查（与 CI 相同）
  test                  只跑单元测试
  level-gen [起] [止]   按难度曲线生成关卡
  level-verify [文件…]  校验关卡（不给文件就校验全部；--runs=N 改机器人局数）
  meta                  给 client/assets 里缺 .meta 的资源补 .meta（结果要提交）
  art-compress          包体压缩：PNG 调色板量化、家园物件缩到 2 倍、背景音乐转 mp3（改了图后跑）
  font-subset           重新裁剪字体（需要 python3 与 fonttools、brotli）

试玩、serve、build、wechat-build、editor 运行前会先拉当前分支的最新代码（git pull --ff-only；Mac 上先还原 client/ 下
编辑器写的改动）。拉不下来只提示、用当前代码继续。

环境变量：WEB_PORT（本地服务端口，默认 8080）、COCOS_CREATOR（Cocos Creator 可执行文件的路径）、NO_PULL=1（不自动拉代码）
EOF
}

die() { echo "✗ $*" >&2; exit 1; }

need_cocos() {
  [ -x "$COCOS" ] || command -v "$COCOS" >/dev/null || die "找不到 Cocos Creator ${COCOS_VERSION}：装到 /Applications/Cocos/Creator/$COCOS_VERSION/，或用 COCOS_CREATOR=/路径/CocosCreator ./run.sh 指定"
}

# 命令行构建；Cocos 成功时退出码是 36（32 = 参数错误，34 = 构建出错）
cocos_build_once() {
  local platform="$1" code=0
  # Cocos 3.8.8 命令行构建在已有缓存上增量导入时，资源会全被标成 importer "*"、运行黑屏（Mac 上反复遇到）；
  # 每次从空缓存导入最稳。COCOS_KEEP_CACHE=1 可以跳过
  [ "${COCOS_KEEP_CACHE:-}" = "1" ] || rm -rf "$CLIENT/library" "$CLIENT/temp"
  "$COCOS" --project "$CLIENT" --build "configPath=$CLIENT/build-config/$platform.json" || code=$?
  return "$code"
}

# 导入坏了：.meta 被改成 importer "*"（编辑器启动时插件重载和资源库启动抢跑，偶发）
import_broken() {
  grep -rlq '"importer": "\*"' "$CLIENT/assets" --include='*.meta'
}

cocos_build() {
  local platform="$1" code=0 try
  need_cocos
  for try in 1 2 3; do
    code=0
    cocos_build_once "$platform" || code=$?
    if [ "$code" -eq 36 ] && ! import_broken; then break; fi
    if import_broken; then
      echo "! 第 $try 次构建资源导入坏了（importer \"*\"），还原 .meta 后清缓存重来"
      git checkout -- "$CLIENT/assets"
      code=1
    fi
  done
  [ "$code" -eq 36 ] || die "Cocos 构建 $platform 失败（退出码 $code）"
  echo "✓ 已构建 $platform → client/build/$platform"
  # Cocos 可能改写 .meta；Mac 上不提交这些改动，下次拉代码前用 git checkout -- client 还原
  if [ -n "$(git status --porcelain -- client 2>/dev/null)" ]; then
    echo "! Cocos 改动了 client/ 下的文件（多半是 .meta），不要在这台机器上提交："
    git status --short -- client | head -20
  fi
}

# 试玩参数 → 地址栏参数（client/assets/scripts/services/launch.ts 读）：real、level <N>、auto [起] [止]、page <名字>
web_url() {
  local q=""
  while [ $# -gt 0 ]; do
    case "$1" in
      real) q="${q}&real=1" ;;
      level)
        [[ "${2:-}" =~ ^[0-9]+$ ]] || die "用法: ./run.sh level <关卡号>"
        q="${q}&level=$2&play=1"; shift ;;
      auto)
        q="${q}&autoplay=1"
        if [[ "${2:-}" =~ ^[0-9]+$ ]]; then q="${q}&level=$2"; shift; fi
        if [[ "${2:-}" =~ ^[0-9]+$ ]]; then q="${q}&autoTo=$2"; shift; fi ;;
      page)
        [ -n "${2:-}" ] || die "用法: ./run.sh page <页面名>"
        q="${q}&page=$2"; shift ;;
      *) die "不认识的试玩参数：$1（可用 real、level <N>、auto [起] [止]、page <名字>）" ;;
    esac
    shift
  done
  echo "http://localhost:${WEB_PORT}/${q:+?${q#&}}"
}

web_serve() {
  local dir="$CLIENT/build/web-mobile" url
  url="$(web_url "$@")"
  need_file "$dir/index.html" "先跑 ./run.sh build"
  echo "→ ${url}（Ctrl+C 停止）"
  # macOS：用独立的临时 Chrome 配置开一个手机大小的应用窗口，不打扰平时用的浏览器，截图也只截到游戏。
  # 后三个参数：窗口被别的窗口挡住时也照常跑（不然远程截图、连拍时画面是停的）
  local chrome=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome
  if [ -x "$chrome" ]; then
    (sleep 1; "$chrome" --user-data-dir="${TMPDIR:-/tmp}/fishsort-chrome" --no-first-run --remote-debugging-port=9333 \
      --no-default-browser-check --app="$url" --window-size=450,832 \
      --disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling >/dev/null 2>&1) &
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

# 试玩、构建、开编辑器之前先拉当前分支的最新代码（用户 2026-11-17）。NO_PULL=1 ./run.sh … 跳过。
# Mac 上只试玩、不改文件（CLAUDE.md 第 13 条）：client/ 下已跟踪文件的改动是 Cocos 编辑器 / 构建自己写的（.meta、设置），
# 先丢掉再拉，和手动同步的 git checkout -- client && git pull --ff-only 一样；Linux 上不丢任何改动，拉不下来就提示一句照常运行。
# 没网、本地有自己的提交、不在分支上、分支没有远程，都只提示，用当前代码继续
PULLED_NEW=0
pull_latest() {
  [ "${NO_PULL:-}" = "1" ] && return 0
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || return 0
  local branch before after
  branch="$(git symbolic-ref --short -q HEAD)" || { echo "（不在分支上，不拉取）"; return 0; }
  git rev-parse -q --verify '@{u}' >/dev/null 2>&1 || { echo "（$branch 没有对应的远程分支，不拉取）"; return 0; }
  before="$(git rev-parse HEAD)"
  echo "→ 拉取最新代码（$branch）"
  if [ "$(uname)" = "Darwin" ] && [ -n "$(git status --porcelain --untracked-files=no -- client)" ]; then
    echo "  先还原 client/ 下编辑器写的改动："
    git status --porcelain --untracked-files=no -- client | head -5 | sed 's/^/    /'
    git checkout -- client
  fi
  if ! git pull --ff-only -q; then
    echo "⚠ 拉取失败（没网、或本地有改动 / 自己的提交），用当前代码继续" >&2
    return 0
  fi
  after="$(git rev-parse HEAD)"
  if [ "$before" = "$after" ]; then
    echo "  已经是最新"
  else
    git log --oneline "$before..$after" | head -10 | sed 's/^/  /'
    PULLED_NEW=1
  fi
}

cmd="${1:-play}"
case "$cmd" in
  # 试玩参数直接跟在 ./run.sh 后面：整串都交给 play
  real|level|auto|page) cmd=play ;;
  *) if [ $# -gt 0 ]; then shift; fi ;;
esac

case "$cmd" in
  play|serve|build|wechat-build|editor)
    if [ "${RUN_SH_PULLED:-}" != "1" ]; then
      pull_latest
      # 拉到了新代码：用新的 run.sh 重跑（run.sh 自己也可能改了）
      if [ "$PULLED_NEW" = "1" ]; then RUN_SH_PULLED=1 exec ./run.sh ${ORIG_ARGS[@]+"${ORIG_ARGS[@]}"}; fi
    fi
    ;;
esac

case "$cmd" in
  play)
    # 先把参数检查一遍，写错了不用等构建完才知道
    web_url "$@" >/dev/null
    cocos_build web-mobile
    web_serve "$@"
    ;;
  serve)        web_serve "$@" ;;
  build)        cocos_build web-mobile ;;
  wechat-build) cocos_build wechatgame ;;
  editor)
    need_cocos
    exec "$COCOS" --project "$CLIENT" "$@"
    ;;
  clean)
    # 都是 Cocos 生成的缓存，不进仓库；导入状态坏了（资源被标成 importer "*"、黑屏）时清掉重来
    rm -rf client/library client/temp client/build client/local
    echo "✓ 已清掉 client/library、temp、build、local"
    ;;
  cdp)
    node tools/cocos/cdp.mjs "$@"
    ;;
  check)
    need_node_modules
    node tools/cocos/meta.mjs --check
    (cd client && node tools/art/compress.mjs --check)
    # Cocos 3.8 构建用的 Babel 不认「as 后面跟联合类型」，打包脚本会失败，Linux 上的 tsc 查不出来
    if grep -rnE '^[^/]*[^/]\bas [^;,)=]*\|' client/assets/scripts --include='*.ts'; then
      die "上面几处是 as X | Y 的写法，Cocos 构建会失败，换成函数收窄"
    fi
    # Cocos 的 Babel（松散模式）把 [...迭代器] 编成 [].concat(迭代器)：Map / Set 展开出来是错的，用 Array.from
    if grep -rnE '\[\.\.\.(new (Set|Map)|[A-Za-z_.]*\.(values|keys|entries)\(\))' client/assets/scripts --include='*.ts'; then
      die "上面几处展开了 Map / Set / 迭代器，Cocos 构建后结果不对，换成 Array.from(...)"
    fi
    (cd client && npx tsc -p tsconfig.core.json && npx tsc -p tsconfig.tools.json)
    # 用到 cc 的脚本要 Cocos 的类型声明（client/.cc-types，从 Mac 的 Cocos 取，不进仓库）；没有就跳过
    if [ -f client/.cc-types/cc.d.ts ]; then (cd client && npx tsc -p tsconfig.client.json); else echo "（没有 client/.cc-types，跳过界面层类型检查）"; fi
    (cd client && npx tsx --test tests/*.test.ts)
    ;;
  test)
    need_node_modules
    (cd client && npx tsx --test tests/*.test.ts "$@")
    ;;
  level-gen)
    need_node_modules
    (cd client && npx tsx tools/level/gen.ts "$@")
    ;;
  level-verify)
    need_node_modules
    (cd client && npx tsx tools/level/verify.ts "$@")
    ;;
  meta)
    node tools/cocos/meta.mjs "$@"
    ;;
  art-compress)
    # 包体：PNG 量化成调色板、家园物件缩到 2 倍、背景音乐转 mp3；之后补 .meta
    need_node_modules
    (cd client && node tools/art/compress.mjs && node tools/audio/bgm_mp3.mjs)
    node tools/cocos/meta.mjs
    ;;
  font-subset)
    python3 client/tools/font_subset.py "$@"
    ;;
  -h|--help|help) usage ;;
  *) usage; exit 1 ;;
esac
