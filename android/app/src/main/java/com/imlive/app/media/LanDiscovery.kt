package com.imlive.app.media

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.net.wifi.WifiManager
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class DiscoveredLanHost(
    val serviceName: String,
    val title: String,
    val hostAddress: String,
    val port: Int,
)

/**
 * Zero-configuration local Wi-Fi mDNS/DNS-SD discovery (`_imlive._tcp.`) using
 * Android's native `NsdManager`. Advertises only the broadcast title and TCP port
 * (never the room code, which remains a human PIN verification on the host screen).
 */
class LanRoomAdvertiser(context: Context) {
    private val nsd = context.applicationContext.getSystemService(Context.NSD_SERVICE) as? NsdManager
    private var registrationListener: NsdManager.RegistrationListener? = null

    fun advertise(room: LanRoomInfo) {
        stop()
        val manager = nsd ?: return
        val safeTitle = room.title.replace("|", " ").take(36).ifBlank { "LAN Broadcast" }
        val info = NsdServiceInfo().apply {
            serviceName = "ImLive|$safeTitle"
            serviceType = SERVICE_TYPE
            port = room.port
        }
        val listener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(serviceInfo: NsdServiceInfo) = Unit
            override fun onRegistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = Unit
            override fun onServiceUnregistered(serviceInfo: NsdServiceInfo) = Unit
            override fun onUnregistrationFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = Unit
        }
        registrationListener = listener
        runCatching { manager.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener) }
    }

    fun stop() {
        val listener = registrationListener ?: return
        registrationListener = null
        runCatching { nsd?.unregisterService(listener) }
    }

    private companion object {
        const val SERVICE_TYPE = "_imlive._tcp."
    }
}

class LanRoomBrowser(context: Context) {
    private val appContext = context.applicationContext
    private val nsd = appContext.getSystemService(Context.NSD_SERVICE) as? NsdManager
    private val wifi = appContext.getSystemService(Context.WIFI_SERVICE) as? WifiManager
    private var multicastLock: WifiManager.MulticastLock? = null
    private var discoveryListener: NsdManager.DiscoveryListener? = null

    private val _hosts = MutableStateFlow<List<DiscoveredLanHost>>(emptyList())
    val hosts: StateFlow<List<DiscoveredLanHost>> = _hosts.asStateFlow()

    fun start() {
        stop()
        val manager = nsd ?: return
        runCatching {
            multicastLock = wifi?.createMulticastLock("imlive_nsd")?.apply {
                setReferenceCounted(false)
                acquire()
            }
        }
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(regType: String) = Unit
            override fun onDiscoveryStopped(serviceType: String) = Unit
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) { stop() }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) { stop() }

            override fun onServiceFound(service: NsdServiceInfo) {
                if (!service.serviceType.contains("_imlive._tcp")) return
                @Suppress("DEPRECATION")
                runCatching {
                    manager.resolveService(
                        service,
                        object : NsdManager.ResolveListener {
                            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = Unit
                            override fun onServiceResolved(resolved: NsdServiceInfo) {
                                @Suppress("DEPRECATION")
                                val hostIp = resolved.host?.hostAddress ?: return
                                val port = resolved.port
                                if (port <= 0) return
                                val rawName = resolved.serviceName ?: "ImLive"
                                val title = rawName.substringAfter("ImLive|", rawName).ifBlank { "LAN Broadcast" }
                                val entry = DiscoveredLanHost(rawName, title, hostIp, port)
                                _hosts.value = (_hosts.value.filterNot { it.hostAddress == hostIp && it.port == port } + entry)
                            }
                        },
                    )
                }
            }

            override fun onServiceLost(service: NsdServiceInfo) {
                _hosts.value = _hosts.value.filterNot { it.serviceName == service.serviceName }
            }
        }
        discoveryListener = listener
        runCatching { manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener) }
    }

    fun stop() {
        discoveryListener?.let { listener ->
            discoveryListener = null
            runCatching { nsd?.stopServiceDiscovery(listener) }
        }
        runCatching {
            if (multicastLock?.isHeld == true) multicastLock?.release()
        }
        multicastLock = null
    }

    private companion object {
        const val SERVICE_TYPE = "_imlive._tcp."
    }
}
