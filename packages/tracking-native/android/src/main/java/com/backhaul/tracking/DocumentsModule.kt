package com.backhaul.tracking

import android.content.Intent
import android.util.Base64
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import java.io.File

/**
 * A file handed to whatever the consignee uses, Android side.
 *
 * Written to the app's own cache and offered through a `FileProvider`, which
 * is the only way one app hands another a file on Android since 7. The
 * provider's authority is derived from the application id in the manifest,
 * so the same library serves whichever package it is linked into.
 *
 * The file is not the record — the draft the outbox holds is — so nothing
 * here keeps it, and the cache is the platform's to clear. See ADR-0024.
 */
class DocumentsModule(private val context: ReactApplicationContext) :
  NativeDocumentsSpec(context) {

  override fun getName(): String = NAME

  override fun share(fileName: String, mimeType: String, base64: String, title: String, promise: Promise) {
    try {
      val folder = File(context.cacheDir, FOLDER).apply { mkdirs() }
      // The name is the caller's, minus anything that would leave the folder.
      val file = File(folder, fileName.replace(Regex("[^A-Za-z0-9._-]"), "_"))
      file.writeBytes(Base64.decode(base64, Base64.DEFAULT))

      val uri = FileProvider.getUriForFile(context, "${context.packageName}$AUTHORITY", file)
      val send = Intent(Intent.ACTION_SEND).apply {
        type = mimeType
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_SUBJECT, title)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      val chooser = Intent.createChooser(send, title)

      val activity = context.currentActivity
      if (activity != null) {
        activity.startActivity(chooser)
      } else {
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(chooser)
      }
      promise.resolve(null)
    } catch (failure: Exception) {
      promise.reject(E_SHARE, failure)
    }
  }

  companion object {
    const val NAME = "NativeDocuments"

    /** Under the cache directory; matches `res/xml/backhaul_documents_paths.xml`. */
    const val FOLDER = "documents"

    /** Appended to the application id; matches the provider in the manifest. */
    const val AUTHORITY = ".backhaul.documents"

    private const val E_SHARE = "E_DOCUMENTS_SHARE"
  }
}
