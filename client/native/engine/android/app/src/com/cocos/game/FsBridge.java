// 脚本和 Android 原生之间的桥，事件表见 assets/scripts/platform/platformNative.ts 的文件头（和 iOS 的 FsBridge.mm 同一组）。
// 广告在 FsAds：开着广告时是 app/ads/on 里的 AdMob 实现，关掉时是 app/ads/off 里的空实现（app/build.gradle 的 FS_ADS）。
package com.cocos.game;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;

import com.cocos.lib.CocosHelper;
import com.cocos.lib.JsbBridgeWrapper;

import org.json.JSONException;
import org.json.JSONObject;

public final class FsBridge {
    private static Activity activity;

    private FsBridge() {}

    /** AppActivity.onCreate 里调一次：注册事件 */
    public static void setup(Activity act) {
        activity = act;
        JsbBridgeWrapper bridge = JsbBridgeWrapper.getInstance();
        bridge.addScriptEventListener("fs.init", arg -> ui(() -> FsAds.start(activity, parse(arg).optJSONObject("ads"))));
        bridge.addScriptEventListener("fs.rewarded", arg -> ui(FsAds::showRewarded));
        bridge.addScriptEventListener("fs.interstitial", arg -> ui(FsAds::showInterstitial));
        bridge.addScriptEventListener("fs.banner", arg -> ui(() -> FsAds.setBannerVisible(parse(arg).optBoolean("show", false))));
        bridge.addScriptEventListener("fs.privacy", arg -> ui(FsAds::openPrivacyOptions));
        bridge.addScriptEventListener("fs.vibrate", arg -> ui(() -> vibrate(parse(arg).optString("kind", "medium"))));
        bridge.addScriptEventListener("fs.share", arg -> ui(() -> share(parse(arg).optString("text", ""))));
    }

    // ---------------------------------------------------------------- 震动、分享

    private static void vibrate(String kind) {
        Vibrator v = (Vibrator) activity.getSystemService(Activity.VIBRATOR_SERVICE);
        if (v == null || !v.hasVibrator()) return;
        int ms = "light".equals(kind) ? 12 : "heavy".equals(kind) ? 45 : 25;
        if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
        else v.vibrate(ms);
    }

    private static void share(String text) {
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_TEXT, text);
        activity.startActivity(Intent.createChooser(send, null));
        // 打开系统选择器不代表用户完成分享。
        send("fs.share", "{\"ok\":false}");
    }

    // ---------------------------------------------------------------- 工具

    private static void ui(Runnable r) {
        activity.runOnUiThread(r);
    }

    /** 回给脚本：脚本跑在游戏线程上，从那里发 */
    static void send(String event, String json) {
        CocosHelper.runOnGameThread(() -> JsbBridgeWrapper.getInstance().dispatchEventToScript(event, json));
    }

    private static JSONObject parse(String arg) {
        try {
            return new JSONObject(arg == null || arg.isEmpty() ? "{}" : arg);
        } catch (JSONException e) {
            return new JSONObject();
        }
    }
}
