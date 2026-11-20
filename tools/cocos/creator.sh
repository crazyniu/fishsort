# Shared by run.sh and package.sh after changing to the repository root.
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

die() { echo "✗ $*" >&2; exit 1; }

need_cocos() {
  [ -x "$COCOS" ] || command -v "$COCOS" >/dev/null || die "找不到 Cocos Creator ${COCOS_VERSION}：装到 /Applications/Cocos/Creator/$COCOS_VERSION/，或用 COCOS_CREATOR 指定路径"
}

# 命令行构建；Cocos 成功时退出码是 36（32 = 参数错误，34 = 构建出错）
cocos_build_once() {
  local platform="$1" code=0
  # Cocos 3.8.8 命令行构建在已有缓存上增量导入时，资源会全被标成 importer "*"、运行黑屏（Mac 上反复遇到）；
  # 每次从空缓存导入最稳。COCOS_KEEP_CACHE=1 可以跳过
  [ "${COCOS_KEEP_CACHE:-}" = "1" ] || rm -rf "$CLIENT/library" "$CLIENT/temp"
  # COCOS_BUILD_CONFIG：换一份构建参数（安卓要带本机的 SDK、NDK 路径，package.sh 生成一份不进仓库的）
  "$COCOS" --project "$CLIENT" --build "configPath=${COCOS_BUILD_CONFIG:-$CLIENT/build-config/$platform.json}" || code=$?
  return "$code"
}

# 导入坏了：.meta 被改成 importer "*"（编辑器启动时插件重载和资源库启动抢跑，偶发）
import_broken() {
  grep -rlq '"importer": "\*"' "$CLIENT/assets" --include='*.meta'
}
