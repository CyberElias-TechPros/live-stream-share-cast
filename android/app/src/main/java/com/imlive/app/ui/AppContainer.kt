package com.imlive.app.ui

import android.content.Context
import com.imlive.app.auth.AuthRepository
import com.imlive.app.auth.SecureTokenStore
import com.imlive.app.data.AppPreferences
import com.imlive.app.data.PlatformRepository
import com.imlive.app.live.LiveRepository
import com.imlive.app.media.BroadcastSessionManager
import com.imlive.app.network.ApiClient
import com.imlive.app.network.NetworkMonitor
import com.imlive.app.network.ServerEndpointStore

/**
 * Process-scoped dependency graph for the native Android app.
 *
 * Ensures that configuration changes (rotation, split-screen, foldables) and
 * screen navigation never tear down active WebRTC broadcasts, network monitors,
 * or refresh-token locks.
 */
class ImLiveContainer(context: Context) {
    private val appContext = context.applicationContext

    val tokenStore = SecureTokenStore(appContext)
    val preferences = AppPreferences(appContext)
    val endpointStore = ServerEndpointStore(appContext)
    val networkMonitor = NetworkMonitor(appContext)
    val apiClient = ApiClient(appContext, tokenStore, endpointStore)
    val authRepository = AuthRepository(appContext, apiClient, tokenStore)
    val liveRepository = LiveRepository(apiClient)
    val platformRepository = PlatformRepository(apiClient)
    val broadcastManager = BroadcastSessionManager(
        context = appContext,
        liveRepository = liveRepository,
        platformRepository = platformRepository,
        apiBaseUrlProvider = { endpointStore.apiBaseUrl },
    )

    companion object {
        @Volatile
        private var instance: ImLiveContainer? = null

        fun get(context: Context): ImLiveContainer {
            val current = instance
            if (current != null) return current
            return synchronized(this) {
                instance ?: ImLiveContainer(context.applicationContext).also { instance = it }
            }
        }
    }
}
