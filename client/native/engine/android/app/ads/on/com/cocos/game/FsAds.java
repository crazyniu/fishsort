// 广告：Google Mobile Ads（AdMob）+ 用户同意（UMP，欧洲等地要先问）。game.json 的 ads.enabled 为 true 时编进包
// （app/build.gradle 的 FS_ADS；关掉时用 ads/off 里的空实现，也不依赖广告 SDK）。由 FsBridge 转调，事件表见 platformNative.ts。
package com.cocos.game;

import android.app.Activity;
import android.util.DisplayMetrics;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;

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

import org.json.JSONObject;

final class FsAds {
    private static Activity activity;
    private static String rewardedUnit = "";
    private static String interstitialUnit = "";
    private static String bannerUnit = "";
    private static RewardedAd rewarded;
    private static InterstitialAd interstitial;
    private static AdView banner;
    private static boolean earned;

    private FsAds() {}

    private static void send(String event, String json) {
        FsBridge.send(event, json);
    }

    /** fs.init：记下广告位，先问同意（UMP），能请求广告了再启动 SDK、预加载 */
    static void start(Activity act, JSONObject ads) {
        activity = act;
        if (ads != null) {
            rewardedUnit = ads.optString("rewarded", "");
            interstitialUnit = ads.optString("interstitial", "");
            bannerUnit = ads.optString("banner", "");
        }
        // 没配激励视频广告位就当这一版没有广告：不问同意，看广告的入口隐藏
        if (rewardedUnit.isEmpty()) {
            send("fs.ads", "{\"ready\":false,\"off\":true}");
            return;
        }
        askConsentThenStart();
    }

    static void openPrivacyOptions() {
        UserMessagingPlatform.showPrivacyOptionsForm(activity, error -> {});
    }

    private static void askConsentThenStart() {
        ConsentInformation info = UserMessagingPlatform.getConsentInformation(activity);
        ConsentRequestParameters params = new ConsentRequestParameters.Builder().build();
        info.requestConsentInfoUpdate(activity, params,
            () -> UserMessagingPlatform.loadAndShowConsentFormIfRequired(activity, formError -> startSdk(info)),
            requestError -> startSdk(info));
    }

    private static void startSdk(ConsentInformation info) {
        if (!info.canRequestAds()) {
            // 用户没同意：这次请求不了广告，入口变灰；设置里的「隐私选项」还能改
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

    static void showRewarded() {
        if (rewarded == null) {
            send("fs.rewarded", "{\"result\":\"unavailable\"}");
            loadRewarded();
            return;
        }
        earned = false;
        rewarded.show(activity, reward -> earned = true);
    }

    static void showInterstitial() {
        if (interstitial == null) {
            send("fs.interstitial", "{}");
            loadInterstitial();
            return;
        }
        interstitial.show(activity);
    }

    static void setBannerVisible(boolean show) {
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
}
