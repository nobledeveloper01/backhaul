package com.backhaul.app

import android.os.Bundle
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Hands the window back from the launch theme.
   *
   * The activity is declared with `LaunchTheme`, whose background is the blue
   * field and the mark — so the system draws the product's own colour in the
   * gap between the launcher and the first React frame. On a 2 GB Transsion
   * handset that gap is over a second, and a white flash in the middle of it
   * is the difference between an app that feels slow and one that feels
   * broken.
   *
   * Swapping back to `AppTheme` here, *before* `super.onCreate`, is what stops
   * the launch drawable staying behind every screen for the life of the
   * process — where it would show through anything translucent.
   */
  override fun onCreate(savedInstanceState: Bundle?) {
    setTheme(R.style.AppTheme)
    super.onCreate(savedInstanceState)
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "BackhaulApp"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
