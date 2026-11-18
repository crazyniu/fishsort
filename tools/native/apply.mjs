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

// 1. 游戏运行时读的平台配置（platform/platformConfig.ts）
write(
  join(CLIENT, 'assets/resources/config/platform.json'),
  json({ name: game.name, version: game.version, ads: { ios: game.ads.ios, android: game.ads.android, wechat: game.ads.wechat } }),
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

// 3. iOS：Info.plist 的版本号、AdMob 应用 ID、跟踪授权说明；各语言的应用名
const ios = join(CLIENT, 'native/engine/ios');
if (existsSync(ios)) {
  const plistValue = (s, key, value) => s.replace(new RegExp(`(<key>${key}</key>\\s*<string>)[^<]*(</string>)`), `$1${xml(value)}$2`);
  edit(join(ios, 'Info.plist'), (s) => {
    s = plistValue(s, 'CFBundleShortVersionString', game.version);
    s = plistValue(s, 'CFBundleVersion', String(game.build));
    s = plistValue(s, 'GADApplicationIdentifier', game.ios.admobAppId);
    s = plistValue(s, 'NSUserTrackingUsageDescription', game.ios.trackingText.en);
    return s;
  });
  const strings = (lang) =>
    `/* 由 tools/native/apply.mjs 按 game.json 生成 */\n"CFBundleDisplayName" = "${game.name[lang]}";\n"NSUserTrackingUsageDescription" = "${game.ios.trackingText[lang]}";\n`;
  // 工程名：Cocos 构建时也会这样改写，先写好免得每次构建都有改动
  edit(join(ios, 'CMakeLists.txt'), (s) => s.replace(/set\(APP_NAME "[^"]*"/, `set(APP_NAME "${projectName}"`));
  write(join(ios, 'Base.lproj/InfoPlist.strings'), strings('en'));
  write(join(ios, 'zh-Hans.lproj/InfoPlist.strings'), strings('zh_CN'));
}

// 4. Android：版本号、AdMob 应用 ID、各语言的应用名
const android = join(CLIENT, 'native/engine/android');
if (existsSync(android)) {
  edit(join(android, 'app/build.gradle'), (s) =>
    s.replace(/versionCode \d+/, `versionCode ${game.build}`).replace(/versionName "[^"]*"/, `versionName "${game.version}"`),
  );
  edit(join(android, 'app/AndroidManifest.xml'), (s) =>
    s.replace(/(android:name="com\.google\.android\.gms\.ads\.APPLICATION_ID"\s*android:value=")[^"]*(")/, `$1${game.android.admobAppId}$2`),
  );
  const label = (s, name) => s.replace(/(<string name="fs_app_name">)[^<]*(<\/string>)/, `$1${xml(name)}$2`);
  edit(join(android, 'res/values/strings.xml'), (s) => label(s, game.name.en));
  edit(join(android, 'res/values-zh-rCN/strings.xml'), (s) => label(s, game.name.zh_CN));
}

console.log(changed.length ? `✓ 按 game.json 改了：\n  ${changed.join('\n  ')}` : '✓ 各平台配置和 game.json 一致');
