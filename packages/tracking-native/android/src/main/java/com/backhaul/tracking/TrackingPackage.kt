package com.backhaul.tracking

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider

/**
 * What autolinking finds.
 *
 * `BaseReactPackage` rather than the old `ReactPackage`: the New Architecture
 * asks for modules by name rather than instantiating everything at start-up,
 * which is why `getModule` takes a name and why the info provider exists.
 */
class TrackingPackage : BaseReactPackage() {

  override fun getModule(name: String, context: ReactApplicationContext): NativeModule? =
    if (name == TrackingModule.NAME) TrackingModule(context) else null

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider = ReactModuleInfoProvider {
    mapOf(
      TrackingModule.NAME to ReactModuleInfo(
        TrackingModule.NAME,
        TrackingModule.NAME,
        false, // canOverrideExistingModule
        false, // needsEagerInit
        false, // isCxxModule
        true, // isTurboModule
      ),
    )
  }
}
