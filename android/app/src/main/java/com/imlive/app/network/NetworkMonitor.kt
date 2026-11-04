package com.imlive.app.network

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class NetworkStatus(
    val isOnline: Boolean = true,
    val isWifi: Boolean = false,
    val isMetered: Boolean = false,
)

class NetworkMonitor(context: Context) {
    private val connectivity = context.applicationContext.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
    private val _status = MutableStateFlow(currentStatus())
    val status: StateFlow<NetworkStatus> = _status.asStateFlow()

    private val callback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            _status.value = currentStatus()
        }

        override fun onLost(network: Network) {
            _status.value = currentStatus()
        }

        override fun onCapabilitiesChanged(network: Network, networkCapabilities: NetworkCapabilities) {
            _status.value = currentStatus()
        }
    }

    init {
        runCatching { connectivity.registerDefaultNetworkCallback(callback) }
    }

    private fun currentStatus(): NetworkStatus {
        return runCatching {
            val active = connectivity.activeNetwork ?: return NetworkStatus(isOnline = false)
            val caps = connectivity.getNetworkCapabilities(active) ?: return NetworkStatus(isOnline = false)
            val hasInternet = caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            val isWifi = caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) ||
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)
            val isMetered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
            NetworkStatus(isOnline = hasInternet, isWifi = isWifi, isMetered = isMetered)
        }.getOrDefault(NetworkStatus(isOnline = true))
    }
}
