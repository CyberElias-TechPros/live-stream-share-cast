package com.imlive.app.data

import com.imlive.app.model.AdminOverviewData
import com.imlive.app.model.AdminUserRow
import com.imlive.app.model.AppNotification
import com.imlive.app.model.BlockedUserItem
import com.imlive.app.model.CategoryItem
import com.imlive.app.model.ChatRestrictionItem
import com.imlive.app.model.ChatRules
import com.imlive.app.model.CreatorAnalyticsOverview
import com.imlive.app.model.CreatorEarningsInfo
import com.imlive.app.model.FeatureFlagRow
import com.imlive.app.model.LiveStream
import com.imlive.app.model.ModerationReportItem
import com.imlive.app.model.NotificationPreferences
import com.imlive.app.model.PaymentConfigInfo
import com.imlive.app.model.PrivacyPreferences
import com.imlive.app.model.Recording
import com.imlive.app.model.RuntimePlatformConfig
import com.imlive.app.model.ScheduledBroadcast
import com.imlive.app.model.ServerHealthInfo
import com.imlive.app.model.StreamingPreferences
import com.imlive.app.model.TipItem
import com.imlive.app.model.UserProfile
import com.imlive.app.model.WebhookEndpointItem
import com.imlive.app.model.toObjectList
import com.imlive.app.network.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.URLEncoder

data class PublicProfileDetail(
    val user: UserProfile,
    val recentStreams: List<LiveStream>,
    val publicRecordings: List<Recording>,
    val upcomingSchedule: List<ScheduledBroadcast>,
    val sessionsCount: Int,
    val peakViewers: Int,
    val hoursStreamed: Double,
)

data class TipCheckoutResult(
    val checkoutUrl: String?,
    val redirectUrl: String?,
    val external: Boolean,
)

data class CreatedWebhookResult(
    val id: String,
    val url: String,
    val secret: String,
)

class PlatformRepository(private val api: ApiClient) {

    /* ----------------------- Health & Runtime Config ----------------------- */

    suspend fun health(): Result<ServerHealthInfo> = withContext(Dispatchers.IO) {
        runCatching { ServerHealthInfo.from(api.get("/health", auth = false)) }
    }

    suspend fun runtimeConfig(): Result<RuntimePlatformConfig> = withContext(Dispatchers.IO) {
        runCatching { RuntimePlatformConfig.from(api.get("/config", auth = false)) }
    }

    /* ----------------------- Recordings / VOD / Clips ----------------------- */

    suspend fun publicRecordings(
        search: String? = null,
        clipsOnly: Boolean? = null,
        sort: String = "recent",
    ): Result<List<Recording>> = withContext(Dispatchers.IO) {
        runCatching {
            val params = buildList {
                add("limit=40")
                add("sort=${encode(sort)}")
                if (!search.isNullOrBlank()) add("search=${encode(search)}")
                if (clipsOnly != null) add("clips=$clipsOnly")
            }.joinToString("&")
            api.get("/recordings?$params", auth = api.hasSession())
                .optJSONArray("recordings")
                .toObjectList(Recording::from)
        }
    }

    suspend fun myRecordings(): Result<List<Recording>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/recordings/mine").optJSONArray("recordings").toObjectList(Recording::from)
        }
    }

    suspend fun recording(id: String): Result<Recording> = withContext(Dispatchers.IO) {
        runCatching {
            Recording.from(api.get("/recordings/${encode(id)}", auth = api.hasSession()).getJSONObject("recording"))
        }
    }

    suspend fun playbackUrl(recordingId: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = api.get("/recordings/${encode(recordingId)}/playback-url", auth = api.hasSession()).getString("url")
            api.endpoints.resolveMediaUrl(raw)
        }
    }

    suspend fun registerRecordingView(recordingId: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            api.post("/recordings/${encode(recordingId)}/view", JSONObject(), auth = api.hasSession())
                .optString("sessionId")
        }
    }

    suspend fun updateRecording(
        recordingId: String,
        title: String,
        description: String?,
        visibility: String,
        tags: List<String>,
    ): Result<Recording> = withContext(Dispatchers.IO) {
        runCatching {
            val body = JSONObject()
                .put("title", title.trim())
                .put("description", description?.trim() ?: "")
                .put("visibility", visibility)
                .put("tags", JSONArray().apply { tags.forEach(::put) })
            Recording.from(api.patch("/recordings/${encode(recordingId)}", body).getJSONObject("recording"))
        }
    }

    suspend fun deleteRecording(recordingId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.delete("/recordings/${encode(recordingId)}")
            true
        }
    }

    suspend fun createClip(
        recordingId: String,
        title: String,
        startSeconds: Int,
        endSeconds: Int,
    ): Result<Recording> = withContext(Dispatchers.IO) {
        runCatching {
            val body = JSONObject()
                .put("title", title.trim())
                .put("startSeconds", startSeconds)
                .put("endSeconds", endSeconds)
            Recording.from(api.post("/recordings/${encode(recordingId)}/clip", body).getJSONObject("recording"))
        }
    }

    suspend fun uploadRecordingFile(
        file: File,
        mimeType: String,
        title: String,
        description: String? = null,
        streamId: String? = null,
        visibility: String = "public",
        durationSeconds: Int? = null,
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val fields = buildMap {
                put("title", title.trim().ifBlank { "Android broadcast replay" })
                put("source", "android")
                put("visibility", visibility)
                if (!description.isNullOrBlank()) put("description", description.trim())
                if (!streamId.isNullOrBlank()) put("streamId", streamId)
                if (durationSeconds != null && durationSeconds > 0) put("durationSeconds", durationSeconds.toString())
            }
            api.postMultipartFile("/media/recordings", "file", file, mimeType, fields).getString("id")
        }
    }

    suspend fun uploadThumbnailBytes(streamId: String?, jpegBytes: ByteArray): Result<String> =
        withContext(Dispatchers.IO) {
            runCatching {
                val fields = if (!streamId.isNullOrBlank()) mapOf("streamId" to streamId) else emptyMap()
                val raw = api.postMultipartBytes(
                    path = "/media/thumbnails",
                    fieldName = "file",
                    fileName = "thumbnail-${System.currentTimeMillis()}.jpg",
                    mimeType = "image/jpeg",
                    bytes = jpegBytes,
                    fields = fields,
                ).getString("url")
                api.endpoints.resolveMediaUrl(raw)
            }
        }

    /* ----------------------- Profiles & Social Graph ----------------------- */

    suspend fun profileByUsername(username: String): Result<PublicProfileDetail> = withContext(Dispatchers.IO) {
        runCatching {
            val profileRes = api.get("/profiles/${encode(username.removePrefix("@"))}", auth = api.hasSession())
            val user = UserProfile.from(profileRes.getJSONObject("user"))
            loadProfileExtras(user)
        }
    }

    suspend fun profileByUserId(userId: String): Result<PublicProfileDetail> = withContext(Dispatchers.IO) {
        runCatching {
            val res = api.get("/users/${encode(userId)}", auth = api.hasSession())
            val user = UserProfile.from(res.getJSONObject("user"))
            loadProfileExtras(user)
        }
    }

    private suspend fun loadProfileExtras(user: UserProfile): PublicProfileDetail {
        val streams = runCatching {
            api.get("/users/${encode(user.id)}/streams", auth = false)
                .optJSONArray("streams").toObjectList(LiveStream::from)
        }.getOrDefault(emptyList())
        val vods = runCatching {
            api.get("/users/${encode(user.id)}/recordings", auth = false)
                .optJSONArray("recordings").toObjectList(Recording::from)
        }.getOrDefault(emptyList())
        val schedule = runCatching {
            api.get("/users/${encode(user.id)}/schedule", auth = false)
                .optJSONArray("scheduled").toObjectList(ScheduledBroadcast::from)
        }.getOrDefault(emptyList())
        val statsObj = runCatching {
            api.get("/analytics/users/${encode(user.id)}", auth = false).optJSONObject("stats")
        }.getOrNull()
        return PublicProfileDetail(
            user = user,
            recentStreams = streams,
            publicRecordings = vods,
            upcomingSchedule = schedule,
            sessionsCount = statsObj?.optInt("sessions", 0) ?: 0,
            peakViewers = statsObj?.optInt("peakViewers", 0) ?: 0,
            hoursStreamed = statsObj?.optDouble("hoursStreamed", 0.0) ?: 0.0,
        )
    }

    suspend fun followers(userId: String): Result<List<UserProfile>> = withContext(Dispatchers.IO) {
        runCatching { api.get("/users/${encode(userId)}/followers", auth = false).optJSONArray("users").toObjectList(UserProfile::from) }
    }

    suspend fun following(userId: String): Result<List<UserProfile>> = withContext(Dispatchers.IO) {
        runCatching { api.get("/users/${encode(userId)}/following", auth = false).optJSONArray("users").toObjectList(UserProfile::from) }
    }

    suspend fun updateMyProfile(
        displayName: String,
        bio: String,
        pronouns: String,
        websiteUrl: String,
        donationUrl: String,
    ): Result<UserProfile> = withContext(Dispatchers.IO) {
        runCatching {
            val body = JSONObject()
                .put("displayName", displayName.trim())
                .put("bio", bio.trim())
                .put("pronouns", pronouns.trim())
                .put("websiteUrl", websiteUrl.trim())
                .put("donationUrl", donationUrl.trim())
            UserProfile.from(api.patch("/users/me", body).getJSONObject("user"))
        }
    }

    suspend fun updateMyPreferences(
        privacy: PrivacyPreferences,
        streaming: StreamingPreferences,
    ): Result<UserProfile> = withContext(Dispatchers.IO) {
        runCatching {
            val prefs = JSONObject()
                .put("privacy", privacy.toJson())
                .put("streaming", streaming.toJson())
            UserProfile.from(api.patch("/users/me/preferences", prefs).getJSONObject("user"))
        }
    }

    suspend fun setStreamerMode(enabled: Boolean): Result<UserProfile> = withContext(Dispatchers.IO) {
        runCatching {
            UserProfile.from(api.post("/users/me/streamer", JSONObject().put("isStreamer", enabled)).getJSONObject("user"))
        }
    }

    suspend fun uploadAvatar(imageBytes: ByteArray, mimeType: String = "image/jpeg"): Result<UserProfile> =
        withContext(Dispatchers.IO) {
            runCatching {
                val res = api.postMultipartBytes(
                    path = "/users/me/avatar",
                    fieldName = "file",
                    fileName = "avatar.jpg",
                    mimeType = mimeType,
                    bytes = imageBytes,
                )
                UserProfile.from(res.getJSONObject("user"))
            }
        }

    /* ----------------------- Schedule ----------------------- */

    suspend fun upcomingSchedule(): Result<List<ScheduledBroadcast>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/schedule?limit=40", auth = api.hasSession())
                .optJSONArray("scheduled").toObjectList(ScheduledBroadcast::from)
        }
    }

    suspend fun mySchedule(): Result<List<ScheduledBroadcast>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/schedule/mine").optJSONArray("scheduled").toObjectList(ScheduledBroadcast::from)
        }
    }

    suspend fun createSchedule(
        title: String,
        description: String?,
        category: String?,
        scheduledForIso: String,
        durationMinutes: Int,
        timezone: String,
    ): Result<ScheduledBroadcast> = withContext(Dispatchers.IO) {
        runCatching {
            val body = JSONObject()
                .put("title", title.trim())
                .put("scheduledFor", scheduledForIso)
                .put("durationMinutes", durationMinutes)
                .put("timezone", timezone)
            if (!description.isNullOrBlank()) body.put("description", description.trim())
            if (!category.isNullOrBlank()) body.put("category", category)
            ScheduledBroadcast.from(api.post("/schedule", body).getJSONObject("scheduled"))
        }
    }

    suspend fun cancelSchedule(scheduleId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.delete("/schedule/${encode(scheduleId)}")
            true
        }
    }

    suspend fun toggleScheduleReminder(scheduleId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.post("/schedule/${encode(scheduleId)}/remind", JSONObject()).optBoolean("reminded", false)
        }
    }

    suspend fun goLiveFromSchedule(scheduleId: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            api.post("/schedule/${encode(scheduleId)}/go-live", JSONObject()).getString("streamId")
        }
    }

    /* ----------------------- Notifications ----------------------- */

    suspend fun notifications(unreadOnly: Boolean = false): Result<Pair<List<AppNotification>, Int>> =
        withContext(Dispatchers.IO) {
            runCatching {
                val res = api.get("/notifications?limit=50&unread=$unreadOnly")
                val list = res.optJSONArray("notifications").toObjectList(AppNotification::from)
                val unread = res.optInt("unreadCount", 0)
                list to unread
            }
        }

    suspend fun unreadNotificationCount(): Result<Int> = withContext(Dispatchers.IO) {
        runCatching { api.get("/notifications/unread-count").optInt("unreadCount", 0) }
    }

    suspend fun markNotificationRead(id: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.post("/notifications/${encode(id)}/read", JSONObject())
            true
        }
    }

    suspend fun markAllNotificationsRead(): Result<Int> = withContext(Dispatchers.IO) {
        runCatching { api.post("/notifications/read-all", JSONObject()).optInt("updated", 0) }
    }

    suspend fun deleteNotification(id: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.delete("/notifications/${encode(id)}")
            true
        }
    }

    suspend fun notificationPreferences(): Result<NotificationPreferences> = withContext(Dispatchers.IO) {
        runCatching {
            NotificationPreferences.from(api.get("/notifications/preferences").optJSONObject("preferences"))
        }
    }

    suspend fun updateNotificationPreferences(prefs: NotificationPreferences): Result<NotificationPreferences> =
        withContext(Dispatchers.IO) {
            runCatching {
                val res = api.put("/notifications/preferences", prefs.toJson())
                NotificationPreferences.from(res.optJSONObject("preferences"))
            }
        }

    /* ----------------------- Creator Analytics ----------------------- */

    suspend fun analyticsOverview(days: Int = 30): Result<CreatorAnalyticsOverview> = withContext(Dispatchers.IO) {
        runCatching {
            CreatorAnalyticsOverview.from(api.get("/analytics/overview?days=$days"))
        }
    }

    /* ----------------------- Moderation & Safety ----------------------- */

    suspend fun submitReport(
        targetType: String,
        targetId: String,
        reason: String,
        details: String? = null,
        streamId: String? = null,
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val body = JSONObject()
                .put("targetType", targetType)
                .put("targetId", targetId)
                .put("reason", reason)
            if (!details.isNullOrBlank()) body.put("details", details.trim())
            if (!streamId.isNullOrBlank()) body.put("streamId", streamId)
            api.post("/moderation/reports", body).getString("reportId")
        }
    }

    suspend fun myReports(): Result<List<ModerationReportItem>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/moderation/reports/mine").optJSONArray("reports").toObjectList(ModerationReportItem::from)
        }
    }

    suspend fun blockedUsers(): Result<List<BlockedUserItem>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/moderation/blocks").optJSONArray("blocked").toObjectList(BlockedUserItem::from)
        }
    }

    suspend fun blockUser(userId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.post("/moderation/blocks/${encode(userId)}", JSONObject())
            true
        }
    }

    suspend fun unblockUser(userId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.delete("/moderation/blocks/${encode(userId)}")
            true
        }
    }

    suspend fun streamChatSettings(streamId: String): Result<ChatRules> = withContext(Dispatchers.IO) {
        runCatching {
            ChatRules.from(api.get("/moderation/chat/${encode(streamId)}/settings").optJSONObject("settings"))
        }
    }

    suspend fun saveStreamChatSettings(streamId: String, rules: ChatRules): Result<ChatRules> =
        withContext(Dispatchers.IO) {
            runCatching {
                val body = JSONObject()
                    .put("slowModeSeconds", rules.slowModeSeconds)
                    .put("followersOnly", rules.followersOnly)
                    .put("subscribersOnly", rules.subscribersOnly)
                    .put("emotesOnly", rules.emotesOnly)
                    .put("linksAllowed", rules.linksAllowed)
                    .put("minAccountAgeMinutes", rules.minAccountAgeMinutes)
                    .put("blockedWords", JSONArray().apply { rules.blockedWords.forEach(::put) })
                ChatRules.from(api.put("/moderation/chat/${encode(streamId)}/settings", body).optJSONObject("settings"))
            }
        }

    suspend fun streamChatRestrictions(streamId: String): Result<List<ChatRestrictionItem>> =
        withContext(Dispatchers.IO) {
            runCatching {
                api.get("/moderation/chat/${encode(streamId)}/restrictions")
                    .optJSONArray("restrictions").toObjectList(ChatRestrictionItem::from)
            }
        }

    suspend fun restrictChatter(
        streamId: String,
        userId: String,
        kind: String,
        durationMinutes: Int = 10,
        reason: String? = null,
    ): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val body = JSONObject()
                .put("userId", userId)
                .put("kind", kind)
                .put("durationMinutes", durationMinutes)
            if (!reason.isNullOrBlank()) body.put("reason", reason.trim())
            api.post("/moderation/chat/${encode(streamId)}/restrictions", body).getString("banId")
        }
    }

    suspend fun liftChatRestriction(streamId: String, userId: String): Result<Boolean> =
        withContext(Dispatchers.IO) {
            runCatching {
                api.delete("/moderation/chat/${encode(streamId)}/restrictions/${encode(userId)}")
                true
            }
        }

    /* ----------------------- Payments & Earnings ----------------------- */

    suspend fun paymentConfig(): Result<PaymentConfigInfo> = withContext(Dispatchers.IO) {
        runCatching { PaymentConfigInfo.from(api.get("/payments/config", auth = false)) }
    }

    suspend fun createTip(
        streamerId: String,
        amountCents: Int,
        streamId: String? = null,
        message: String? = null,
    ): Result<TipCheckoutResult> = withContext(Dispatchers.IO) {
        runCatching {
            val body = JSONObject()
                .put("streamerId", streamerId)
                .put("amountCents", amountCents)
            if (!streamId.isNullOrBlank()) body.put("streamId", streamId)
            if (!message.isNullOrBlank()) body.put("message", message.trim())
            val res = api.post("/payments/tips", body)
            TipCheckoutResult(
                checkoutUrl = res.optString("checkoutUrl").takeIf { it.isNotBlank() },
                redirectUrl = res.optString("redirectUrl").takeIf { it.isNotBlank() },
                external = res.optBoolean("external", false),
            )
        }
    }

    suspend fun creatorEarnings(): Result<CreatorEarningsInfo> = withContext(Dispatchers.IO) {
        runCatching { CreatorEarningsInfo.from(api.get("/payments/earnings")) }
    }

    suspend fun myTipsSent(): Result<List<TipItem>> = withContext(Dispatchers.IO) {
        runCatching { api.get("/payments/tips/mine").optJSONArray("tips").toObjectList(TipItem::from) }
    }

    suspend fun updateDonationLink(url: String?): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.put("/payments/donation-link", JSONObject().put("donationUrl", url?.trim().orEmpty()))
            true
        }
    }

    /* ----------------------- Creator Webhooks ----------------------- */

    suspend fun webhooks(): Result<List<WebhookEndpointItem>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/integrations/webhooks").optJSONArray("webhooks").toObjectList(WebhookEndpointItem::from)
        }
    }

    suspend fun createWebhook(url: String, events: List<String>): Result<CreatedWebhookResult> =
        withContext(Dispatchers.IO) {
            runCatching {
                val res = api.post(
                    "/integrations/webhooks",
                    JSONObject().put("url", url.trim()).put("events", JSONArray().apply { events.forEach(::put) }),
                )
                CreatedWebhookResult(
                    id = res.getString("id"),
                    url = res.getString("url"),
                    secret = res.getString("secret"),
                )
            }
        }

    suspend fun testWebhook(id: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching { api.post("/integrations/webhooks/${encode(id)}/test", JSONObject()).optBoolean("delivered", false) }
    }

    suspend fun deleteWebhook(id: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.delete("/integrations/webhooks/${encode(id)}")
            true
        }
    }

    /* ----------------------- Admin Console ----------------------- */

    suspend fun adminOverview(): Result<AdminOverviewData> = withContext(Dispatchers.IO) {
        runCatching { AdminOverviewData.from(api.get("/admin/overview")) }
    }

    suspend fun adminUsers(search: String = ""): Result<List<AdminUserRow>> = withContext(Dispatchers.IO) {
        runCatching {
            val q = if (search.isBlank()) "" else "&search=${encode(search)}"
            api.get("/admin/users?limit=40$q").optJSONArray("users").toObjectList(AdminUserRow::from)
        }
    }

    suspend fun adminBanUser(userId: String, reason: String, durationMinutes: Int? = null): Result<Boolean> =
        withContext(Dispatchers.IO) {
            runCatching {
                val body = JSONObject().put("reason", reason.trim().ifBlank { "Community guidelines violation" })
                if (durationMinutes != null) body.put("durationMinutes", durationMinutes)
                api.post("/admin/users/${encode(userId)}/ban", body)
                true
            }
        }

    suspend fun adminUnbanUser(userId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.post("/admin/users/${encode(userId)}/unban", JSONObject())
            true
        }
    }

    suspend fun adminUpdateUserRole(userId: String, isStreamer: Boolean? = null, isAdmin: Boolean? = null): Result<Boolean> =
        withContext(Dispatchers.IO) {
            runCatching {
                val body = JSONObject()
                isStreamer?.let { body.put("isStreamer", it) }
                isAdmin?.let { body.put("isAdmin", it) }
                api.post("/admin/users/${encode(userId)}/role", body)
                true
            }
        }

    suspend fun adminStreams(): Result<List<LiveStream>> = withContext(Dispatchers.IO) {
        runCatching { api.get("/admin/streams?limit=40").optJSONArray("streams").toObjectList(LiveStream::from) }
    }

    suspend fun adminForceEndStream(streamId: String, reason: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.post("/admin/streams/${encode(streamId)}/end", JSONObject().put("reason", reason))
            true
        }
    }

    suspend fun adminReports(status: String = "open"): Result<List<ModerationReportItem>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/admin/reports?status=${encode(status)}&limit=40")
                .optJSONArray("reports").toObjectList(ModerationReportItem::from)
        }
    }

    suspend fun adminResolveReport(reportId: String, status: String, note: String?): Result<Boolean> =
        withContext(Dispatchers.IO) {
            runCatching {
                val body = JSONObject().put("status", status)
                if (!note.isNullOrBlank()) body.put("resolutionNote", note.trim())
                api.patch("/admin/reports/${encode(reportId)}", body)
                true
            }
        }

    suspend fun adminFlags(): Result<List<FeatureFlagRow>> = withContext(Dispatchers.IO) {
        runCatching { api.get("/admin/flags").optJSONArray("flags").toObjectList(FeatureFlagRow::from) }
    }

    suspend fun adminToggleFlag(key: String, enabled: Boolean): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.put("/admin/flags/${encode(key)}", JSONObject().put("enabled", enabled))
            true
        }
    }

    suspend fun adminCreateCategory(slug: String, name: String, emoji: String): Result<Boolean> =
        withContext(Dispatchers.IO) {
            runCatching {
                api.post(
                    "/admin/categories",
                    JSONObject().put("slug", slug.trim()).put("name", name.trim()).put("emoji", emoji.trim()),
                )
                true
            }
        }

    suspend fun adminCategories(): Result<List<CategoryItem>> = withContext(Dispatchers.IO) {
        runCatching { api.get("/admin/categories").optJSONArray("categories").toObjectList(CategoryItem::from) }
    }

    private fun encode(part: String): String = URLEncoder.encode(part, "UTF-8")
}
