import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    /*
      The gap between the launch screen and the first React frame.

      iOS cross-fades its launch screen out as soon as the app declares itself
      launched, which is well before React has drawn anything — and what it
      fades to is the window, which is white by default. So a cold start went
      blue, pale, white, then blue again as the app's own splash arrived.

      Painting the window the same blue closes it: the launch screen fades into
      the same colour it was, and the splash takes over invisibly.

      Written out rather than read from `tokens.ts` because this runs before
      any JavaScript. `scripts/make-icons.py` and `colors.xml` carry the same
      value for the same reason, and all three say where it came from.
    */
    let field = UIColor(
      red: 26.0 / 255.0,
      green: 79.0 / 255.0,
      blue: 160.0 / 255.0,
      alpha: 1.0
    )
    window?.backgroundColor = field

    factory.startReactNative(
      withModuleName: "BackhaulApp",
      in: window,
      launchOptions: launchOptions
    )

    // And the root view React draws into, which the factory makes white. The
    // window alone was not enough: the cross-fade went blue, one pale frame,
    // then blue, and the pale frame was this view showing through.
    window?.rootViewController?.view.backgroundColor = field

    return true
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}
