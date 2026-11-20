#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
source tools/cocos/creator.sh
if [ "$#" -gt 0 ]; then die "请运行 ./package.sh，然后输入菜单编号。"; fi

# 难度调试的各档关卡（约 20 MB）只给开发版用，打的包里不要（docs/10 第 9 节）：构建前挪出 assets，构建完挪回来。
# 构建前本来就清空导入缓存（cocos_build_once），挪走的文件不会残留在包里。中途被打断没挪回来的，下次运行开头先挪回来
LAB_DIR="$CLIENT/assets/resources/config/levels_lab"
LAB_STASH="$CLIENT/.levels_lab_stash"
lab_restore() {
  [ -d "$LAB_STASH" ] || return 0
  [ -e "$LAB_DIR" ] && die "${LAB_STASH} 和 ${LAB_DIR} 都在，手动看一下留哪个（levels_lab 在 git 里，可以 git checkout 恢复）"
  mv "$LAB_STASH/levels_lab" "$LAB_DIR"
  [ ! -f "$LAB_STASH/levels_lab.meta" ] || mv "$LAB_STASH/levels_lab.meta" "$LAB_DIR.meta"
  rmdir "$LAB_STASH"
}
lab_restore

cocos_build() {
  local platform="$1" code=0
  need_cocos
  if [ -d "$LAB_DIR" ]; then
    mkdir -p "$LAB_STASH"
    mv "$LAB_DIR" "$LAB_STASH/levels_lab"
    [ ! -f "$LAB_DIR.meta" ] || mv "$LAB_DIR.meta" "$LAB_STASH/levels_lab.meta"
    echo "· 难度调试的数据不进包（构建完挪回来）"
  fi
  cocos_build_once "$platform" || code=$?
  lab_restore
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
  # 只有 IPA（传 App Store）用真实广告位，其它产物用 Google 的测试广告位（tools/native/apply.mjs）
  FS_RELEASE="$([ "$mode" = ipa ] && echo 1 || echo 0)" node tools/native/apply.mjs
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
    phone)
      # 签名后装到和这台 Mac 配对的 iPhone 上（USB 或同一网络都行），装完启动；广告用 Google 的测试广告位
      [ -n "$team" ] || die "game.json 的 ios.team 还没填（Apple 开发者账号的 Team ID）"
      local log="$CLIENT/build/ios/phone.log" app udid
      xcodebuild -project "$proj" -scheme "$scheme" -sdk iphoneos -configuration Release \
        -derivedDataPath "$CLIENT/build/ios/derived-phone" DEVELOPMENT_TEAM="$team" CODE_SIGN_STYLE=Automatic \
        -allowProvisioningUpdates build > "$log" 2>&1 \
        || { grep -E "error:|BUILD FAILED" "$log" | sort -u | head -30; die "签名版编译失败（全文 client/build/ios/phone.log）"; }
      # Cocos 生成的工程把产物放在 proj/Release-iphoneos/（不在 derivedData 里）；两处都找，取最新的
      app="$(ls -td "$CLIENT"/build/ios/proj/Release-iphoneos/*.app "$CLIENT"/build/ios/derived-phone/Build/Products/Release-iphoneos/*.app 2>/dev/null | head -1 || true)"
      [ -n "$app" ] || die "编译通过了，但没找到打好的 App（client/build/ios/proj/Release-iphoneos/）"
      codesign -dv "$app" 2>&1 | grep "TeamIdentifier=$team" >/dev/null || die "${app} 没有用 ${team} 签名（全文 client/build/ios/phone.log）"
      # 配对过、现在连得上的 iPhone（第一部）
      xcrun devicectl list devices --json-output "$CLIENT/build/ios/devices.json" >/dev/null 2>&1 || true
      udid="$(node -e '
        const d = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).result.devices;
        const ok = d.filter((x) => x.hardwareProperties?.deviceType === "iPhone" && x.connectionProperties?.pairingState === "paired" && x.connectionProperties?.tunnelState !== "unavailable");
        console.log(ok[0]?.hardwareProperties?.udid ?? "");
      ' "$CLIENT/build/ios/devices.json" 2>/dev/null)"
      [ -n "$udid" ] || die "没找到连着的 iPhone（手机解锁、和这台 Mac 在同一网络或插上线；第一次要在 Xcode → Devices 里配对，手机上打开「开发者模式」）。App 在 ${app}"
      xcrun devicectl device install app --device "$udid" "$app" >> "$log" 2>&1 || { tail -15 "$log"; die "装到手机失败"; }
      xcrun devicectl device process launch --device "$udid" "$(node -p 'require("./game.json").ios.bundleId')" >> "$log" 2>&1 \
        && echo "✓ 已装到手机并打开（测试广告位）" || echo "✓ 已装到手机（没能自动打开：手机锁着的话解锁后点图标）"
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

# Google Play 的上传密钥（docs/10 第 4 节）：签名配置写在 ~/.gradle/gradle.properties（不进仓库）。
# 第一次打 AAB 时没有就在这里生成：密码由用户自己输入，密钥文件放在仓库外面，提醒备份（丢了要找 Google 重置）
GRADLE_PROPS="$HOME/.gradle/gradle.properties"
find_keytool() {
  local k
  for k in "$(command -v keytool 2>/dev/null)" "${JAVA_HOME:-}/bin/keytool" \
           "/Applications/Android Studio.app/Contents/jbr/Contents/Home/bin/keytool" \
           "$(/usr/libexec/java_home 2>/dev/null)/bin/keytool"; do
    if [ -n "$k" ] && [ -x "$k" ] && "$k" -help >/dev/null 2>&1; then echo "$k"; return; fi
  done
}
android_upload_key() {
  local store pw pw2 kt
  store="$(grep -E '^RELEASE_STORE_FILE=' "$GRADLE_PROPS" 2>/dev/null | tail -1 | cut -d= -f2-)"
  if [ -n "$store" ]; then
    [ -f "$store" ] || die "~/.gradle/gradle.properties 里的上传密钥 ${store} 不存在（换了电脑？从备份拷回来）"
    echo "· 上传密钥：${store}"
    return 0
  fi
  kt="$(find_keytool)"
  [ -n "$kt" ] || die "没找到 keytool（装 Android Studio 或 JDK）"
  echo "还没有 Google Play 的上传密钥，现在生成一个（只做一次）。"
  echo "密码只有你知道；密钥文件和密码都要备份好，丢了就不能更新游戏，要找 Google 重置。"
  printf '密钥文件放哪（回车 = %s）：' "$HOME/keys/bubblefish-upload.jks"
  IFS= read -r store || exit 1
  store="${store:-$HOME/keys/bubblefish-upload.jks}"
  [ ! -e "$store" ] || die "${store} 已经存在：要用它就手动把四个 RELEASE_ 变量写进 ~/.gradle/gradle.properties（docs/10 第 4 节）"
  while :; do
    printf '设一个密码（至少 6 位，输入时不显示）：'; IFS= read -rs pw || exit 1; echo
    printf '再输一遍：'; IFS= read -rs pw2 || exit 1; echo
    [ "${#pw}" -ge 6 ] && [ "$pw" = "$pw2" ] && break
    echo "两次不一样或不到 6 位，重来。"
  done
  mkdir -p "$(dirname "$store")"
  "$kt" -genkeypair -keystore "$store" -alias upload -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$pw" -keypass "$pw" -dname "CN=$(node -p 'require("./game.json").name.en || "Game"' 2>/dev/null)" >/dev/null 2>&1 \
    || die "生成上传密钥失败"
  mkdir -p "$(dirname "$GRADLE_PROPS")"
  {
    echo ""
    echo "# Google Play 上传密钥（./package.sh 生成于 $(date +%F)）"
    echo "RELEASE_STORE_FILE=$store"
    echo "RELEASE_STORE_PASSWORD=$pw"
    echo "RELEASE_KEY_ALIAS=upload"
    echo "RELEASE_KEY_PASSWORD=$pw"
  } >> "$GRADLE_PROPS"
  chmod 600 "$GRADLE_PROPS" "$store"
  echo "✓ 上传密钥：${store}（签名配置写进了 ~/.gradle/gradle.properties）——现在就把这个文件和密码备份到别处"
}

# 16 KB 内存页（Google Play 要求，targetSdk 35 起）：AAB 里每个 .so 的 LOAD 段要按 16 KB（0x4000）对齐
android_check_16k() {
  local aab="$1" ndk="$2" tmp readelf so bad=0
  readelf="$(ls -d "$ndk"/toolchains/llvm/prebuilt/*/bin/llvm-readelf 2>/dev/null | head -1)"
  [ -x "$readelf" ] || { echo "! 没找到 llvm-readelf，跳过 16 KB 页检查"; return 0; }
  tmp="$(mktemp -d)"
  unzip -q -o "$aab" 'base/lib/*' -d "$tmp" 2>/dev/null || true
  for so in "$tmp"/base/lib/arm64-v8a/*.so; do
    [ -f "$so" ] || continue
    if "$readelf" -lW "$so" | awk '$1=="LOAD"{print $NF}' | grep -qvE '^0x(4000|8000|10000)$'; then
      echo "✗ $(basename "$so") 没有按 16 KB 对齐"; bad=1
    fi
  done
  rm -rf "$tmp"
  [ "$bad" = 0 ] && echo "✓ 16 KB 内存页：arm64 的原生库都按 16 KB 对齐" || echo "! 有原生库没按 16 KB 对齐，Google Play 会拒（docs/06）"
}

android_build() {
  local mode="${1:-apk}" proj
  # 只有 AAB（传 Google Play）用真实广告位，其它产物用 Google 的测试广告位（tools/native/apply.mjs）
  [ "$mode" != aab ] || android_upload_key
  FS_RELEASE="$([ "$mode" = aab ] && echo 1 || echo 0)" node tools/native/apply.mjs
  local sdk ndk cfg cand
  # SDK：ANDROID_HOME，或者 Android Studio 的默认位置，或者外接盘上的 /Volumes/*/Android/sdk（用户 2026-11-20：Mac 上的 SDK 装在外接盘 /Volumes/Lexar/Android/sdk）
  sdk="${ANDROID_HOME:-}"
  if [ -z "$sdk" ]; then
    for cand in "$HOME/Library/Android/sdk" /Volumes/*/Android/sdk; do
      if [ -d "$cand/platforms" ] && [ -d "$cand/ndk" ]; then sdk="$cand"; break; fi
    done
  fi
  [ -n "$sdk" ] && [ -d "$sdk/platforms" ] || die "没找到 Android SDK（装 Android Studio，或设 ANDROID_HOME；也会找外接盘上的 /Volumes/*/Android/sdk）"
  # NDK：ANDROID_NDK_HOME，或者 SDK 里 ndk/ 下版本最新的那个（版本号都是两位数起，按字面排序就行）
  ndk="${ANDROID_NDK_HOME:-$(ls -d "$sdk"/ndk/*/ 2>/dev/null | sort | tail -1)}"
  ndk="${ndk%/}"
  [ -d "$ndk" ] || die "没找到 Android NDK（Android Studio → SDK Manager → SDK Tools 装 NDK，或设 ANDROID_NDK_HOME）"
  echo "· Android SDK：$sdk"
  echo "· Android NDK：$ndk"
  # SDK、NDK 路径不用去 Cocos 偏好设置里填：带进这次的构建参数（sdkPath、ndkPath，Cocos 3.8 命令行构建支持），文件不进仓库
  cfg="$CLIENT/build-config/.android.local.json"
  SDK="$sdk" NDK="$ndk" node -e '
    const fs = require("fs");
    const [src, dst] = process.argv.slice(1);
    const c = JSON.parse(fs.readFileSync(src, "utf8"));
    c.packages.android = { ...c.packages.android, sdkPath: process.env.SDK, ndkPath: process.env.NDK };
    fs.writeFileSync(dst, JSON.stringify(c, null, 2) + "\n");
  ' "$CLIENT/build-config/android.json" "$cfg"
  NDK_ROOT="$ndk" ANDROID_SDK_ROOT="$sdk" ANDROID_HOME="$sdk" COCOS_BUILD_CONFIG="$cfg" cocos_build android
  proj="$CLIENT/build/android/proj"
  [ -x "$proj/gradlew" ] || die "没找到 Gradle 工程：$proj"
  node -e '
    const fs = require("node:fs");
    const props = process.argv[1];
    const minSdk = require("./game.json").android.minSdk;
    const content = fs.readFileSync(props, "utf8");
    fs.writeFileSync(props, content.replace(/^PROP_MIN_SDK_VERSION=.*$/m, `PROP_MIN_SDK_VERSION=${minSdk}`));
  ' "$proj/gradle.properties"
  case "$mode" in
    project) echo "Gradle 工程：$proj" ;;
    apk) (cd "$proj" && ./gradlew assembleDebug) && echo "✓ apk：$(find "$proj" -name '*.apk' -path '*debug*' | head -1)" ;;
    aab)
      # 签名：RELEASE_STORE_FILE 等四个变量写在 ~/.gradle/gradle.properties（不进仓库，docs/10）
      local aab
      (cd "$proj" && ./gradlew bundleRelease) || die "AAB 编译失败"
      aab="$(find "$proj" -path '*/outputs/bundle/release/*.aab' | head -1)"
      [ -n "$aab" ] || die "没找到打好的 AAB"
      "$(find_keytool)" -printcert -rfc -jarfile "$aab" 2>/dev/null | grep -q -- '-----BEGIN CERTIFICATE-----' || die "${aab} 没有签名（检查 ~/.gradle/gradle.properties 的 RELEASE_ 变量）"
      android_check_16k "$aab" "$ndk"
      echo "✓ aab：${aab}（已用上传密钥签名、真实广告位；传到 Google Play Console）" ;;
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
        printf '%s\n' 'iOS 产物' '1 Xcode 工程' '2 模拟器 App' '3 未签名真机 App' '4 IPA' '5 装到手机' '0 返回'
        read_choice
        case "$choice" in
          1) ios_build; exit ;;
          2) ios_build sim; exit ;;
          3) ios_build dev; exit ;;
          4) ios_build ipa; exit ;;
          5) ios_build phone; exit ;;
          0) break ;;
          *) echo '请输入 0 至 5。' ;;
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
