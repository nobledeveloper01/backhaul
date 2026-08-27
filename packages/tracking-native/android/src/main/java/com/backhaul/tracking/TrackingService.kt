package com.backhaul.tracking

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.BatteryManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import java.util.UUID

/**
 * The capture loop.
 *
 * A **foreground service**, which on Android is the only way to keep receiving
 * location while the app is backgrounded, the screen is off and the driver is
 * asleep. It shows a notification because it must, and the notification is
 * written as something a driver should be glad to see rather than as the
 * apology most apps put there.
 *
 * It captures and stores. It uploads nothing and decides nothing: the cadence
 * arrives from the JavaScript side, which computes it with `decide()` from
 * `@backhaul/domain`, and the upload loop reads the queue through the module.
 *
 * `LocationManager` rather than Play Services' fused provider, deliberately.
 * The handsets that dominate this market are Transsion devices, many sold
 * without Google Play Services at all, and a tracking product that silently
 * records nothing on those phones is worse than one that never claimed to.
 */
class TrackingService : Service(), LocationListener {

  private lateinit var queue: FixQueue
  private var manager: LocationManager? = null

  private var tripId: String = ""
  private var intervalSeconds: Int = DEFAULT_INTERVAL_SECONDS

  override fun onCreate() {
    super.onCreate()
    queue = FixQueue(this)
    manager = getSystemService(Context.LOCATION_SERVICE) as? LocationManager
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val requestedTrip = intent?.getStringExtra(EXTRA_TRIP_ID)
    val requestedInterval = intent?.getIntExtra(EXTRA_INTERVAL, DEFAULT_INTERVAL_SECONDS)

    if (requestedTrip != null) tripId = requestedTrip
    if (requestedInterval != null && requestedInterval > 0) intervalSeconds = requestedInterval

    startInForeground()
    listen()

    // START_STICKY: if Android kills this for memory, bring it back. A trip
    // whose service died at 2am and stayed dead is a trip with a hole in it,
    // and the hole is invisible until somebody argues about the delivery.
    return START_STICKY
  }

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    manager?.removeUpdates(this)
    super.onDestroy()
  }

  /**
   * Re-requests updates at the current cadence.
   *
   * Called on start and whenever the interval changes. `requestLocationUpdates`
   * replaces a previous request from the same listener, so this does not need
   * to remove first — and removing would drop a fix that was already in flight.
   */
  private fun listen() {
    val locations = manager ?: return
    val provider = when {
      locations.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
      locations.isProviderEnabled(LocationManager.NETWORK_PROVIDER) ->
        LocationManager.NETWORK_PROVIDER
      else -> return
    }

    try {
      locations.requestLocationUpdates(
        provider,
        intervalSeconds * 1_000L,
        // No minimum distance. A stationary truck's *duration* is what a
        // demurrage claim is made of, and a stop with no fixes has no duration.
        0f,
        this,
        Looper.getMainLooper(),
      )
    } catch (denied: SecurityException) {
      // The permission was revoked while running. Nothing to do here: the
      // module reports `restrictedByOs` and the driver's screen says so.
      stopSelf()
    }
  }

  override fun onLocationChanged(location: Location) {
    queue.insert(
      CapturedFix(
        // Generated at capture, on the device, and carried unchanged to the
        // server. It is the deduplication key end to end, which is what makes
        // a retried upload harmless.
        id = UUID.randomUUID().toString(),
        tripId = tripId,
        lat = location.latitude,
        lon = location.longitude,
        accuracy = if (location.hasAccuracy()) location.accuracy.toDouble() else UNKNOWN,
        at = location.time,
        speed = if (location.hasSpeed()) location.speed.toDouble() else UNKNOWN,
        battery = batteryFraction(),
      ),
    )
  }

  /**
   * 0–1, or −1 when the OS will not say.
   *
   * Captured with every fix rather than sampled separately: the tracking
   * policy drops to `conserving` below 15%, and a battery reading that arrived
   * a minute after the fix it belongs to would make that decision on stale
   * information.
   */
  private fun batteryFraction(): Double {
    val status = registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
      ?: return UNKNOWN
    val level = status.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
    val scale = status.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
    return if (level < 0 || scale <= 0) UNKNOWN else level.toDouble() / scale.toDouble()
  }

  private fun startInForeground() {
    val notifications = getSystemService(NotificationManager::class.java)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        CHANNEL_ID,
        "Trip recording",
        // LOW: it must be visible and it must never make a sound. A driver on
        // a three-day run should forget this is here.
        NotificationManager.IMPORTANCE_LOW,
      )
      channel.description = "Shown while a trip is being recorded."
      notifications?.createNotificationChannel(channel)
    }

    val open = packageManager.getLaunchIntentForPackage(packageName)?.let { intent ->
      PendingIntent.getActivity(
        this,
        0,
        intent,
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
      )
    }

    val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Recording your trip")
      // Says who can see it. The consent block on the driver's screen makes
      // the same promise, and a notification that said something vaguer would
      // be the one place the product was cagey about it.
      .setContentText("Your carrier and the cargo owner can see where you are.")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setOngoing(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .setContentIntent(open)
      .build()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      startForeground(
        NOTIFICATION_ID,
        notification,
        android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION,
      )
    } else {
      startForeground(NOTIFICATION_ID, notification)
    }
  }

  companion object {
    const val EXTRA_TRIP_ID = "tripId"
    const val EXTRA_INTERVAL = "intervalSeconds"

    private const val CHANNEL_ID = "backhaul.tracking"
    private const val NOTIFICATION_ID = 4_812
    private const val DEFAULT_INTERVAL_SECONDS = 60
    private const val UNKNOWN = -1.0

    fun start(context: Context, tripId: String, intervalSeconds: Int) {
      val intent = Intent(context, TrackingService::class.java)
        .putExtra(EXTRA_TRIP_ID, tripId)
        .putExtra(EXTRA_INTERVAL, intervalSeconds)
      context.startForegroundService(intent)
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, TrackingService::class.java))
    }
  }
}
