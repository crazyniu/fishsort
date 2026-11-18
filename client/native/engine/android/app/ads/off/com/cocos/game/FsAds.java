// 没有广告的版本（game.json 的 ads.enabled 为 false，app/build.gradle 的 FS_ADS）：不依赖广告 SDK，
// 告诉脚本「这一版没有广告」（off），看广告的入口隐藏；万一还是收到请求，按不可用回复。
package com.cocos.game;

import android.app.Activity;

import org.json.JSONObject;

final class FsAds {
    private FsAds() {}

    static void start(Activity act, JSONObject ads) {
        FsBridge.send("fs.ads", "{\"ready\":false,\"off\":true}");
    }

    static void showRewarded() {
        FsBridge.send("fs.rewarded", "{\"result\":\"unavailable\"}");
    }

    static void showInterstitial() {
        FsBridge.send("fs.interstitial", "{}");
    }

    static void setBannerVisible(boolean show) {}

    static void openPrivacyOptions() {}
}
