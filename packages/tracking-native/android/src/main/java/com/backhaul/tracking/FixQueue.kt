package com.backhaul.tracking

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

/**
 * Where fixes live between capture and acknowledgement.
 *
 * SQLite rather than a file or a queue in memory, for one reason: **a fix must
 * survive the process being killed.** Android will kill this app while a
 * driver is asleep in a lorry park, and the whole subsystem exists so that the
 * stretch of road nobody can account for afterwards is not the stretch the
 * phone forgot.
 *
 * The queue decides nothing. It stores, it hands back the oldest rows, and it
 * deletes exactly the ids it is told to delete. Every judgement — how often to
 * capture, when to upload, what may be deleted — is in `@backhaul/domain`, on
 * the JavaScript side, so both platforms cannot drift into disagreeing.
 */
internal class FixQueue(context: Context) :
  SQLiteOpenHelper(context.applicationContext, NAME, null, VERSION) {

  override fun onCreate(db: SQLiteDatabase) {
    // `id` is the client-generated key from capture, and it is the primary
    // key, which makes duplicate delivery harmless by construction rather than
    // by a check somebody has to remember to write.
    db.execSQL(
      """
      CREATE TABLE IF NOT EXISTS fixes (
        id TEXT PRIMARY KEY NOT NULL,
        trip_id TEXT NOT NULL,
        lat REAL NOT NULL,
        lon REAL NOT NULL,
        accuracy REAL NOT NULL,
        at INTEGER NOT NULL,
        speed REAL NOT NULL,
        battery REAL NOT NULL
      )
      """.trimIndent(),
    )
    // Every read is "the oldest rows", and every one of them is this index.
    db.execSQL("CREATE INDEX IF NOT EXISTS fixes_at ON fixes (at)")
  }

  override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
    // There has never been an older version. When there is, this migrates it —
    // it does not drop the table. The rows here are evidence.
  }

  fun insert(fix: CapturedFix) {
    writableDatabase.execSQL(
      "INSERT OR IGNORE INTO fixes (id, trip_id, lat, lon, accuracy, at, speed, battery) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      arrayOf<Any>(
        fix.id,
        fix.tripId,
        fix.lat,
        fix.lon,
        fix.accuracy,
        fix.at,
        fix.speed,
        fix.battery,
      ),
    )
  }

  /** The oldest `limit` rows, left where they are. */
  fun peek(limit: Int): List<CapturedFix> {
    val out = mutableListOf<CapturedFix>()
    readableDatabase.rawQuery(
      "SELECT id, trip_id, lat, lon, accuracy, at, speed, battery FROM fixes " +
        "ORDER BY at ASC LIMIT ?",
      arrayOf(limit.toString()),
    ).use { cursor ->
      while (cursor.moveToNext()) {
        out.add(
          CapturedFix(
            id = cursor.getString(0),
            tripId = cursor.getString(1),
            lat = cursor.getDouble(2),
            lon = cursor.getDouble(3),
            accuracy = cursor.getDouble(4),
            at = cursor.getLong(5),
            speed = cursor.getDouble(6),
            battery = cursor.getDouble(7),
          ),
        )
      }
    }
    return out
  }

  /**
   * Deletes exactly these ids, and answers how many rows went.
   *
   * Not "the batch that was sent" and not a count — the ids the server named.
   * A device that deletes the batch it *sent* loses whatever the server did not
   * commit, and that loss is silent. See ADR-0009.
   */
  fun acknowledge(ids: List<String>): Int {
    if (ids.isEmpty()) return 0

    val db = writableDatabase
    var removed = 0
    db.beginTransaction()
    try {
      // Chunked: SQLite's default variable limit is 999, and a device that has
      // been offline for a day can acknowledge more than that at once.
      ids.chunked(500).forEach { chunk ->
        val marks = chunk.joinToString(",") { "?" }
        removed += db.compileStatement("DELETE FROM fixes WHERE id IN ($marks)").use { statement ->
          chunk.forEachIndexed { index, id -> statement.bindString(index + 1, id) }
          statement.executeUpdateDelete()
        }
      }
      db.setTransactionSuccessful()
    } finally {
      db.endTransaction()
    }
    return removed
  }

  fun depth(): Int =
    readableDatabase.rawQuery("SELECT COUNT(*) FROM fixes", null).use { cursor ->
      if (cursor.moveToFirst()) cursor.getInt(0) else 0
    }

  fun lastFixAt(): Long =
    readableDatabase.rawQuery("SELECT MAX(at) FROM fixes", null).use { cursor ->
      if (cursor.moveToFirst() && !cursor.isNull(0)) cursor.getLong(0) else -1L
    }

  private companion object {
    const val NAME = "backhaul-fixes.db"
    const val VERSION = 1
  }
}

internal data class CapturedFix(
  val id: String,
  val tripId: String,
  val lat: Double,
  val lon: Double,
  val accuracy: Double,
  val at: Long,
  val speed: Double,
  val battery: Double,
)
