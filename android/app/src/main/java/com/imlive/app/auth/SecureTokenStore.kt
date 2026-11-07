package com.imlive.app.auth

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Access and refresh tokens are encrypted at rest with Android Keystore AES256-GCM
 * and never written to logs. Includes self-healing recovery if an Android OS
 * keystore reset invalidates the previous MasterKey, preventing permanent launch crashes.
 */
class SecureTokenStore(context: Context) {
    private val appContext = context.applicationContext
    private val preferences: SharedPreferences = createEncryptedPrefs(appContext)

    var accessToken: String?
        get() = preferences.getString(KEY_ACCESS, null)
        private set(value) = preferences.edit().putString(KEY_ACCESS, value).apply()

    var refreshToken: String?
        get() = preferences.getString(KEY_REFRESH, null)
        private set(value) = preferences.edit().putString(KEY_REFRESH, value).apply()

    fun save(access: String, refresh: String) {
        preferences.edit()
            .putString(KEY_ACCESS, access)
            .putString(KEY_REFRESH, refresh)
            .apply()
    }

    fun clear() {
        preferences.edit().clear().apply()
    }

    private fun createEncryptedPrefs(ctx: Context): SharedPreferences {
        return try {
            openPrefs(ctx)
        } catch (_: Exception) {
            runCatching { ctx.deleteSharedPreferences(PREFS_FILE) }
            openPrefs(ctx)
        }
    }

    private fun openPrefs(ctx: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(ctx)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            ctx,
            PREFS_FILE,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    private companion object {
        const val PREFS_FILE = "im_live_session"
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
    }
}
