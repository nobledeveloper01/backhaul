package com.backhaul.tracking

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

/**
 * The bridge between the loop and the decisions.
 *
 * Every method here is a verb the JavaScript side already knows it wants,
 * because the contract was written first (`NativeTracking.ts`) and the policy
 * that calls it is pure and tested (`@backhaul/domain`). Nothing in this file
 * decides anything.
 *
 * `NativeTrackingSpec` is generated from that contract by React Native's
 * codegen, which is why this class has no `@ReactMethod` annotations and why
 * a change to the contract breaks this file at compile time rather than at
 * runtime on somebody's phone.
 */
class TrackingModule(private val context: ReactApplicationContext) :
  NativeTrackingSpec(context) {

  private val queue by lazy { FixQueue(context) }

  override fun getName(): String = NAME

  /**
   * Idempotent, as the contract promises.
   *
   * `startForegroundService` on an already-running service delivers another
   * `onStartCommand` rather than starting a second one, and the service treats
   * that as a cadence update. A driver who taps twice does not double their
   * battery cost.
   */
  override fun start(tripId: String, sampleIntervalSeconds: Double, promise: Promise) {
    try {
      val seconds = sampleIntervalSeconds.toInt().coerceAtLeast(1)
      TrackingState.remember(context, tripId, seconds)
      TrackingService.start(context, tripId, seconds)
      promise.resolve(null)
    } catch (failure: Exception) {
      promise.reject(E_START, failure)
    }
  }

  /** Stops capturing. Deletes nothing: the queue is evidence, not a cache. */
  override fun stop(promise: Promise) {
    try {
      TrackingState.forget(context)
      TrackingService.stop(context)
      promise.resolve(null)
    } catch (failure: Exception) {
      promise.reject(E_STOP, failure)
    }
  }

  override fun setSampleInterval(seconds: Double, promise: Promise) {
    try {
      val next = seconds.toInt().coerceAtLeast(1)
      val tripId = TrackingState.tripId(context)

      if (!TrackingState.isRunning(context) || tripId.isEmpty()) {
        // Not an error. The policy recomputes the cadence on every tick and
        // will happily ask for one while no trip is on; rejecting would turn a
        // no-op into an exception the caller has to special-case.
        promise.resolve(null)
        return
      }

      TrackingState.remember(context, tripId, next)
      TrackingService.start(context, tripId, next)
      promise.resolve(null)
    } catch (failure: Exception) {
      promise.reject(E_INTERVAL, failure)
    }
  }

  override fun status(promise: Promise) {
    try {
      val map: WritableMap = Arguments.createMap()
      map.putBoolean("running", TrackingState.isRunning(context) && serviceIsUp())
      map.putString("tripId", TrackingState.tripId(context))
      map.putInt("queued", queue.depth())
      map.putDouble("lastFixAt", queue.lastFixAt().toDouble())
      map.putBoolean("restrictedByOs", restricted())
      promise.resolve(map)
    } catch (failure: Exception) {
      promise.reject(E_STATUS, failure)
    }
  }

  override fun peek(limit: Double, promise: Promise) {
    try {
      val rows = queue.peek(limit.toInt().coerceAtLeast(1))
      val out: WritableArray = Arguments.createArray()
      rows.forEach { fix ->
        val map = Arguments.createMap()
        map.putString("id", fix.id)
        map.putDouble("lat", fix.lat)
        map.putDouble("lon", fix.lon)
        map.putDouble("accuracy", fix.accuracy)
        map.putDouble("at", fix.at.toDouble())
        map.putDouble("speed", fix.speed)
        map.putDouble("battery", fix.battery)
        out.pushMap(map)
      }
      promise.resolve(out)
    } catch (failure: Exception) {
      promise.reject(E_PEEK, failure)
    }
  }

  override fun acknowledge(ids: ReadableArray, promise: Promise) {
    try {
      val names = (0 until ids.size()).mapNotNull { ids.getString(it) }
      promise.resolve(queue.acknowledge(names))
    } catch (failure: Exception) {
      promise.reject(E_ACK, failure)
    }
  }

  override fun queueDepth(promise: Promise) {
    try {
      promise.resolve(queue.depth().toDouble())
    } catch (failure: Exception) {
      promise.reject(E_DEPTH, failure)
    }
  }

  /**
   * Whether the OS has decided this app should not run in the background.
   *
   * The single most important thing this module reports. On Transsion
   * handsets — which dominate the driver segment — aggressive battery
   * management kills a foreground service, and the app's own logs are the last
   * place anybody looks. Two questions, because they fail differently:
   * background restriction is a setting, and being outside the doze whitelist
   * is a permission the user granted or did not.
   */
  private fun restricted(): Boolean {
    val activity = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
    val backgroundRestricted =
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && activity?.isBackgroundRestricted == true

    val power = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
    val dozed = power?.isIgnoringBatteryOptimizations(context.packageName) == false

    return backgroundRestricted || dozed
  }

  /**
   * Whether the service is actually up, rather than whether we asked for it.
   *
   * `getRunningServices` is deprecated for inspecting *other* apps and still
   * works for one's own, which is the whole use here: a phone that killed the
   * service should report `running: false` rather than repeating what this app
   * last intended.
   */
  @Suppress("DEPRECATION")
  private fun serviceIsUp(): Boolean {
    val activity = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
      ?: return false
    return activity.getRunningServices(Int.MAX_VALUE)
      .any { it.service.className == TrackingService::class.java.name }
  }

  companion object {
    const val NAME = "NativeTracking"

    private const val E_START = "E_TRACKING_START"
    private const val E_STOP = "E_TRACKING_STOP"
    private const val E_INTERVAL = "E_TRACKING_INTERVAL"
    private const val E_STATUS = "E_TRACKING_STATUS"
    private const val E_PEEK = "E_TRACKING_PEEK"
    private const val E_ACK = "E_TRACKING_ACK"
    private const val E_DEPTH = "E_TRACKING_DEPTH"
  }
}
