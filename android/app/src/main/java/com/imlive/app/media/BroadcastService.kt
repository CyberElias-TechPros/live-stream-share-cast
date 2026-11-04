package com.imlive.app.media

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.imlive.app.MainActivity
import com.imlive.app.R

/**
 * Android 14/15 (`targetSdk = 35`) compliant camera + microphone foreground service.
 *
 * Exposes persistent system notification controls to return to the studio,
 * mute/unmute the microphone, or stop the broadcast from anywhere on the phone.
 */
class BroadcastService : Service() {
    override fun onCreate() {
        super.onCreate()
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Live broadcast", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shows while your camera or microphone is broadcasting live"
                setSound(null, null)
            },
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_TOGGLE_MIC -> {
                BroadcastSessionRegistry.onToggleMicFromNotification?.invoke()
                val title = intent.getStringExtra(EXTRA_TITLE) ?: BroadcastSessionRegistry.currentTitle
                val muted = BroadcastSessionRegistry.isMicMuted
                postForeground(title, muted)
                return START_NOT_STICKY
            }
            ACTION_STOP -> {
                BroadcastSessionRegistry.onStopFromNotification?.invoke()
                stopSelf()
                return START_NOT_STICKY
            }
        }

        val title = intent?.getStringExtra(EXTRA_TITLE) ?: BroadcastSessionRegistry.currentTitle
        val muted = intent?.getBooleanExtra(EXTRA_MIC_MUTED, BroadcastSessionRegistry.isMicMuted) ?: false
        BroadcastSessionRegistry.currentTitle = title
        BroadcastSessionRegistry.isMicMuted = muted
        postForeground(title, muted)
        return START_NOT_STICKY
    }

    private fun postForeground(title: String, micMuted: Boolean) {
        val fgsType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
        } else {
            0
        }
        ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(title, micMuted), fgsType)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        super.onDestroy()
    }

    private fun notification(title: String, micMuted: Boolean): Notification {
        val openAppIntent = PendingIntent.getActivity(
            this,
            100,
            Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val muteIntent = PendingIntent.getService(
            this,
            101,
            Intent(this, BroadcastService::class.java).setAction(ACTION_TOGGLE_MIC).putExtra(EXTRA_TITLE, title),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
        val stopIntent = PendingIntent.getService(
            this,
            102,
            Intent(this, BroadcastService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher)
            .setContentTitle("LIVE · $title")
            .setContentText(if (micMuted) "Microphone muted · Camera active" else "Broadcasting camera & microphone")
            .setContentIntent(openAppIntent)
            .setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(0, if (micMuted) "Unmute mic" else "Mute mic", muteIntent)
            .addAction(0, "End broadcast", stopIntent)
            .build()
    }

    companion object {
        const val CHANNEL_ID = "live_broadcast"
        const val NOTIFICATION_ID = 4101
        const val EXTRA_TITLE = "title"
        const val EXTRA_MIC_MUTED = "mic_muted"
        const val ACTION_TOGGLE_MIC = "com.imlive.app.action.TOGGLE_MIC"
        const val ACTION_STOP = "com.imlive.app.action.STOP_BROADCAST"
    }
}

object BroadcastSessionRegistry {
    @Volatile var currentTitle: String = "Broadcasting"
    @Volatile var isMicMuted: Boolean = false
    @Volatile var onToggleMicFromNotification: (() -> Unit)? = null
    @Volatile var onStopFromNotification: (() -> Unit)? = null
}
