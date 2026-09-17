package com.backhaul.tracking

import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.NetworkType
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.util.concurrent.TimeUnit

/**
 * The phone woken to send what it holds, Android side.
 *
 * Two verbs and a no-op. `schedule` asks WorkManager to run [OutboxWorker]
 * whenever the phone has a network, on the fifteen-minute floor a periodic
 * job has; `cancel` withdraws it. Nothing here reads a draft or holds a
 * token — the worker starts the JavaScript sweep and the sweep does the
 * rest. See ADR-0023.
 *
 * `KEEP` rather than `REPLACE`: sealing a second delivery while the first
 * is still waiting must not push the next run another fifteen minutes out.
 */
class OutboxModule(private val context: ReactApplicationContext) :
  NativeOutboxSpec(context) {

  override fun getName(): String = NAME

  override fun schedule(promise: Promise) {
    try {
      val constraints = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

      val request = PeriodicWorkRequestBuilder<OutboxWorker>(15, TimeUnit.MINUTES)
        .setConstraints(constraints)
        .build()

      WorkManager.getInstance(context)
        .enqueueUniquePeriodicWork(WORK, ExistingPeriodicWorkPolicy.KEEP, request)
      promise.resolve(null)
    } catch (failure: Exception) {
      promise.reject(E_SCHEDULE, failure)
    }
  }

  override fun cancel(promise: Promise) {
    try {
      WorkManager.getInstance(context).cancelUniqueWork(WORK)
      promise.resolve(null)
    } catch (failure: Exception) {
      promise.reject(E_CANCEL, failure)
    }
  }

  /** iOS has a task to end. Android's worker ends when the JavaScript task does. */
  override fun finished(promise: Promise) {
    promise.resolve(null)
  }

  override fun addListener(eventName: String) = Unit

  override fun removeListeners(count: Double) = Unit

  companion object {
    const val NAME = "NativeOutbox"

    /** The unique work name; one job per phone, however many deliveries. */
    const val WORK = "backhaul.outbox"

    private const val E_SCHEDULE = "E_OUTBOX_SCHEDULE"
    private const val E_CANCEL = "E_OUTBOX_CANCEL"
  }
}
