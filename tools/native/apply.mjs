#!/usr/bin/env node
// 按仓库根目录的 game.json 改写各平台的构建配置和原生工程（docs/10-开发底座.md）。
// ./package.sh 选择微信或原生平台 打包前自动跑；改了 game.json 也可以单独跑：node tools/native/apply.mjs
// 只改下面列出的那几处，别的不动；重复跑结果一样。
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '../..');
const CLIENT = join(ROOT, 'client');
const game = JSON.parse(readFileSync(join(ROOT, 'game.json'), 'utf8'));
const changed = [];

function write(path, text) {
  const old = existsSync(path) ? readFileSync(path, 'utf8') : null;
  if (old === text) return;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  changed.push(path.slice(ROOT.length + 1));
}

function edit(path, fn) {
  write(path, fn(readFileSync(path, 'utf8')));
}

const json = (v) => JSON.stringify(v, null, 2) + '\n';
const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** 工程名：只留字母数字（Xcode / Gradle 工程名里有空格容易出问题） */
const projectName = game.name.en.replace(/[^A-Za-z0-9]/g, '') || game.codeName;
/**
 * 游戏里的语言代码 → iOS 的 .lproj、Android 的 values 目录（繁体给台湾和香港各一份）。
 * 英文是 iOS 的 Base 和 Android 的默认 values；要加语言先在这里加一行，再把代码写进 game.json 的 languages
 */
const LOCALES = {
  en: { ios: 'en', android: [] },
  zh_CN: { ios: 'zh-Hans', android: ['zh-rCN'] },
  zh_TW: { ios: 'zh-Hant', android: ['zh-rTW', 'zh-rHK'] },
  ja: { ios: 'ja', android: ['ja'] },
  ko: { ios: 'ko', android: ['ko'] },
  de: { ios: 'de', android: ['de'] },
  fr: { ios: 'fr', android: ['fr'] },
  es: { ios: 'es', android: ['es'] },
  pt: { ios: 'pt-BR', android: ['pt'] },
  it: { ios: 'it', android: ['it'] },
  ru: { ios: 'ru', android: ['ru'] },
  tr: { ios: 'tr', android: ['tr'] },
};
const appLangs = game.languages.app;
for (const l of appLangs) if (!LOCALES[l]) throw new Error(`game.json 的 languages.app 里有 ${l}，apply.mjs 的 LOCALES 里没有`);
/** 广告总开关（game.json 的 ads.enabled）：关掉时三端都没有广告，原生包里不带广告 SDK */
const adsOn = game.ads.enabled === true;

// 1. 游戏运行时读的平台配置（platform/platformConfig.ts）
write(
  join(CLIENT, 'assets/resources/config/platform.json'),
  json({
    name: game.name,
    version: game.version,
    languages: { app: game.languages.app, wechat: game.languages.wechat },
    adsEnabled: adsOn,
    // 难度调试页（设置里的入口）开不开：测试包开着，上架前关掉
    levelLab: game.levelLab === true,
    ads: { ios: game.ads.ios, android: game.ads.android, wechat: game.ads.wechat },
  }),
);

// 2. 各平台的 Cocos 构建配置
const buildConfig = (platform) => join(CLIENT, 'build-config', `${platform}.json`);
for (const platform of ['ios', 'android', 'wechatgame']) {
  const path = buildConfig(platform);
  if (!existsSync(path)) continue;
  edit(path, (s) => {
    const c = JSON.parse(s);
    c.packages = c.packages ?? {};
    if (platform === 'ios') {
      c.name = projectName;
      c.packages.ios = { ...c.packages.ios, packageName: game.ios.bundleId, developerTeam: game.ios.team ?? '', targetVersion: game.ios.minVersion };
    } else if (platform === 'android') {
      c.name = projectName;
      c.packages.android = { ...c.packages.android, packageName: game.android.packageName, apiLevel: game.android.targetSdk };
    } else {
      c.packages.wechatgame = { ...c.packages.wechatgame, appid: game.wechat.appid };
    }
    return json(c);
  });
}

// 3. iOS：Info.plist 的版本号、广告那几项（AdMob 应用 ID、跟踪授权说明、SKAdNetwork）；各语言的应用名；链不链广告 SDK
const ios = join(CLIENT, 'native/engine/ios');
if (existsSync(ios)) {
  const plistValue = (s, key, value) => s.replace(new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`), `$1${xml(value)}$2`);
  // 广告那几项：开着广告时放在 ITSAppUsesNonExemptEncryption 前面；关掉时整段去掉
  // （没有跟踪授权弹窗却写了 NSUserTrackingUsageDescription，审核会问）
  const AD_KEYS = /\t<key>GADApplicationIdentifier<\/key>[\s\S]*?<key>SKAdNetworkItems<\/key>\s*<array>[\s\S]*?<\/array>\n/;
  const adKeys = [
    '\t<key>GADApplicationIdentifier</key>',
    `\t<string>${xml(game.ios.admobAppId)}</string>`,
    '\t<key>NSUserTrackingUsageDescription</key>',
    `\t<string>${xml(game.ios.trackingText.en)}</string>`,
    '\t<key>SKAdNetworkItems</key>',
    '\t<array>',
    '\t\t<dict>',
    '\t\t\t<key>SKAdNetworkIdentifier</key>',
    '\t\t\t<string>cstr6suwn9.skadnetwork</string>',
    '\t\t</dict>',
    '\t</array>',
    '',
  ].join('\n');
  edit(join(ios, 'Info.plist'), (s) => {
    // 支持的语言：系统设成这些语言时，系统界面（应用名、权限弹窗）跟着用这种语言
    const locs = appLangs.map((l) => `\t\t<string>${LOCALES[l].ios}</string>`).join('\n');
    s = s.replace(/(<key>CFBundleLocalizations<\/key>\s*<array>)[\s\S]*?(\s*<\/array>)/, `$1\n${locs}$2`);
    s = plistValue(s, 'CFBundleDisplayName', game.name.en);
    s = plistValue(s, 'CFBundleShortVersionString', game.version);
    // iOS 的构建号可以单独加（game.json 的 ios.build：同一版本号重传 App Store Connect 要换构建号），没有就用全局的 build
    s = plistValue(s, 'CFBundleVersion', String(game.ios.build ?? game.build));
    s = s.replace(AD_KEYS, '');
    if (adsOn) s = s.replace('\t<key>ITSAppUsesNonExemptEncryption</key>', `${adKeys}\t<key>ITSAppUsesNonExemptEncryption</key>`);
    return s;
  });
  const strings = (lang) =>
    `/* 由 tools/native/apply.mjs 按 game.json 生成 */\n"CFBundleDisplayName" = "${game.name[lang]}";\n` +
    (adsOn ? `"NSUserTrackingUsageDescription" = "${game.ios.trackingText[lang]}";\n` : '');
  // 各语言的 InfoPlist.strings 由 CMakeLists 构建完拷进 .app（FS_LPROJ 列目录；Cocos 的模板不带它们，2026-11-19 以前的中文应用名因此没进包）
  const lproj = ['Base', ...appLangs.map((l) => LOCALES[l].ios)].join(' ');
  // 工程名：Cocos 构建时也会这样改写，先写好免得每次构建都有改动；FS_ADS：链不链广告 SDK
  edit(join(ios, 'CMakeLists.txt'), (s) =>
    s
      .replace(/set\(APP_NAME "[^"]*"/, `set(APP_NAME "${projectName}"`)
      .replace(/set\(FS_ADS (ON|OFF)\)/, `set(FS_ADS ${adsOn ? 'ON' : 'OFF'})`)
      .replace(/set\(FS_LPROJ [^)]*\)/, `set(FS_LPROJ ${lproj})`),
  );
  write(join(ios, 'Base.lproj/InfoPlist.strings'), strings('en'));
  for (const l of appLangs) write(join(ios, `${LOCALES[l].ios}.lproj/InfoPlist.strings`), strings(l));
}

// 4. Android：版本号、AdMob 应用 ID、各语言的应用名；带不带广告 SDK（FS_ADS）和广告 ID 权限
const android = join(CLIENT, 'native/engine/android');
if (existsSync(android)) {
  edit(join(android, 'app/build.gradle'), (s) =>
    s
      .replace(/versionCode \d+/, `versionCode ${game.build}`)
      .replace(/versionName "[^"]*"/, `versionName "${game.version}"`)
      .replace(/def FS_ADS = (true|false)/, `def FS_ADS = ${adsOn}`),
  );
  // 广告 ID 权限：关掉广告时显式去掉（tools:node="remove"），Play 后台的「广告 ID」声明就能选不用
  const AD_ID = /<uses-permission android:name="com\.google\.android\.gms\.permission\.AD_ID"[^>]*\/>/;
  edit(join(android, 'app/AndroidManifest.xml'), (s) =>
    s
      .replace(/(android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"\s*android:value=")[^"]*(")/, `$1${game.android.admobAppId}$2`)
      .replace(AD_ID, `<uses-permission android:name="com.google.android.gms.permission.AD_ID"${adsOn ? '' : ' tools:node="remove"'}/>`),
  );
  const label = (s, name) => s.replace(/(<string name="fs_app_name">)[^<]*(<\/string>)/, `$1${xml(name)}$2`);
  edit(join(android, 'res/values/strings.xml'), (s) => label(s, game.name.en));
  const localeXml = (name) =>
    `<resources>\n    <!-- 这种系统语言下的应用名（tools/native/apply.mjs 按 game.json 生成） -->\n    <string name="fs_app_name">${xml(name).replace(/'/g, "\\'")}</string>\n</resources>\n`;
  for (const l of appLangs) for (const q of LOCALES[l].android) write(join(android, `res/values-${q}/strings.xml`), localeXml(game.name[l]));
}

console.log(changed.length ? `✓ 按 game.json 改了：\n  ${changed.join('\n  ')}` : '✓ 各平台配置和 game.json 一致');
