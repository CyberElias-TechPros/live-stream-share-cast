package com.imlive.app.data

import android.content.Context
import com.imlive.app.model.AccentTheme
import com.imlive.app.model.VideoQualityPreset
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

data class DeviceAppSettings(
    val accentTheme: AccentTheme = AccentTheme.MAGENTA,
    val dataSaver: Boolean = false,
    val defaultQuality: VideoQualityPreset = VideoQualityPreset.AUTO,
    val autoRecordLocal: Boolean = false,
    val keepScreenAwake: Boolean = true,
    val notificationsEnabled: Boolean = true,
    val onboardingDismissed: Boolean = false,
)

class AppPreferences(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("im_live_preferences", Context.MODE_PRIVATE)

    private val _settings = MutableStateFlow(read())
    val settings: StateFlow<DeviceAppSettings> = _settings.asStateFlow()

    private fun read(): DeviceAppSettings = DeviceAppSettings(
        accentTheme = AccentTheme.fromId(prefs.getString("accent_theme", AccentTheme.MAGENTA.id)),
        dataSaver = prefs.getBoolean("data_saver", false),
        defaultQuality = VideoQualityPreset.fromId(prefs.getString("default_quality", VideoQualityPreset.AUTO.id)),
        autoRecordLocal = prefs.getBoolean("auto_record_local", false),
        keepScreenAwake = prefs.getBoolean("keep_screen_awake", true),
        notificationsEnabled = prefs.getBoolean("notifications", true),
        onboardingDismissed = prefs.getBoolean("onboarding_dismissed", false),
    )

    fun setAccentTheme(theme: AccentTheme) {
        prefs.edit().putString("accent_theme", theme.id).apply()
        _settings.value = read()
    }

    fun setDataSaver(enabled: Boolean) {
        val nextQuality = if (enabled && _settings.value.defaultQuality == VideoQualityPreset.AUTO) {
            VideoQualityPreset.SAVER_360P
        } else {
            _settings.value.defaultQuality
        }
        prefs.edit()
            .putBoolean("data_saver", enabled)
            .putString("default_quality", nextQuality.id)
            .apply()
        _settings.value = read()
    }

    fun setDefaultQuality(quality: VideoQualityPreset) {
        prefs.edit().putString("default_quality", quality.id).apply()
        _settings.value = read()
    }

    fun setAutoRecordLocal(enabled: Boolean) {
        prefs.edit().putBoolean("auto_record_local", enabled).apply()
        _settings.value = read()
    }

    fun setKeepScreenAwake(enabled: Boolean) {
        prefs.edit().putBoolean("keep_screen_awake", enabled).apply()
        _settings.value = read()
    }

    fun setNotificationsEnabled(enabled: Boolean) {
        prefs.edit().putBoolean("notifications", enabled).apply()
        _settings.value = read()
    }

    fun dismissOnboarding() {
        prefs.edit().putBoolean("onboarding_dismissed", true).apply()
        _settings.value = read()
    }
}
