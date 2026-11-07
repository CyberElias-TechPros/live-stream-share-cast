package com.imlive.app.model

import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

enum class AccentTheme(val id: String, val label: String, val subtitle: String) {
    MAGENTA("magenta", "Electric Magenta", "Signature violet & neon rose pulse"),
    AURORA("aurora", "Arctic Aurora", "Cyan sky & deep indigo glow"),
    EMBER("ember", "Solar Ember", "Warm amber & crimson broadcast heat");

    companion object {
        fun fromId(id: String?): AccentTheme = entries.firstOrNull { it.id == id } ?: MAGENTA
    }
}

enum class VideoQualityPreset(
    val id: String,
    val label: String,
    val viewerKbps: Int?,
    val captureWidth: Int,
    val captureHeight: Int,
    val captureFps: Int,
    val audioOnly: Boolean = false,
) {
    AUTO("auto", "Auto (Adaptive)", null, 1280, 720, 30),
    FHD_1080P("1080p", "1080p Full HD", 4200, 1920, 1080, 30),
    HD_720P("720p", "720p Crisp HD", 2400, 1280, 720, 30),
    SD_480P("480p", "480p Balanced", 1100, 854, 480, 24),
    SAVER_360P("360p", "360p Data Saver", 520, 640, 360, 20),
    AUDIO_ONLY("audio", "Audio Only (Ultra Saver)", 128, 320, 180, 10, audioOnly = true);

    companion object {
        fun fromId(id: String?): VideoQualityPreset = entries.firstOrNull { it.id == id } ?: AUTO
    }
}

data class SocialLink(
    val platform: String,
    val url: String,
) {
    fun toJson(): JSONObject = JSONObject().put("platform", platform).put("url", url)

    companion object {
        fun from(json: JSONObject): SocialLink = SocialLink(
            platform = json.optString("platform", "link"),
            url = json.optString("url", ""),
        )
    }
}

data class NotificationPreferences(
    val email: Boolean = true,
    val push: Boolean = true,
    val streamStart: Boolean = true,
    val comments: Boolean = true,
    val followers: Boolean = true,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("email", email)
        .put("push", push)
        .put("streamStart", streamStart)
        .put("comments", comments)
        .put("followers", followers)

    companion object {
        fun from(json: JSONObject?): NotificationPreferences = NotificationPreferences(
            email = json?.optBoolean("email", true) ?: true,
            push = json?.optBoolean("push", true) ?: true,
            streamStart = json?.optBoolean("streamStart", true) ?: true,
            comments = json?.optBoolean("comments", true) ?: true,
            followers = json?.optBoolean("followers", true) ?: true,
        )
    }
}

data class PrivacyPreferences(
    val showOnlineStatus: Boolean = true,
    val allowMessages: Boolean = true,
    val showProfileToUnregistered: Boolean = true,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("showOnlineStatus", showOnlineStatus)
        .put("allowMessages", allowMessages)
        .put("showProfileToUnregistered", showProfileToUnregistered)

    companion object {
        fun from(json: JSONObject?): PrivacyPreferences = PrivacyPreferences(
            showOnlineStatus = json?.optBoolean("showOnlineStatus", true) ?: true,
            allowMessages = json?.optBoolean("allowMessages", true) ?: true,
            showProfileToUnregistered = json?.optBoolean("showProfileToUnregistered", true) ?: true,
        )
    }
}

data class StreamingPreferences(
    val defaultStreamType: String = "internet",
    val defaultQuality: String = "720p",
    val autoRecord: Boolean = false,
    val autoDeleteRecordings: Boolean = true,
    val recordingRetentionHours: Int = 6,
) {
    fun toJson(): JSONObject = JSONObject()
        .put("defaultStreamType", defaultStreamType)
        .put("defaultQuality", defaultQuality)
        .put("autoRecord", autoRecord)
        .put("autoDeleteRecordings", autoDeleteRecordings)
        .put("recordingRetentionHours", recordingRetentionHours)

    companion object {
        fun from(json: JSONObject?): StreamingPreferences = StreamingPreferences(
            defaultStreamType = json?.optString("defaultStreamType", "internet") ?: "internet",
            defaultQuality = json?.optString("defaultQuality", "720p") ?: "720p",
            autoRecord = json?.optBoolean("autoRecord", false) ?: false,
            autoDeleteRecordings = json?.optBoolean("autoDeleteRecordings", true) ?: true,
            recordingRetentionHours = json?.optInt("recordingRetentionHours", 6) ?: 6,
        )
    }
}

data class UserProfile(
    val id: String,
    val username: String,
    val email: String = "",
    val displayName: String,
    val avatar: String? = null,
    val bio: String? = null,
    val isStreamer: Boolean = false,
    val isAdmin: Boolean = false,
    val emailVerified: Boolean = false,
    val followers: Int = 0,
    val following: Int = 0,
    val websiteUrl: String? = null,
    val donationUrl: String? = null,
    val pronouns: String? = null,
    val createdAt: String? = null,
    val lastSeen: String? = null,
    val socialLinks: List<SocialLink> = emptyList(),
    val notificationPrefs: NotificationPreferences = NotificationPreferences(),
    val privacyPrefs: PrivacyPreferences = PrivacyPreferences(),
    val streamingPrefs: StreamingPreferences = StreamingPreferences(),
) {
    val bestName: String get() = displayName.ifBlank { username }

    companion object {
        fun from(json: JSONObject): UserProfile {
            val prefs = json.optJSONObject("preferences")
            val linksArr = json.optJSONArray("socialLinks")
            val links = buildList {
                if (linksArr != null) {
                    for (i in 0 until linksArr.length()) {
                        linksArr.optJSONObject(i)?.let { add(SocialLink.from(it)) }
                    }
                }
            }
            val username = json.optString("username", "user")
            return UserProfile(
                id = json.optString("id"),
                username = username,
                email = json.optCleanString("email") ?: "",
                displayName = json.optCleanString("displayName") ?: username,
                avatar = json.optCleanString("avatar"),
                bio = json.optCleanString("bio"),
                isStreamer = json.optBoolean("isStreamer", false),
                isAdmin = json.optBoolean("isAdmin", false),
                emailVerified = json.optBoolean("emailVerified", false),
                followers = json.optInt("followers", 0),
                following = json.optInt("following", 0),
                websiteUrl = json.optCleanString("websiteUrl"),
                donationUrl = json.optCleanString("donationUrl"),
                pronouns = json.optCleanString("pronouns"),
                createdAt = json.optCleanString("createdAt"),
                lastSeen = json.optCleanString("lastSeen"),
                socialLinks = links,
                notificationPrefs = NotificationPreferences.from(prefs?.optJSONObject("notifications")),
                privacyPrefs = PrivacyPreferences.from(prefs?.optJSONObject("privacy")),
                streamingPrefs = StreamingPreferences.from(prefs?.optJSONObject("streaming")),
            )
        }
    }
}

data class LiveStream(
    val id: String,
    val title: String,
    val description: String? = null,
    val ownerId: String? = null,
    val username: String? = null,
    val displayName: String? = null,
    val userAvatar: String? = null,
    val category: String? = null,
    val tags: List<String> = emptyList(),
    val viewers: Int = 0,
    val peakViewers: Int = 0,
    val isLive: Boolean = false,
    val isRecording: Boolean = false,
    val isMature: Boolean = false,
    val streamType: String = "internet",
    val streamKey: String = "",
    val thumbnail: String? = null,
    val recordingUrl: String? = null,
    val startedAt: String? = null,
    val endedAt: String? = null,
    val createdAt: String? = null,
    val hostConnected: Boolean = false,
) {
    val hostDisplay: String get() = displayName?.takeIf(String::isNotBlank) ?: username?.takeIf(String::isNotBlank) ?: "Creator"

    companion object {
        fun from(json: JSONObject): LiveStream {
            val tagsArray = json.optJSONArray("tags")
            val tags = buildList {
                if (tagsArray != null) {
                    for (i in 0 until tagsArray.length()) {
                        tagsArray.optString(i).takeIf { it.isNotBlank() }?.let(::add)
                    }
                }
            }
            return LiveStream(
                id = json.optString("id"),
                title = json.optCleanString("title") ?: "Untitled broadcast",
                description = json.optCleanString("description"),
                ownerId = json.optCleanString("userId") ?: json.optCleanString("ownerId"),
                username = json.optCleanString("username"),
                displayName = json.optCleanString("displayName"),
                userAvatar = json.optCleanString("userAvatar") ?: json.optCleanString("avatar"),
                category = json.optCleanString("category"),
                tags = tags,
                viewers = json.optInt("viewerCount", 0),
                peakViewers = json.optInt("peakViewers", 0),
                isLive = json.optBoolean("isLive", false),
                isRecording = json.optBoolean("isRecording", false),
                isMature = json.optBoolean("isMature", false),
                streamType = json.optCleanString("streamType") ?: "internet",
                streamKey = json.optCleanString("streamKey") ?: "",
                thumbnail = json.optCleanString("thumbnail"),
                recordingUrl = json.optCleanString("recordingUrl") ?: json.optCleanString("url"),
                startedAt = json.optCleanString("startedAt"),
                endedAt = json.optCleanString("endedAt"),
                createdAt = json.optCleanString("createdAt"),
                hostConnected = json.optBoolean("hostConnected", false),
            )
        }
    }
}

data class StreamPresence(
    val streamId: String,
    val viewers: Int,
    val hostConnected: Boolean,
    val live: Boolean,
) {
    companion object {
        fun from(json: JSONObject) = StreamPresence(
            streamId = json.optString("streamId"),
            viewers = json.optInt("viewers", 0),
            hostConnected = json.optBoolean("hostConnected", false),
            live = json.optBoolean("live", false),
        )
    }
}

data class IceServerConfig(
    val urls: List<String>,
    val username: String?,
    val credential: String?,
)

data class RtcConnectionDiagnostics(
    val transportType: String = "negotiating",
    val videoWidth: Int = 0,
    val videoHeight: Int = 0,
    val fps: Int = 0,
    val bitrateKbps: Int = 0,
    val rttMs: Int? = null,
    val packetsLost: Long = 0,
    val reconnectCount: Int = 0,
) {
    val resolutionLabel: String
        get() = if (videoWidth > 0 && videoHeight > 0) "${videoWidth}x${videoHeight}" else "—"
}

data class ChatReplyPreview(
    val id: String,
    val username: String,
    val message: String,
)

data class ChatMessage(
    val id: String,
    val streamId: String? = null,
    val userId: String? = null,
    val username: String,
    val userAvatar: String? = null,
    val message: String,
    val type: String = "text",
    val isModerated: Boolean = false,
    val createdAt: String? = null,
    val replyTo: ChatReplyPreview? = null,
) {
    companion object {
        fun from(json: JSONObject): ChatMessage {
            val replyObj = json.optJSONObject("replyTo")
            val reply = if (replyObj != null) {
                ChatReplyPreview(
                    id = replyObj.optString("id"),
                    username = replyObj.optCleanString("username") ?: "viewer",
                    message = replyObj.optString("message"),
                )
            } else {
                null
            }
            return ChatMessage(
                id = json.optCleanString("id") ?: UUID.randomUUID().toString(),
                streamId = json.optCleanString("streamId"),
                userId = json.optCleanString("userId"),
                username = json.optCleanString("username")
                    ?: json.optCleanString("displayName")
                    ?: "viewer",
                userAvatar = json.optCleanString("userAvatar"),
                message = json.optString("message"),
                type = json.optCleanString("type") ?: "text",
                isModerated = json.optBoolean("isModerated", false),
                createdAt = json.optCleanString("createdAt") ?: json.optCleanString("timestamp"),
                replyTo = reply,
            )
        }
    }
}

data class ChatRules(
    val slowModeSeconds: Int = 0,
    val followersOnly: Boolean = false,
    val subscribersOnly: Boolean = false,
    val emotesOnly: Boolean = false,
    val linksAllowed: Boolean = true,
    val minAccountAgeMinutes: Int = 0,
    val blockedWords: List<String> = emptyList(),
    val blockedWordCount: Int = 0,
) {
    companion object {
        fun from(json: JSONObject?): ChatRules {
            if (json == null) return ChatRules()
            val wordsArr = json.optJSONArray("blockedWords")
            val words = buildList {
                if (wordsArr != null) {
                    for (i in 0 until wordsArr.length()) {
                        wordsArr.optString(i).takeIf { it.isNotBlank() }?.let(::add)
                    }
                }
            }
            return ChatRules(
                slowModeSeconds = json.optInt("slowModeSeconds", 0),
                followersOnly = json.optBoolean("followersOnly", false),
                subscribersOnly = json.optBoolean("subscribersOnly", false),
                emotesOnly = json.optBoolean("emotesOnly", false),
                linksAllowed = json.optBoolean("linksAllowed", true),
                minAccountAgeMinutes = json.optInt("minAccountAgeMinutes", 0),
                blockedWords = words,
                blockedWordCount = json.optInt("blockedWordCount", words.size),
            )
        }
    }
}

data class Recording(
    val id: String,
    val title: String,
    val description: String? = null,
    val url: String? = null,
    val thumbnail: String? = null,
    val visibility: String = "public",
    val status: String = "ready",
    val durationSeconds: Int? = null,
    val sizeBytes: Long? = null,
    val mimeType: String? = null,
    val views: Int = 0,
    val watchMinutes: Int = 0,
    val category: String? = null,
    val tags: List<String> = emptyList(),
    val isClip: Boolean = false,
    val clipOf: String? = null,
    val clipStart: Int? = null,
    val clipEnd: Int? = null,
    val isOwner: Boolean = false,
    val userId: String? = null,
    val username: String? = null,
    val displayName: String? = null,
    val userAvatar: String? = null,
    val createdAt: String? = null,
    val retentionExpiresAt: String? = null,
) {
    companion object {
        fun from(json: JSONObject): Recording {
            val tagsArr = json.optJSONArray("tags")
            val tags = buildList {
                if (tagsArr != null) {
                    for (i in 0 until tagsArr.length()) tagsArr.optString(i).takeIf { it.isNotBlank() }?.let(::add)
                }
            }
            return Recording(
                id = json.optString("id"),
                title = json.optCleanString("title") ?: "Untitled recording",
                description = json.optCleanString("description"),
                url = json.optCleanString("url"),
                thumbnail = json.optCleanString("thumbnail"),
                visibility = json.optCleanString("visibility") ?: "public",
                status = json.optCleanString("status") ?: "ready",
                durationSeconds = json.optNullableInt("durationSeconds"),
                sizeBytes = json.optNullableLong("sizeBytes"),
                mimeType = json.optCleanString("mimeType"),
                views = json.optInt("views", 0),
                watchMinutes = json.optInt("watchMinutes", 0),
                category = json.optCleanString("category"),
                tags = tags,
                isClip = json.optBoolean("isClip", false) || json.optCleanString("clipOf") != null,
                clipOf = json.optCleanString("clipOf"),
                clipStart = json.optNullableInt("clipStart"),
                clipEnd = json.optNullableInt("clipEnd"),
                isOwner = json.optBoolean("isOwner", false),
                userId = json.optCleanString("userId"),
                username = json.optCleanString("username"),
                displayName = json.optCleanString("displayName"),
                userAvatar = json.optCleanString("userAvatar"),
                createdAt = json.optCleanString("createdAt"),
                retentionExpiresAt = json.optCleanString("retentionExpiresAt"),
            )
        }
    }
}

data class ScheduledBroadcast(
    val id: String,
    val title: String,
    val description: String? = null,
    val category: String? = null,
    val tags: List<String> = emptyList(),
    val scheduledFor: String,
    val durationMinutes: Int? = null,
    val timezone: String? = null,
    val status: String = "scheduled",
    val streamId: String? = null,
    val reminderCount: Int = 0,
    val userId: String? = null,
    val username: String? = null,
    val displayName: String? = null,
    val userAvatar: String? = null,
    val isOwner: Boolean = false,
    val isReminded: Boolean = false,
) {
    companion object {
        fun from(json: JSONObject): ScheduledBroadcast {
            val tagsArr = json.optJSONArray("tags")
            val tags = buildList {
                if (tagsArr != null) {
                    for (i in 0 until tagsArr.length()) tagsArr.optString(i).takeIf { it.isNotBlank() }?.let(::add)
                }
            }
            return ScheduledBroadcast(
                id = json.optString("id"),
                title = json.optCleanString("title") ?: "Scheduled broadcast",
                description = json.optCleanString("description"),
                category = json.optCleanString("category"),
                tags = tags,
                scheduledFor = json.optString("scheduledFor"),
                durationMinutes = json.optNullableInt("durationMinutes"),
                timezone = json.optCleanString("timezone"),
                status = json.optCleanString("status") ?: "scheduled",
                streamId = json.optCleanString("streamId"),
                reminderCount = json.optInt("reminderCount", 0),
                userId = json.optCleanString("userId"),
                username = json.optCleanString("username"),
                displayName = json.optCleanString("displayName"),
                userAvatar = json.optCleanString("userAvatar"),
                isOwner = json.optBoolean("isOwner", false),
                isReminded = json.optBoolean("isReminded", false),
            )
        }
    }
}

data class CategoryItem(
    val slug: String,
    val name: String,
    val description: String? = null,
    val emoji: String? = null,
    val color: String? = null,
    val liveStreams: Int = 0,
    val viewers: Int = 0,
) {
    companion object {
        fun from(json: JSONObject) = CategoryItem(
            slug = json.optString("slug"),
            name = json.optCleanString("name") ?: json.optString("slug"),
            description = json.optCleanString("description"),
            emoji = json.optCleanString("emoji"),
            color = json.optCleanString("color"),
            liveStreams = json.optInt("liveStreams", 0),
            viewers = json.optInt("viewers", 0),
        )
    }
}

data class SearchSuggestion(
    val type: String,
    val id: String,
    val label: String,
    val sublabel: String? = null,
    val isLive: Boolean = false,
) {
    companion object {
        fun from(json: JSONObject) = SearchSuggestion(
            type = json.optString("type", "stream"),
            id = json.optString("id"),
            label = json.optString("label"),
            sublabel = json.optCleanString("sublabel"),
            isLive = json.optBoolean("isLive", false),
        )
    }
}

data class UnifiedSearchResults(
    val query: String,
    val streams: List<LiveStream>,
    val channels: List<UserProfile>,
    val recordings: List<Recording>,
    val categories: List<CategoryItem>,
)

data class TrendingFeed(
    val streams: List<LiveStream>,
    val categories: List<CategoryItem>,
    val rising: List<UserProfile>,
    val upcoming: List<ScheduledBroadcast>,
)

data class WatchHistoryItem(
    val sessionId: String,
    val streamId: String?,
    val recordingId: String?,
    val title: String,
    val thumbnail: String?,
    val watchedSeconds: Int,
    val joinedAt: String?,
) {
    companion object {
        fun from(json: JSONObject) = WatchHistoryItem(
            sessionId = json.optString("sessionId"),
            streamId = json.optCleanString("streamId"),
            recordingId = json.optCleanString("recordingId"),
            title = json.optCleanString("title") ?: "Untitled",
            thumbnail = json.optCleanString("thumbnail"),
            watchedSeconds = json.optInt("watchedSeconds", 0),
            joinedAt = json.optCleanString("joinedAt"),
        )
    }
}

data class AppNotification(
    val id: String,
    val type: String,
    val title: String,
    val body: String?,
    val url: String?,
    val actorId: String?,
    val actorUsername: String?,
    val actorAvatar: String?,
    val streamId: String?,
    val readAt: String?,
    val createdAt: String,
) {
    val isUnread: Boolean get() = readAt == null

    companion object {
        fun from(json: JSONObject) = AppNotification(
            id = json.optString("id"),
            type = json.optCleanString("type") ?: "system",
            title = json.optString("title"),
            body = json.optCleanString("body"),
            url = json.optCleanString("url"),
            actorId = json.optCleanString("actorId"),
            actorUsername = json.optCleanString("actorUsername"),
            actorAvatar = json.optCleanString("actorAvatar"),
            streamId = json.optCleanString("streamId"),
            readAt = json.optCleanString("readAt"),
            createdAt = json.optString("createdAt"),
        )
    }
}

data class AnalyticsDayPoint(
    val day: String,
    val streams: Int,
    val minutesStreamed: Int,
    val peakViewers: Int,
    val uniqueViewers: Int,
    val watchMinutes: Int,
    val newFollowers: Int,
    val chatMessages: Int,
    val tipsCents: Int,
) {
    companion object {
        fun from(json: JSONObject) = AnalyticsDayPoint(
            day = json.optString("day"),
            streams = json.optInt("streams", 0),
            minutesStreamed = json.optInt("minutesStreamed", 0),
            peakViewers = json.optInt("peakViewers", 0),
            uniqueViewers = json.optInt("uniqueViewers", 0),
            watchMinutes = json.optInt("watchMinutes", 0),
            newFollowers = json.optInt("newFollowers", 0),
            chatMessages = json.optInt("chatMessages", 0),
            tipsCents = json.optInt("tipsCents", 0),
        )
    }
}

data class TopStreamMetric(
    val streamId: String,
    val title: String,
    val viewerCount: Int,
    val peakViewers: Int,
    val watchMinutes: Int,
    val startedAt: String?,
) {
    companion object {
        fun from(json: JSONObject) = TopStreamMetric(
            streamId = json.optString("streamId"),
            title = json.optCleanString("title") ?: "Untitled",
            viewerCount = json.optInt("viewerCount", 0),
            peakViewers = json.optInt("peakViewers", 0),
            watchMinutes = json.optInt("watchMinutes", 0),
            startedAt = json.optCleanString("startedAt"),
        )
    }
}

data class CreatorAnalyticsOverview(
    val days: Int,
    val streams: Int,
    val minutesStreamed: Int,
    val peakViewers: Int,
    val uniqueViewers: Int,
    val watchMinutes: Int,
    val newFollowers: Int,
    val chatMessages: Int,
    val tipsCents: Int,
    val totalFollowers: Int,
    val totalSessions: Int,
    val series: List<AnalyticsDayPoint>,
    val topStreams: List<TopStreamMetric>,
) {
    companion object {
        fun from(json: JSONObject): CreatorAnalyticsOverview {
            val totals = json.optJSONObject("totals") ?: JSONObject()
            val retention = json.optJSONObject("retention") ?: JSONObject()
            val range = json.optJSONObject("range") ?: JSONObject()
            return CreatorAnalyticsOverview(
                days = range.optInt("days", 30),
                streams = totals.optInt("streams", 0),
                minutesStreamed = totals.optInt("minutesStreamed", 0),
                peakViewers = totals.optInt("peakViewers", 0),
                uniqueViewers = totals.optInt("uniqueViewers", 0),
                watchMinutes = totals.optInt("watchMinutes", 0),
                newFollowers = totals.optInt("newFollowers", 0),
                chatMessages = totals.optInt("chatMessages", 0),
                tipsCents = totals.optInt("tipsCents", 0),
                totalFollowers = retention.optInt("followers", 0),
                totalSessions = retention.optInt("sessions", 0),
                series = json.optJSONArray("series").toObjectList(AnalyticsDayPoint::from),
                topStreams = json.optJSONArray("topStreams").toObjectList(TopStreamMetric::from),
            )
        }
    }
}

data class StreamSessionItem(
    val id: String,
    val streamId: String,
    val title: String,
    val category: String?,
    val startedAt: String,
    val endedAt: String?,
    val durationSeconds: Int?,
    val peakViewers: Int,
    val streamType: String,
) {
    companion object {
        fun from(json: JSONObject): StreamSessionItem {
            val streamMeta = json.optJSONObject("stream")
            return StreamSessionItem(
                id = json.optString("id"),
                streamId = json.optString("streamId"),
                title = streamMeta?.optCleanString("title") ?: "Broadcast session",
                category = streamMeta?.optCleanString("category"),
                startedAt = json.optString("startedAt"),
                endedAt = json.optCleanString("endedAt"),
                durationSeconds = json.optNullableInt("duration"),
                peakViewers = json.optInt("peakViewers", 0),
                streamType = json.optCleanString("streamType") ?: "internet",
            )
        }
    }
}

data class ModerationReportItem(
    val id: String,
    val targetType: String,
    val targetId: String,
    val reason: String,
    val details: String? = null,
    val status: String,
    val resolutionNote: String? = null,
    val reporterUsername: String? = null,
    val contextTitle: String? = null,
    val createdAt: String,
) {
    companion object {
        fun from(json: JSONObject) = ModerationReportItem(
            id = json.optString("id"),
            targetType = json.optString("targetType"),
            targetId = json.optString("targetId"),
            reason = json.optString("reason"),
            details = json.optCleanString("details"),
            status = json.optCleanString("status") ?: "open",
            resolutionNote = json.optCleanString("resolutionNote"),
            reporterUsername = json.optCleanString("reporterUsername"),
            contextTitle = json.optCleanString("context"),
            createdAt = json.optString("createdAt"),
        )
    }
}

data class BlockedUserItem(
    val id: String,
    val username: String,
    val displayName: String,
    val avatar: String?,
    val blockedAt: String?,
) {
    companion object {
        fun from(json: JSONObject): BlockedUserItem {
            val username = json.optString("username", "user")
            return BlockedUserItem(
                id = json.optString("id"),
                username = username,
                displayName = json.optCleanString("displayName") ?: username,
                avatar = json.optCleanString("avatar"),
                blockedAt = json.optCleanString("blockedAt"),
            )
        }
    }
}

data class ChatRestrictionItem(
    val id: String,
    val userId: String,
    val username: String,
    val kind: String,
    val reason: String?,
    val expiresAt: String?,
    val createdAt: String,
) {
    companion object {
        fun from(json: JSONObject) = ChatRestrictionItem(
            id = json.optString("id"),
            userId = json.optString("userId"),
            username = json.optCleanString("username") ?: "user",
            kind = json.optCleanString("kind") ?: "timeout",
            reason = json.optCleanString("reason"),
            expiresAt = json.optCleanString("expiresAt"),
            createdAt = json.optString("createdAt"),
        )
    }
}

data class PaymentConfigInfo(
    val enabled: Boolean = false,
    val provider: String = "none",
    val currency: String = "usd",
    val minTipCents: Int = 100,
    val maxTipCents: Int = 500_000,
    val presets: List<Int> = listOf(200, 500, 1000, 2500, 5000),
) {
    companion object {
        fun from(json: JSONObject): PaymentConfigInfo {
            val presetsArr = json.optJSONArray("presets")
            val presets = if (presetsArr != null && presetsArr.length() > 0) {
                buildList { for (i in 0 until presetsArr.length()) add(presetsArr.optInt(i)) }
            } else {
                listOf(200, 500, 1000, 2500, 5000)
            }
            return PaymentConfigInfo(
                enabled = json.optBoolean("enabled", false),
                provider = json.optCleanString("provider") ?: "none",
                currency = json.optCleanString("currency") ?: "usd",
                minTipCents = json.optInt("minTipCents", 100),
                maxTipCents = json.optInt("maxTipCents", 500_000),
                presets = presets,
            )
        }
    }
}

data class TipItem(
    val id: String,
    val amountCents: Int,
    val currency: String,
    val message: String?,
    val status: String,
    val counterpartyName: String?,
    val createdAt: String,
) {
    companion object {
        fun from(json: JSONObject) = TipItem(
            id = json.optString("id"),
            amountCents = json.optInt("amountCents", 0),
            currency = json.optCleanString("currency") ?: "usd",
            message = json.optCleanString("message"),
            status = json.optCleanString("status") ?: "pending",
            counterpartyName = json.optCleanString("tipperName")
                ?: json.optCleanString("tipperUsername")
                ?: json.optCleanString("streamerName")
                ?: json.optCleanString("streamerUsername"),
            createdAt = json.optString("createdAt"),
        )
    }
}

data class CreatorEarningsInfo(
    val paidCents: Int,
    val pendingCents: Int,
    val count: Int,
    val paidDisplay: String,
    val donationUrl: String?,
    val payoutsConnected: Boolean,
    val tips: List<TipItem>,
) {
    companion object {
        fun from(json: JSONObject): CreatorEarningsInfo {
            val totals = json.optJSONObject("totals") ?: JSONObject()
            val payouts = json.optJSONObject("payouts") ?: JSONObject()
            return CreatorEarningsInfo(
                paidCents = totals.optInt("paidCents", 0),
                pendingCents = totals.optInt("pendingCents", 0),
                count = totals.optInt("count", 0),
                paidDisplay = totals.optCleanString("paidDisplay") ?: "$0.00",
                donationUrl = payouts.optCleanString("donationUrl"),
                payoutsConnected = payouts.optBoolean("connected", false),
                tips = json.optJSONArray("tips").toObjectList(TipItem::from),
            )
        }
    }
}

data class AuthSessionItem(
    val id: String,
    val userAgent: String?,
    val ip: String?,
    val createdAt: String,
    val expiresAt: String,
    val current: Boolean,
) {
    companion object {
        fun from(json: JSONObject) = AuthSessionItem(
            id = json.optString("id"),
            userAgent = json.optCleanString("userAgent"),
            ip = json.optCleanString("ip"),
            createdAt = json.optString("createdAt"),
            expiresAt = json.optString("expiresAt"),
            current = json.optBoolean("current", false),
        )
    }
}

data class PersonalApiTokenItem(
    val id: String,
    val name: String,
    val prefix: String,
    val scopes: List<String>,
    val lastUsedAt: String?,
    val expiresAt: String?,
    val revoked: Boolean,
    val createdAt: String,
) {
    companion object {
        fun from(json: JSONObject): PersonalApiTokenItem {
            val scopesArr = json.optJSONArray("scopes")
            val scopes = buildList {
                if (scopesArr != null) {
                    for (i in 0 until scopesArr.length()) scopesArr.optString(i).takeIf { it.isNotBlank() }?.let(::add)
                }
            }
            return PersonalApiTokenItem(
                id = json.optString("id"),
                name = json.optCleanString("name") ?: "API token",
                prefix = json.optString("prefix"),
                scopes = scopes,
                lastUsedAt = json.optCleanString("lastUsedAt"),
                expiresAt = json.optCleanString("expiresAt"),
                revoked = json.optBoolean("revoked", false),
                createdAt = json.optString("createdAt"),
            )
        }
    }
}

data class WebhookEndpointItem(
    val id: String,
    val url: String,
    val events: List<String>,
    val enabled: Boolean,
    val lastStatus: Int?,
    val failureCount: Int,
    val createdAt: String,
) {
    companion object {
        fun from(json: JSONObject): WebhookEndpointItem {
            val evArr = json.optJSONArray("events")
            val events = buildList {
                if (evArr != null) {
                    for (i in 0 until evArr.length()) evArr.optString(i).takeIf { it.isNotBlank() }?.let(::add)
                }
            }
            return WebhookEndpointItem(
                id = json.optString("id"),
                url = json.optString("url"),
                events = events,
                enabled = json.optBoolean("enabled", true),
                lastStatus = json.optNullableInt("lastStatus"),
                failureCount = json.optInt("failureCount", 0),
                createdAt = json.optString("createdAt"),
            )
        }
    }
}

data class ServerHealthInfo(
    val status: String,
    val database: String,
    val environment: String,
    val version: String,
    val turnConfigured: Boolean,
    val pendingConfiguration: List<String>,
) {
    companion object {
        fun from(json: JSONObject): ServerHealthInfo {
            val integrations = json.optJSONObject("integrations")
            val pendingArr = json.optJSONArray("pendingConfiguration")
            val pending = buildList {
                if (pendingArr != null) {
                    for (i in 0 until pendingArr.length()) pendingArr.optString(i).takeIf { it.isNotBlank() }?.let(::add)
                }
            }
            return ServerHealthInfo(
                status = json.optCleanString("status") ?: "unknown",
                database = json.optCleanString("database") ?: "unknown",
                environment = json.optCleanString("environment") ?: "unknown",
                version = json.optCleanString("version") ?: "dev",
                turnConfigured = integrations?.optBoolean("turn", false) ?: false,
                pendingConfiguration = pending,
            )
        }
    }
}

data class RuntimePlatformConfig(
    val brandName: String = "I'm Live",
    val tagline: String = "Share the moment, live.",
    val supportEmail: String? = null,
    val maxP2pViewers: Int = 8,
    val maxChatLength: Int = 500,
    val maxTitleLength: Int = 140,
    val recordingRetentionHours: Int = 6,
    val signupsEnabled: Boolean = true,
    val tipsEnabled: Boolean = false,
    val turnConfigured: Boolean = false,
    val payments: PaymentConfigInfo = PaymentConfigInfo(),
) {
    companion object {
        fun from(json: JSONObject): RuntimePlatformConfig {
            val brand = json.optJSONObject("brand")
            val limits = json.optJSONObject("limits")
            val features = json.optJSONObject("features")
            val webrtc = json.optJSONObject("webrtc")
            val payments = json.optJSONObject("payments")
            return RuntimePlatformConfig(
                brandName = brand?.optCleanString("name") ?: "I'm Live",
                tagline = brand?.optCleanString("tagline") ?: "Share the moment, live.",
                supportEmail = brand?.optCleanString("supportEmail"),
                maxP2pViewers = limits?.optInt("maxP2pViewers", 8) ?: 8,
                maxChatLength = limits?.optInt("maxChatMessageLength", 500) ?: 500,
                maxTitleLength = limits?.optInt("maxTitleLength", 140) ?: 140,
                recordingRetentionHours = limits?.optInt("recordingRetentionHours", 6) ?: 6,
                signupsEnabled = features?.optBoolean("signups", true) ?: true,
                tipsEnabled = payments?.optBoolean("enabled", false) ?: false,
                turnConfigured = webrtc?.optBoolean("turnConfigured", false) ?: false,
                payments = payments?.let(PaymentConfigInfo::from) ?: PaymentConfigInfo(),
            )
        }
    }
}

data class AdminOverviewData(
    val totalUsers: Int,
    val newUsersToday: Int,
    val streamers: Int,
    val bannedUsers: Int,
    val liveStreams: Int,
    val totalStreams: Int,
    val watchMinutesToday: Int,
    val chatMessagesToday: Int,
    val openReports: Int,
    val activeBans: Int,
    val readyVods: Int,
    val environment: String,
    val version: String,
    val integrations: List<Pair<String, Boolean>>,
) {
    companion object {
        fun from(json: JSONObject): AdminOverviewData {
            val analytics = json.optJSONObject("analytics") ?: JSONObject()
            val users = analytics.optJSONObject("users") ?: JSONObject()
            val streams = analytics.optJSONObject("streams") ?: JSONObject()
            val engagement = analytics.optJSONObject("engagement") ?: JSONObject()
            val moderation = analytics.optJSONObject("moderation") ?: JSONObject()
            val storage = json.optJSONObject("storage") ?: JSONObject()
            val integrationsArr = json.optJSONArray("integrations")
            val integrations = buildList {
                if (integrationsArr != null) {
                    for (i in 0 until integrationsArr.length()) {
                        val obj = integrationsArr.optJSONObject(i) ?: continue
                        add(obj.optString("label", obj.optString("id")) to obj.optBoolean("configured", false))
                    }
                }
            }
            return AdminOverviewData(
                totalUsers = users.optInt("total", 0),
                newUsersToday = users.optInt("newToday", 0),
                streamers = users.optInt("streamers", 0),
                bannedUsers = users.optInt("banned", 0),
                liveStreams = streams.optInt("live", 0),
                totalStreams = streams.optInt("total", 0),
                watchMinutesToday = engagement.optInt("watchMinutesToday", 0),
                chatMessagesToday = engagement.optInt("chatMessagesToday", 0),
                openReports = moderation.optInt("openReports", storage.optInt("openReports", 0)),
                activeBans = moderation.optInt("activeBans", 0),
                readyVods = storage.optInt("vods", 0),
                environment = json.optCleanString("environment") ?: "development",
                version = json.optCleanString("version") ?: "dev",
                integrations = integrations,
            )
        }
    }
}

data class AdminUserRow(
    val id: String,
    val email: String,
    val username: String,
    val displayName: String,
    val isStreamer: Boolean,
    val isAdmin: Boolean,
    val isBanned: Boolean,
    val emailVerified: Boolean,
    val followers: Int,
) {
    companion object {
        fun from(json: JSONObject): AdminUserRow {
            val username = json.optString("username", "user")
            return AdminUserRow(
                id = json.optString("id"),
                email = json.optString("email"),
                username = username,
                displayName = json.optCleanString("displayName") ?: username,
                isStreamer = json.optBoolean("isStreamer", false),
                isAdmin = json.optBoolean("isAdmin", false),
                isBanned = json.optBoolean("isBanned", false),
                emailVerified = json.optBoolean("emailVerified", false),
                followers = json.optInt("followers", 0),
            )
        }
    }
}

data class FeatureFlagRow(
    val key: String,
    val enabled: Boolean,
    val description: String?,
) {
    companion object {
        fun from(json: JSONObject) = FeatureFlagRow(
            key = json.optString("key"),
            enabled = json.optBoolean("enabled", false),
            description = json.optCleanString("description"),
        )
    }
}

fun JSONObject.optCleanString(key: String): String? {
    if (!has(key) || isNull(key)) return null
    return optString(key).trim().takeIf { it.isNotEmpty() && it != "null" }
}

fun JSONObject.optNullableInt(key: String): Int? =
    if (has(key) && !isNull(key)) optInt(key) else null

fun JSONObject.optNullableLong(key: String): Long? =
    if (has(key) && !isNull(key)) optLong(key) else null

fun <T> JSONArray?.toObjectList(mapper: (JSONObject) -> T): List<T> {
    if (this == null) return emptyList()
    return buildList {
        for (i in 0 until length()) {
            optJSONObject(i)?.let { add(mapper(it)) }
        }
    }
}
