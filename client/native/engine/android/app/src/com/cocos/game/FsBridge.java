// 脚本和 Android 原生之间的桥，事件表见 assets/scripts/platform/platformNative.ts 的文件头（和 iOS 的 FsBridge.mm 同一组）。
// 广告：Google Mobile Ads（AdMob）+ 用户同意（UMP，欧洲等地要先问）。依赖写在 app/build.gradle。
package com.cocos.game;

import android.app.Activity;
import android.content.Intent;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;

import com.cocos.lib.CocosHelper;
import com.cocos.lib.JsbBridgeWrapper;
import com.google.android.gms.ads.AdError;
import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.AdSize;
import com.google.android.gms.ads.AdView;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.LoadAdError;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.interstitial.InterstitialAd;
import com.google.android.gms.ads.interstitial.InterstitialAdLoadCallback;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;
import com.google.android.ump.ConsentInformation;
import com.google.android.ump.ConsentRequestParameters;
import com.google.android.ump.UserMessagingPlatform;

import org.json.JSONException;
import org.json.JSONObject;

public final class FsBridge {
    private static Activity activity;
    private static String rewardedUnit = "";
    private static String interstitialUnit = "";
    private static String bannerUnit = "";
    private static RewardedAd rewarded;
    private static InterstitialAd interstitial;
    private static AdView banner;
    private static boolean earned;

    private FsBridge() {}

    /** AppActivity.onCreate 里调一次：注册事件 */
    public static void setup(Activity act) {
        activity = act;
        JsbBridgeWrapper bridge = JsbBridgeWrapper.getInstance();
        bridge.addScriptEventListener("fs.init", arg -> ui(() -> {
            JSONObject ads = parse(arg).optJSONObject("ads");
            if (ads != null) {
                rewardedUnit = ads.optString("rewarded", "");
                interstitialUnit = ads.optString("interstitial", "");
                bannerUnit = ads.optString("banner", "");
            }
            askConsentThenStart();
        }));
        bridge.addScriptEventListener("fs.rewarded", arg -> ui(FsBridge::showRewarded));
        bridge.addScriptEventListener("fs.interstitial", arg -> ui(FsBridge::showInterstitial));
        bridge.addScriptEventListener("fs.banner", arg -> ui(() -> setBannerVisible(parse(arg).optBoolean("show", false))));
        bridge.addScriptEventListener("fs.privacy", arg -> ui(() ->
            UserMessagingPlatform.showPrivacyOptionsForm(activity, error -> {})));
        bridge.addScriptEventListener("fs.vibrate", arg -> ui(() -> vibrate(parse(arg).optString("kind", "medium"))));
        bridge.addScriptEventListener("fs.share", arg -> ui(() -> share(parse(arg).optString("text", ""))));
    }

    // ---------------------------------------------------------------- 广告

    /** 先问同意（UMP），能请求广告了再启动 SDK、预加载 */
    private static void askConsentThenStart() {
        ConsentInformation info = UserMessagingPlatform.getConsentInformation(activity);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        info.requestConsentInfoUpdate(activity, params,
            () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, formError -> startSdk(info)),
            requestError -> startSdk(info));
    }

    private static void startSdk(ConsentInformation info) {
        if (!info.canRequestAds()) {
            send("fs.ads", "{\"ready\":false}");
            return;
        }
        MobileAds.initialize(activity, status -> {
            loadRewarded();
            loadInterstitial();
        });
    }

    private static void loadRewarded() {
        if (rewardedUnit.isEmpty()) return;
        RewardedAd.load(activity, rewardedUnit, new AdRequest.Builder().build(), new RewardedAdLoadCallback() {
            @Override
            public void onAdLoaded(@NonNull RewardedAd ad) {
                rewarded = ad;
                rewarded.setFullScreenContentCallback(new FullScreenContentCallback() {
                    @Override
                    public void onAdDismissedFullScreenContent() {
                        send("fs.rewarded", earned ? "{\"result\":\"done\"}" : "{\"result\":\"skipped\"}");
                        rewarded = null;
                        send("fs.ads", "{\"ready\":false}");
                        loadRewarded();
                    }

                    @Override
                    public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                        send("fs.rewarded", "{\"result\":\"unavailable\"}");
                        rewarded = null;
                        loadRewarded();
                    }
                });
                send("fs.ads", "{\"ready\":true}");
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError error) {
                rewarded = null;
                send("fs.ads", "{\"ready\":false}");
            }
        });
    }

    private static void loadInterstitial() {
        if (interstitialUnit.isEmpty()) return;
        InterstitialAd.load(activity, interstitialUnit, new AdRequest.Builder().build(), new InterstitialAdLoadCallback() {
            @Override
            public void onAdLoaded(@NonNull InterstitialAd ad) {
                interstitial = ad;
                interstitial.setFullScreenContentCallback(new FullScreenContentCallback() {
                    @Override
                    public void onAdDismissedFullScreenContent() {
                        send("fs.interstitial", "{}");
                        interstitial = null;
                        loadInterstitial();
                    }

                    @Override
                    public void onAdFailedToShowFullScreenContent(@NonNull AdError error) {
                        send("fs.interstitial", "{}");
                        interstitial = null;
                        loadInterstitial();
                    }
                });
            }

            @Override
            public void onAdFailedToLoad(@NonNull LoadAdError error) {
                interstitial = null;
            }
        });
    }

    private static void showRewarded() {
        if (rewarded == null) {
            send("fs.rewarded", "{\"result\":\"unavailable\"}");
            loadRewarded();
            return;
        }
        earned = false;
        rewarded.show(activity, reward -> earned = true);
    }

    private static void showInterstitial() {
        if (interstitial == null) {
            send("fs.interstitial", "{}");
            loadInterstitial();
            return;
        }
        interstitial.show(activity);
    }

    private static void setBannerVisible(boolean show) {
        if (bannerUnit.isEmpty()) return;
        if (show && banner == null) {
            DisplayMetrics dm = activity.getResources().getDisplayMetrics();
            int widthDp = (int) (dm.widthPixels / dm.density);
            banner = new AdView(activity);
            banner.setAdUnitId(bannerUnit);
            banner.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(activity, widthDp));
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
            activity.addContentView(banner, lp);
            banner.loadAd(new AdRequest.Builder().build());
        }
        if (banner != null) banner.setVisibility(show ? View.VISIBLE : View.GONE);
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
    private static void send(String event, String json) {
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
