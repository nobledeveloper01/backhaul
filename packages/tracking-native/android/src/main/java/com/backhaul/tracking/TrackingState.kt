package com.backhaul.tracking

import android.content.Context
import android.content.SharedPreferences

/**
 * What the loop should be doing, across a process death.
 *
 * The service is `START_STICKY` and the device reboots, so "is a trip
 * running?" has to survive the app's own memory. Three fields in
 * `SharedPreferences` — small enough that SQLite would be ceremony, and
 * separate from the queue because losing this is recoverable and losing the
 * queue is not.
 */
internal object TrackingState {

  fun remember(context: Context, tripId: String, intervalSeconds: Int) {
    prefs(context).edit()
      .putBoolean(RUNNING, true)
      .putString(TRIP, tripId)
      .putInt(INTERVAL, intervalSeconds)
      .apply()
  }

  fun forget(context: Context) {
    prefs(context).edit().putBoolean(RUNNING, false).apply()
  }

  fun isRunning(context: Context): Boolean = prefs(context).getBoolean(RUNNING, false)

  fun tripId(context: Context): String = prefs(context).getString(TRIP, "") ?: ""

  fun interval(context: Context): Int = prefs(context).getInt(INTERVAL, 60)

  private fun prefs(context: Context): SharedPreferences =
    context.applicationContext.getSharedPreferences("backhaul.tracking", Context.MODE_PRIVATE)

  private const val RUNNING = "running"
  private const val TRIP = "tripId"
  private const val INTERVAL = "intervalSeconds"
}
