package com.backhaul.tracking

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Brings the loop back after a reboot.
 *
 * A trip runs for three days and a phone in a lorry park restarts — flat
 * battery, a knock, an update. Without this the trip resumes when somebody
 * next opens the app, and the gap between the reboot and that moment is
 * exactly the kind of hole a delivery gets argued about.
 *
 * It only restarts what was already running: `TrackingState` remembers, and a
 * phone that rebooted while no trip was on comes back doing nothing.
 */
class BootReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    if (!TrackingState.isRunning(context)) return

    val tripId = TrackingState.tripId(context)
    if (tripId.isEmpty()) return

    TrackingService.start(context, tripId, TrackingState.interval(context))
  }
}
