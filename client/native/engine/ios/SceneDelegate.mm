#import "SceneDelegate.h"
#import "AppDelegate.h"

@implementation SceneDelegate

static AppDelegate *FsApp(void) {
    return (AppDelegate *)UIApplication.sharedApplication.delegate;
}

- (void)scene:(UIScene *)scene willConnectToSession:(UISceneSession *)session options:(UISceneConnectionOptions *)connectionOptions {
    if (![scene isKindOfClass:[UIWindowScene class]]) return;
    self.window = [FsApp() startInWindowScene:(UIWindowScene *)scene];
}

- (void)sceneDidBecomeActive:(UIScene *)scene {
    [FsApp() applicationDidBecomeActive:UIApplication.sharedApplication];
}

- (void)sceneWillResignActive:(UIScene *)scene {
    [FsApp() applicationWillResignActive:UIApplication.sharedApplication];
}

- (void)sceneWillEnterForeground:(UIScene *)scene {
    [FsApp() applicationWillEnterForeground:UIApplication.sharedApplication];
}

- (void)sceneDidEnterBackground:(UIScene *)scene {
    [FsApp() applicationDidEnterBackground:UIApplication.sharedApplication];
}

@end
