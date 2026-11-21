// 脚本和 iOS 原生之间的桥，事件表见 assets/scripts/platform/platformNative.ts 的文件头。
//
// 广告：Google Mobile Ads（AdMob）+ 用户同意（UMP，欧洲等地要先问）+ 跟踪授权（ATT）。
// SDK 由 ./package.sh 选择 iOS 时 下载到 native/engine/ios/sdk/（不进仓库）；game.json 关了广告（CMakeLists 的 FS_ADS）
// 或没下载时不链 SDK，照样能编译，只是没有广告（__has_include 判断）：告诉脚本这一版没有广告（off），
// 看广告的入口隐藏，也不弹广告同意和跟踪授权。
#import "FsBridge.h"

#import <UIKit/UIKit.h>
#include "platform/apple/JsbBridgeWrapper.h"

#if __has_include(<GoogleMobileAds/GoogleMobileAds.h>)
#import <AppTrackingTransparency/AppTrackingTransparency.h>
#import <GoogleMobileAds/GoogleMobileAds.h>
#import <UserMessagingPlatform/UserMessagingPlatform.h>
#define FS_ADMOB 1
#else
#define FS_ADMOB 0
#endif

static NSDictionary *FsParse(NSString *arg) {
    NSData *data = [(arg ?: @"{}") dataUsingEncoding:NSUTF8StringEncoding];
    id obj = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
    return [obj isKindOfClass:[NSDictionary class]] ? obj : @{};
}

static void FsSend(NSString *event, NSDictionary *payload) {
    NSData *data = [NSJSONSerialization dataWithJSONObject:(payload ?: @{}) options:0 error:nil];
    NSString *json = [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding];
    [[JsbBridgeWrapper sharedInstance] dispatchEventToScript:event arg:json];
}

static UIViewController *FsRootViewController(void) {
    UIWindow *window = nil;
    for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
        if ([scene isKindOfClass:[UIWindowScene class]]) {
            for (UIWindow *w in ((UIWindowScene *)scene).windows) {
                if (w.isKeyWindow) { window = w; break; }
            }
        }
    }
    if (!window) window = UIApplication.sharedApplication.delegate.window;
    UIViewController *vc = window.rootViewController;
    while (vc.presentedViewController) vc = vc.presentedViewController;
    return vc;
}

#if FS_ADMOB
@interface FsAds : NSObject <GADFullScreenContentDelegate>
@property(nonatomic, copy) NSString *rewardedUnit;
@property(nonatomic, copy) NSString *interstitialUnit;
@property(nonatomic, copy) NSString *bannerUnit;
@property(nonatomic, strong) GADRewardedAd *rewarded;
@property(nonatomic, strong) GADInterstitialAd *interstitial;
@property(nonatomic, strong) GADBannerView *banner;
@property(nonatomic, assign) BOOL earned;
// 加载失败后隔多久再试（秒）：15 秒起逐次加倍，最长 5 分钟；加载成功就重置。
// 上架前和刚上架时填充很低、断网时也会失败，不重试的话这一局入口一直是灰的
@property(nonatomic, assign) NSTimeInterval rewardedRetry;
@property(nonatomic, assign) NSTimeInterval interstitialRetry;
@property(nonatomic, assign) BOOL rewardedLoading;
@property(nonatomic, assign) BOOL interstitialLoading;
@end

static const NSTimeInterval FS_RETRY_FIRST = 15;
static const NSTimeInterval FS_RETRY_MAX = 300;

@implementation FsAds

+ (instancetype)shared {
    static FsAds *ads;
    static dispatch_once_t once;
    dispatch_once(&once, ^{ ads = [[FsAds alloc] init]; });
    return ads;
}

/** 先问同意（UMP），再问跟踪授权（ATT），然后启动 SDK、预加载 */
- (void)startWithUnits:(NSDictionary *)units {
    self.rewardedUnit = units[@"rewarded"] ?: @"";
    self.interstitialUnit = units[@"interstitial"] ?: @"";
    self.bannerUnit = units[@"banner"] ?: @"";
    // 没配激励视频广告位就当这一版没有广告：不问同意、不问跟踪授权，看广告的入口隐藏
    if (self.rewardedUnit.length == 0) {
        FsSend(@"fs.ads", @{@"ready" : @NO, @"off" : @YES});
        return;
    }
    UMPRequestParameters *params = [[UMPRequestParameters alloc] init];
    [UMPConsentInformation.sharedInstance
        requestConsentInfoUpdateWithParameters:params
                             completionHandler:^(NSError *_Nullable error) {
                                 [UMPConsentForm loadAndPresentIfRequiredFromViewController:FsRootViewController()
                                                                          completionHandler:^(NSError *_Nullable formError) {
                                                                              [self askTrackingThenStart];
                                                                          }];
                             }];
}

- (void)askTrackingThenStart {
    if (@available(iOS 14, *)) {
        [ATTrackingManager requestTrackingAuthorizationWithCompletionHandler:^(ATTrackingManagerAuthorizationStatus status) {
            dispatch_async(dispatch_get_main_queue(), ^{ [self startSdk]; });
        }];
    } else {
        [self startSdk];
    }
}

- (void)startSdk {
    if (!UMPConsentInformation.sharedInstance.canRequestAds) {
        FsSend(@"fs.ads", @{@"ready" : @NO});
        return;
    }
    [GADMobileAds.sharedInstance startWithCompletionHandler:^(GADInitializationStatus *status) {
        [self loadRewarded];
        [self loadInterstitial];
    }];
}

- (void)loadRewarded {
    // 已经有一条或正在加载就不重复请求（点了入口、到点重试可能同时触发）
    if (self.rewardedUnit.length == 0 || self.rewarded || self.rewardedLoading) return;
    self.rewardedLoading = YES;
    [GADRewardedAd loadWithAdUnitID:self.rewardedUnit
                            request:[GADRequest request]
                  completionHandler:^(GADRewardedAd *ad, NSError *error) {
                      self.rewardedLoading = NO;
                      self.rewarded = error ? nil : ad;
                      self.rewarded.fullScreenContentDelegate = self;
                      FsSend(@"fs.ads", @{@"ready" : @(self.rewarded != nil)});
                      if (self.rewarded) {
                          self.rewardedRetry = FS_RETRY_FIRST;
                      } else {
                          NSTimeInterval wait = MAX(self.rewardedRetry, FS_RETRY_FIRST);
                          self.rewardedRetry = MIN(FS_RETRY_MAX, wait * 2);
                          dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(wait * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ [self loadRewarded]; });
                      }
                  }];
}

- (void)loadInterstitial {
    if (self.interstitialUnit.length == 0 || self.interstitial || self.interstitialLoading) return;
    self.interstitialLoading = YES;
    [GADInterstitialAd loadWithAdUnitID:self.interstitialUnit
                                request:[GADRequest request]
                      completionHandler:^(GADInterstitialAd *ad, NSError *error) {
                          self.interstitialLoading = NO;
                          self.interstitial = error ? nil : ad;
                          self.interstitial.fullScreenContentDelegate = self;
                          if (self.interstitial) {
                              self.interstitialRetry = FS_RETRY_FIRST;
                          } else {
                              NSTimeInterval wait = MAX(self.interstitialRetry, FS_RETRY_FIRST);
                              self.interstitialRetry = MIN(FS_RETRY_MAX, wait * 2);
                              dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(wait * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{ [self loadInterstitial]; });
                          }
                      }];
}

- (void)showRewarded {
    if (!self.rewarded) {
        FsSend(@"fs.rewarded", @{@"result" : @"unavailable"});
        [self loadRewarded];
        return;
    }
    self.earned = NO;
    [self.rewarded presentFromRootViewController:FsRootViewController()
                        userDidEarnRewardHandler:^{ self.earned = YES; }];
}

- (void)showInterstitial {
    if (!self.interstitial) {
        FsSend(@"fs.interstitial", @{@"shown" : @NO});
        [self loadInterstitial];
        return;
    }
    [self.interstitial presentFromRootViewController:FsRootViewController()];
}

- (void)setBannerVisible:(BOOL)show {
    if (self.bannerUnit.length == 0) return;
    UIViewController *vc = FsRootViewController();
    if (show && !self.banner) {
        CGFloat width = vc.view.bounds.size.width;
        self.banner = [[GADBannerView alloc] initWithAdSize:GADCurrentOrientationAnchoredAdaptiveBannerAdSizeWithWidth(width)];
        self.banner.adUnitID = self.bannerUnit;
        self.banner.rootViewController = vc;
        self.banner.translatesAutoresizingMaskIntoConstraints = NO;
        [vc.view addSubview:self.banner];
        [NSLayoutConstraint activateConstraints:@[
            [self.banner.bottomAnchor constraintEqualToAnchor:vc.view.safeAreaLayoutGuide.bottomAnchor],
            [self.banner.centerXAnchor constraintEqualToAnchor:vc.view.centerXAnchor],
        ]];
        [self.banner loadRequest:[GADRequest request]];
    }
    self.banner.hidden = !show;
}

- (void)openPrivacyOptions {
    [UMPConsentForm presentPrivacyOptionsFormFromViewController:FsRootViewController()
                                              completionHandler:^(NSError *_Nullable error) {
                                                  // 改完同意重新判断：原来不同意、现在同意了就初始化并拉广告（#170）
                                                  [self startSdk];
                                              }];
}

#pragma mark GADFullScreenContentDelegate

- (void)adDidDismissFullScreenContent:(id<GADFullScreenPresentingAd>)ad {
    if (ad == self.rewarded) {
        FsSend(@"fs.rewarded", @{@"result" : self.earned ? @"done" : @"skipped"});
        self.rewarded = nil;
        FsSend(@"fs.ads", @{@"ready" : @NO});
        [self loadRewarded];
    } else if (ad == self.interstitial) {
        FsSend(@"fs.interstitial", @{@"shown" : @YES});
        self.interstitial = nil;
        [self loadInterstitial];
    }
}

- (void)ad:(id<GADFullScreenPresentingAd>)ad didFailToPresentFullScreenContentWithError:(NSError *)error {
    if (ad == self.rewarded) {
        FsSend(@"fs.rewarded", @{@"result" : @"unavailable"});
        self.rewarded = nil;
        FsSend(@"fs.ads", @{@"ready" : @NO});
        [self loadRewarded];
    } else if (ad == self.interstitial) {
        FsSend(@"fs.interstitial", @{@"shown" : @NO});
        self.interstitial = nil;
        [self loadInterstitial];
    }
}

@end
#endif

@implementation FsBridge

+ (void)setup {
    JsbBridgeWrapper *bridge = [JsbBridgeWrapper sharedInstance];

    [bridge addScriptEventListener:@"fs.init"
                          listener:^(NSString *arg) {
#if FS_ADMOB
                              NSDictionary *units = FsParse(arg)[@"ads"];
                              [[FsAds shared] startWithUnits:[units isKindOfClass:[NSDictionary class]] ? units : @{}];
#else
                              FsSend(@"fs.ads", @{@"ready" : @NO, @"off" : @YES});
#endif
                          }];

    [bridge addScriptEventListener:@"fs.rewarded"
                          listener:^(NSString *arg) {
#if FS_ADMOB
                              [[FsAds shared] showRewarded];
#else
                              FsSend(@"fs.rewarded", @{@"result" : @"unavailable"});
#endif
                          }];

    [bridge addScriptEventListener:@"fs.interstitial"
                          listener:^(NSString *arg) {
#if FS_ADMOB
                              [[FsAds shared] showInterstitial];
#else
                              FsSend(@"fs.interstitial", @{});
#endif
                          }];

    [bridge addScriptEventListener:@"fs.banner"
                          listener:^(NSString *arg) {
#if FS_ADMOB
                              [[FsAds shared] setBannerVisible:[FsParse(arg)[@"show"] boolValue]];
#endif
                          }];

    [bridge addScriptEventListener:@"fs.privacy"
                          listener:^(NSString *arg) {
#if FS_ADMOB
                              [[FsAds shared] openPrivacyOptions];
#endif
                          }];

    [bridge addScriptEventListener:@"fs.vibrate"
                          listener:^(NSString *arg) {
                              NSString *kind = FsParse(arg)[@"kind"];
                              UIImpactFeedbackStyle style = UIImpactFeedbackStyleMedium;
                              if ([kind isEqualToString:@"light"]) style = UIImpactFeedbackStyleLight;
                              if ([kind isEqualToString:@"heavy"]) style = UIImpactFeedbackStyleHeavy;
                              UIImpactFeedbackGenerator *gen = [[UIImpactFeedbackGenerator alloc] initWithStyle:style];
                              [gen impactOccurred];
                          }];

    [bridge addScriptEventListener:@"fs.share"
                          listener:^(NSString *arg) {
                              NSString *text = FsParse(arg)[@"text"] ?: @"";
                              UIViewController *vc = FsRootViewController();
                              UIActivityViewController *share = [[UIActivityViewController alloc] initWithActivityItems:@[ text ]
                                                                                                  applicationActivities:nil];
                              share.popoverPresentationController.sourceView = vc.view;
                              share.completionWithItemsHandler = ^(UIActivityType type, BOOL completed, NSArray *items, NSError *error) {
                                  FsSend(@"fs.share", @{@"ok" : @(completed)});
                              };
                              [vc presentViewController:share animated:YES completion:nil];
                          }];
}

@end
