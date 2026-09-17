package com.backhaul.tracking

import android.content.Context
import androidx.work.Worker
import androidx.work.WorkerParameters
import com.facebook.react.ReactApplication
import com.facebook.react.ReactInstanceEventListener
import com.facebook.react.bridge.ReactContext
import com.facebook.react.bridge.UiThreadUtil
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import com.facebook.react.jstasks.HeadlessJsTaskContext
import com.facebook.react.jstasks.HeadlessJsTaskEventListener
import com.facebook.react.bridge.Arguments
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * What WorkManager runs: the JavaScript outbox sweep, with no screen.
 *
 * Deliberately **not** a `HeadlessJsTaskService`. A service started from a
 * background job is refused on Android 8 and later unless it goes foreground
 * with a notification, and a notification for "sending a form you already
 * signed" is noise in a driver's shade. A worker already has the process and
 * the window; what it lacks is a React context, and that is what the lines
 * below get — the same way `HeadlessJsTaskService` does, without the service.
 *
 * The worker decides nothing. It starts the task the JavaScript side
 * registered under [TASK] and waits for it to finish; whether anything was
 * sent, and whether this job should keep running, is the sweep's to say
 * (it calls `cancel` when nothing is left). See ADR-0023.
 */
class OutboxWorker(context: Context, params: WorkerParameters) : Worker(context, params) {

  override fun doWork(): Result {
    val application = applicationContext as? ReactApplication ?: return Result.failure()
    val host = application.reactHost ?: return Result.failure()

    val done = CountDownLatch(1)
    val config = HeadlessJsTaskConfig(
      TASK,
      Arguments.createMap(),
      TIMEOUT_MS,
      // Not allowed in the foreground: if the app is open, its own sweep is
      // already running and two sweeps would send the same draft twice.
      false,
    )

    val start = { reactContext: ReactContext ->
      val tasks = HeadlessJsTaskContext.getInstance(reactContext)
      tasks.addTaskEventListener(object : HeadlessJsTaskEventListener {
        override fun onHeadlessJsTaskStart(taskId: Int) = Unit

        override fun onHeadlessJsTaskFinish(taskId: Int) {
          tasks.removeTaskEventListener(this)
          done.countDown()
        }
      })
      UiThreadUtil.runOnUiThread {
        try {
          tasks.startTask(config)
        } catch (refused: IllegalStateException) {
          // "Tried to start a task while in foreground" — the app is open and
          // sweeping for itself. Nothing to do here.
          done.countDown()
        }
      }
    }

    UiThreadUtil.runOnUiThread {
      val current = host.currentReactContext
      if (current != null) {
        start(current)
      } else {
        host.addReactInstanceEventListener(object : ReactInstanceEventListener {
          override fun onReactContextInitialized(context: ReactContext) {
            host.removeReactInstanceEventListener(this)
            start(context)
          }
        })
        host.start()
      }
    }

    // WorkManager gives ten minutes; the task's own timeout is shorter, so
    // this wait ends with the task rather than with the OS killing the job.
    val finished = done.await(TIMEOUT_MS + 5_000, TimeUnit.MILLISECONDS)
    return if (finished) Result.success() else Result.retry()
  }

  companion object {
    /** Must match `OUTBOX_TASK` in `src/index.ts`, which `index.js` registers. */
    const val TASK = "BackhaulOutboxSweep"

    /** Long enough for four deliveries on one bar of signal; short of WorkManager's ten. */
    const val TIMEOUT_MS = 8L * 60L * 1000L
  }
}
