#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source tools/cocos/creator.sh
if [ "$#" -gt 0 ]; then die "请运行 ./package.sh，然后输入菜单编号。"; fi

cocos_build() {
  local platform="$1" code=0
  need_cocos
  cocos_build_once "$platform" || code=$?
  [ "$code" -eq 36 ] || die "Cocos 构建 ${platform} 失败（退出码 ${code}）"
  if import_broken; then die 'Cocos 资源导入失败，请检查编辑器生成的 .meta 后重试。'; fi
  echo "构建完成：client/build/$platform"
}

# ---------------------------------------------------------------- 微信小游戏（docs/10 第 4 节）

# 构建 → resources 挪到网上并瘦身（tools/wechat/remote.mjs）→ 有 tcb（云开发命令行）就传到云开发的静态网站托管；NO_UPLOAD=1 只打包不传
wechat_build() {
  local env remote="client/build/wechatgame-remote/remote"
  node tools/native/apply.mjs
  cocos_build wechatgame
  node tools/wechat/remote.mjs
  [ -d "$remote" ] || return 0
  env="$(node -p "require('./game.json').wechat.cloudEnv || ''")"
  if [ "${NO_UPLOAD:-}" = 1 ]; then
    echo "· NO_UPLOAD=1：这次不上传，资源在 ${remote}"
  elif [ -n "$env" ] && command -v tcb >/dev/null 2>&1; then
    echo "· 上传资源到云开发环境 ${env} 的静态网站托管 …"
    tcb hosting deploy "$remote" remote -e "$env" || die "上传失败：先 tcb login，或在云开发控制台「静态网站托管」里手动上传 ${remote} 整个文件夹"
    echo "✓ 资源已上传"
    # 网上只留这次用到的文件：文件名带 MD5，改过的资源换了名字，旧的清掉（tools/wechat/prune.mjs，网上缺文件时不清）
    node tools/wechat/prune.mjs "$env" || echo "! 旧文件没清掉，资源照常能用；下次打包会再清"
  else
    echo "! 还要把 ${remote} 整个文件夹传到静态网站托管的根目录（云开发控制台 → 静态网站托管 → 上传文件夹；装了 tcb 并 tcb login 过会自动传）"
  fi
  echo "微信开发者工具导入 client/build/wechatgame 即可预览、上传"
}

# ---------------------------------------------------------------- 原生包（docs/10-开发底座.md）

# iOS 的 Google Mobile Ads + UMP：下载到 client/native/engine/ios/sdk/（不进仓库），iOS 工程的 CMakeLists 链它。
# game.json 关了广告（ads.enabled 为 false）时不下载，CMakeLists 也不链
ios_sdk() {
  local dir="$CLIENT/native/engine/ios/sdk" tmp
  if [ "$(node -p "require('./game.json').ads.enabled === true")" != true ]; then
    echo "· game.json 关了广告，这次不带广告 SDK"
    return 0
  fi
  [ -d "$dir/GoogleMobileAds.xcframework" ] && return 0
  echo "· 下载 Google Mobile Ads iOS SDK …"
  tmp="$(mktemp -d)"
  curl -fsSL -o "$tmp/sdk.zip" https://dl.google.com/googleadmobadssdk/googlemobileadssdkios.zip || { echo "! SDK 下载失败，这次按没有广告编译"; return 0; }
  (cd "$tmp" && unzip -q sdk.zip)
  mkdir -p "$dir"
  find "$tmp" -maxdepth 3 -name '*.xcframework' -type d -exec cp -R {} "$dir/" \;
  rm -rf "$tmp"
  ls "$dir"
}

# Cocos 3.8.8 预编译的 libwebp.a 和 Xcode 27 的链接器不兼容（成员没对齐），用 libtool 重新打包一份对齐的（iOS 工程的 CMakeLists 用它）
ios_fix_webp() {
  local src dst="$CLIENT/native/engine/ios/sdk/libwebp/libwebp.a"
  src="$(dirname "$(dirname "$COCOS")")/Resources/resources/3d/engine/native/external/ios/libs/libwebp.a"
  [ -f "$dst" ] && [ "$dst" -nt "$src" ] && return 0
  [ -f "$src" ] || { echo "! 没找到 ${src}，跳过"; return 0; }
  mkdir -p "$(dirname "$dst")"
  xcrun libtool -static -o "$dst" "$src" 2>/dev/null || { echo "! libwebp 重新打包失败"; rm -f "$dst"; }
}

# xcode 工程和 scheme：Cocos 按构建配置的 name 起名（name-mobile）
ios_project() {
  local proj
  proj="$(ls -d "$CLIENT"/build/ios/proj/*.xcodeproj 2>/dev/null | head -1)"
  [ -n "$proj" ] || die "没找到 Xcode 工程（client/build/ios/proj/*.xcodeproj），请先在打包菜单中导出 Xcode 工程"
  echo "$proj"
}

ios_build() {
  local mode="${1:-}" proj scheme team
  node tools/native/apply.mjs
  ios_sdk
  ios_fix_webp
  # Preserve the working tree's launch artwork while Creator exports its templates.
  (
    ios_dir="$CLIENT/native/engine/ios"
    saved_launch="$(mktemp -d)"
    for image in "$ios_dir"/LaunchScreenBackground*.png; do
      [ ! -f "$image" ] || cp -p "$image" "$saved_launch/"
    done
    restore_launch() {
      for image in "$saved_launch"/*.png; do
        [ ! -f "$image" ] || cp -p "$image" "$ios_dir/"
      done
      rm -rf "$saved_launch"
    }
    trap restore_launch EXIT
    cocos_build ios
  )
  proj="$(ios_project)"
  scheme="$(basename "$proj" .xcodeproj)-mobile"
  team="$(node -e 'console.log(require("./game.json").ios.team || "")')"
  case "$mode" in
    "") echo "✓ Xcode 工程：${proj}（用 Xcode 打开可以直接装到手机上调试）" ;;
    sim)
      # 只编 arm64（Apple 芯片的 Mac）：Cocos 预编译库的 x86_64 模拟器部分和 Xcode 27 的链接器不兼容
      xcodebuild -project "$proj" -scheme "$scheme" -sdk iphonesimulator -configuration Debug ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
        -derivedDataPath "$CLIENT/build/ios/derived" CODE_SIGNING_ALLOWED=NO build > "$CLIENT/build/ios/sim.log" 2>&1 \
        || { grep -E "error:|BUILD FAILED" "$CLIENT/build/ios/sim.log" | head -30; die "模拟器版编译失败（全文 client/build/ios/sim.log）"; }
      echo "✓ 模拟器版编译通过：client/build/ios/derived/Build/Products/Debug-iphonesimulator/"
      ;;
    dev)
      xcodebuild -project "$proj" -scheme "$scheme" -sdk iphoneos -configuration Release \
        -derivedDataPath "$CLIENT/build/ios/derived-dev" CODE_SIGNING_ALLOWED=NO build > "$CLIENT/build/ios/dev.log" 2>&1 \
        || { grep -E "error:|BUILD FAILED" "$CLIENT/build/ios/dev.log" | sort -u | head -30; die "真机版编译失败（全文 client/build/ios/dev.log）"; }
      echo "✓ 真机版（Release、不签名）编译通过"
      ;;
    ipa)
      [ -n "$team" ] || die "game.json 的 ios.team 还没填（Apple 开发者账号的 Team ID）"
      local out="$CLIENT/build/ios/release"
      rm -rf "$out"; mkdir -p "$out"
      xcodebuild -project "$proj" -scheme "$scheme" -sdk iphoneos -configuration Release \
        -archivePath "$out/app.xcarchive" DEVELOPMENT_TEAM="$team" -allowProvisioningUpdates archive > "$out/archive.log" 2>&1 \
        || { grep -E "error:|ARCHIVE FAILED" "$out/archive.log" | head -30; die "归档失败（全文 client/build/ios/release/archive.log）"; }
      cat > "$out/ExportOptions.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>teamID</key><string>${team}</string>
  <key>signingStyle</key><string>automatic</string>
</dict></plist>
PLIST
      xcodebuild -exportArchive -archivePath "$out/app.xcarchive" -exportPath "$out" \
        -exportOptionsPlist "$out/ExportOptions.plist" -allowProvisioningUpdates > "$out/export.log" 2>&1 \
        || { tail -20 "$out/export.log"; die "导出 ipa 失败"; }
      echo "✓ ipa：$(ls "$out"/*.ipa)（用 Xcode 的 Organizer 或 Transporter 上传）"
      ;;
    *) die "未知的 iOS 产物" ;;
  esac
}

android_build() {
  local mode="${1:-apk}" proj
  node tools/native/apply.mjs
  [ -n "${ANDROID_HOME:-}" ] || [ -d "$HOME/Library/Android/sdk" ] || die "没找到 Android SDK（装 Android Studio，或设 ANDROID_HOME）"
  cocos_build android
  proj="$CLIENT/build/android/proj"
  [ -x "$proj/gradlew" ] || die "没找到 Gradle 工程：$proj"
  case "$mode" in
    project) echo "Gradle 工程：$proj" ;;
    apk) (cd "$proj" && ./gradlew assembleDebug) && echo "✓ apk：$(find "$proj" -name '*.apk' -path '*debug*' | head -1)" ;;
    aab)
      # 签名：RELEASE_STORE_FILE 等四个变量写在 ~/.gradle/gradle.properties（不进仓库，docs/10）
      (cd "$proj" && ./gradlew bundleRelease) && echo "✓ aab：$(find "$proj" -name '*.aab' | head -1)（传到 Google Play Console）" ;;
    *) die "未知的 Android 产物" ;;
  esac
}
# A successful choice builds exactly once; returning from a submenu runs nothing.
read_choice() {
  printf '请输入编号：'
  IFS= read -r choice || exit 0
}

while :; do
  printf '%s\n' '打包平台' '1 微信小游戏' '2 iOS' '3 Android' '4 网页版' '0 退出'
  read_choice
  case "$choice" in
    1) wechat_build; break ;;
    2)
      while :; do
        printf '%s\n' 'iOS 产物' '1 Xcode 工程' '2 模拟器 App' '3 未签名真机 App' '4 IPA' '0 返回'
        read_choice
        case "$choice" in
          1) ios_build; exit ;;
          2) ios_build sim; exit ;;
          3) ios_build dev; exit ;;
          4) ios_build ipa; exit ;;
          0) break ;;
          *) echo '请输入 0 至 4。' ;;
        esac
      done ;;
    3)
      while :; do
        printf '%s\n' 'Android 产物' '1 APK' '2 AAB' '3 Gradle 工程' '0 返回'
        read_choice
        case "$choice" in
          1) android_build apk; exit ;;
          2) android_build aab; exit ;;
          3) android_build project; exit ;;
          0) break ;;
          *) echo '请输入 0 至 3。' ;;
        esac
      done ;;
    4) cocos_build web-mobile; break ;;
    0) exit 0 ;;
    *) echo '请输入 0 至 4。' ;;
  esac
done
