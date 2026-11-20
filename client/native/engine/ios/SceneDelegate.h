// 场景生命周期（UIScene）：iOS 27 起用新 SDK 编译的应用必须采用，否则启动即中止
// （_UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption，2026-11-20 用户的 iPhone 上闪退）。
// 窗口和引擎在场景连上时由 AppDelegate 建；前后台切换系统只通知场景，这里转给 AppDelegate 原来那几个方法。
#import <UIKit/UIKit.h>

@interface SceneDelegate : UIResponder <UIWindowSceneDelegate>
@property(strong, nonatomic) UIWindow *window;
@end
