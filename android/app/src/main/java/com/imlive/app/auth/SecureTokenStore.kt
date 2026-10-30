package com.imlive.app.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/** Access/refresh tokens are encrypted at rest and never written to logs. */
class SecureTokenStore(context: Context) {
    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val preferences = EncryptedSharedPreferences.create(
        context,
        "im_live_session",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

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

    private companion object {
        const val KEY_ACCESS = "access_token"
        const val KEY_REFRESH = "refresh_token"
    }
}
