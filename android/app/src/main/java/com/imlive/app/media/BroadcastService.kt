package com.imlive.app.media

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.imlive.app.R

/** Keeps the creator session foreground-visible; media capture is never hidden in background. */
class BroadcastService : Service() {
    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Live broadcast", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shows while your camera or microphone is broadcasting"
                setSound(null, null)
            },
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val title = intent?.getStringExtra(EXTRA_TITLE) ?: "Broadcasting"
        startForeground(NOTIFICATION_ID, notification(title))
        // Do not silently resurrect a notification without a live media session;
        // a future WorkManager/session coordinator can opt into restoration.
        return START_NOT_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private fun notification(title: String): Notification = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_launcher)
        .setContentTitle("I'm Live")
        .setContentText(title)
        .setOngoing(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .build()

    private companion object {
        const val CHANNEL_ID = "live_broadcast"
        const val NOTIFICATION_ID = 4101
        const val EXTRA_TITLE = "title"
    }
}
