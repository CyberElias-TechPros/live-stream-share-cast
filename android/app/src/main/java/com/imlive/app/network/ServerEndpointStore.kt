package com.imlive.app.network

import android.content.Context
import com.imlive.app.BuildConfig
import com.imlive.app.media.LanRoomInfo
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.URI

sealed interface DeepLinkDestination {
    data class Watch(val streamId: String) : DeepLinkDestination
    data class Profile(val username: String) : DeepLinkDestination
    data class LibraryRecording(val recordingId: String) : DeepLinkDestination
    data class ResetPassword(val token: String) : DeepLinkDestination
    data class VerifyEmail(val token: String) : DeepLinkDestination
    data class JoinLan(val room: LanRoomInfo) : DeepLinkDestination
}

object EndpointUrlRules {
    /**
     * Normalizes an API base URL so it always ends with `/api` without trailing slashes,
     * and validates scheme safety (HTTPS required in release builds; HTTP allowed in debug).
     */
    fun normalizeApiBaseUrl(raw: String, allowInsecureHttp: Boolean): Result<String> = runCatching {
        val trimmed = raw.trim().trimEnd('/')
        require(trimmed.isNotEmpty()) { "Enter the Worker API URL" }
        val parsed = URI(trimmed)
        val scheme = parsed.scheme?.lowercase() ?: error("Include https:// in the server URL")
        require(scheme == "https" || (allowInsecureHttp && scheme == "http")) {
            "Production connections require an https:// Worker URL"
        }
        require(!parsed.host.isNullOrBlank()) { "Enter a valid server hostname" }
        if (trimmed.endsWith("/api")) trimmed else "$trimmed/api"
    }

    fun toWebSocketBaseUrl(apiBaseUrl: String): String =
        apiBaseUrl.trimEnd('/')
            .replaceFirst("https://", "wss://")
            .replaceFirst("http://", "ws://")

    fun toOriginUrl(apiBaseUrl: String): String =
        apiBaseUrl.trimEnd('/').removeSuffix("/api")

    fun resolveMediaUrl(apiBaseUrl: String, mediaPathOrUrl: String): String {
        val clean = mediaPathOrUrl.trim()
        if (clean.startsWith("http://") || clean.startsWith("https://")) return clean
        val origin = toOriginUrl(apiBaseUrl)
        return if (clean.startsWith("/")) "$origin$clean" else "$origin/$clean"
    }

    /** Pure URI deep-link parser shared by MainActivity and JVM unit tests. */
    fun parseDeepLink(rawUri: String?): DeepLinkDestination? {
        if (rawUri.isNullOrBlank()) return null
        val uri = runCatching { URI(rawUri.trim()) }.getOrNull() ?: return null
        val scheme = uri.scheme?.lowercase() ?: return null
        val query = parseQuery(uri.rawQuery)

        if (scheme == "imlive") {
            val host = uri.host?.lowercase().orEmpty()
            val segments = (uri.path ?: "").split('/').filter(String::isNotBlank)
            return when (host) {
                "lan" -> {
                    val ip = query["host"]?.trim().orEmpty()
                    val port = query["port"]?.toIntOrNull() ?: return null
                    val code = query["code"]?.trim()?.uppercase().orEmpty()
                    val title = query["title"]?.trim().orEmpty().ifBlank { "LAN broadcast" }
                    if (ip.isNotBlank() && port in 1..65535 && code.length >= 4) {
                        DeepLinkDestination.JoinLan(LanRoomInfo(ip, port, code, title))
                    } else null
                }
                "watch" -> segments.firstOrNull()?.let(DeepLinkDestination::Watch)
                    ?: query["id"]?.let(DeepLinkDestination::Watch)
                "profile" -> segments.firstOrNull()?.let(DeepLinkDestination::Profile)
                "library" -> segments.firstOrNull()?.let(DeepLinkDestination::LibraryRecording)
                else -> null
            }
        }

        if (scheme == "https" || scheme == "http") {
            val segments = (uri.path ?: "").split('/').filter(String::isNotBlank)
            return when (segments.firstOrNull()) {
                "watch" -> segments.getOrNull(1)?.let(DeepLinkDestination::Watch)
                "profile" -> segments.getOrNull(1)?.removePrefix("@")?.let(DeepLinkDestination::Profile)
                "library" -> segments.getOrNull(1)?.let(DeepLinkDestination::LibraryRecording)
                "reset-password" -> query["token"]?.takeIf(String::isNotBlank)?.let(DeepLinkDestination::ResetPassword)
                "verify-email" -> query["token"]?.takeIf(String::isNotBlank)?.let(DeepLinkDestination::VerifyEmail)
                else -> null
            }
        }
        return null
    }

    private fun parseQuery(rawQuery: String?): Map<String, String> {
        if (rawQuery.isNullOrBlank()) return emptyMap()
        return rawQuery.split('&').mapNotNull { pair ->
            val idx = pair.indexOf('=')
            if (idx <= 0) null
            else {
                val key = java.net.URLDecoder.decode(pair.substring(0, idx), "UTF-8")
                val value = java.net.URLDecoder.decode(pair.substring(idx + 1), "UTF-8")
                key to value
            }
        }.toMap()
    }
}

class ServerEndpointStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("im_live_endpoint", Context.MODE_PRIVATE)
    private val defaultUrl = BuildConfig.API_BASE_URL.trimEnd('/')

    private val _apiBaseUrl = MutableStateFlow(readCurrent())
    val apiBaseUrlFlow: StateFlow<String> = _apiBaseUrl.asStateFlow()

    val apiBaseUrl: String get() = _apiBaseUrl.value
    val wsBaseUrl: String get() = EndpointUrlRules.toWebSocketBaseUrl(apiBaseUrl)
    val originUrl: String get() = EndpointUrlRules.toOriginUrl(apiBaseUrl)

    private fun readCurrent(): String {
        val custom = prefs.getString(KEY_CUSTOM_API_URL, null)
        if (!custom.isNullOrBlank()) {
            EndpointUrlRules.normalizeApiBaseUrl(custom, allowInsecureHttp = BuildConfig.DEBUG)
                .getOrNull()
                ?.let { return it }
        }
        return defaultUrl
    }

    fun updateCustomUrl(rawUrl: String): Result<String> {
        return EndpointUrlRules.normalizeApiBaseUrl(rawUrl, allowInsecureHttp = BuildConfig.DEBUG)
            .onSuccess { normalized ->
                prefs.edit().putString(KEY_CUSTOM_API_URL, normalized).apply()
                _apiBaseUrl.value = normalized
            }
    }

    fun resetToDefault() {
        prefs.edit().remove(KEY_CUSTOM_API_URL).apply()
        _apiBaseUrl.value = defaultUrl
    }

    fun isUsingCustomUrl(): Boolean = prefs.contains(KEY_CUSTOM_API_URL)

    fun resolveMediaUrl(pathOrUrl: String): String =
        EndpointUrlRules.resolveMediaUrl(apiBaseUrl, pathOrUrl)

    private companion object {
        const val KEY_CUSTOM_API_URL = "custom_api_base_url"
    }
}
