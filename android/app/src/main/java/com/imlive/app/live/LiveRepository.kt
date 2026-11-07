package com.imlive.app.live

import com.imlive.app.model.CategoryItem
import com.imlive.app.model.ChatMessage
import com.imlive.app.model.ChatRules
import com.imlive.app.model.IceServerConfig
import com.imlive.app.model.LiveStream
import com.imlive.app.model.Recording
import com.imlive.app.model.ScheduledBroadcast
import com.imlive.app.model.SearchSuggestion
import com.imlive.app.model.StreamPresence
import com.imlive.app.model.StreamSessionItem
import com.imlive.app.model.TrendingFeed
import com.imlive.app.model.UnifiedSearchResults
import com.imlive.app.model.UserProfile
import com.imlive.app.model.WatchHistoryItem
import com.imlive.app.model.toObjectList
import com.imlive.app.network.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder

data class ChatHistoryPage(
    val messages: List<ChatMessage>,
    val rules: ChatRules,
)

class LiveRepository(private val api: ApiClient) {
    suspend fun liveStreams(
        category: String? = null,
        search: String? = null,
        sort: String? = null,
        liveOnly: Boolean = true,
        limit: Int = 36,
    ): Result<List<LiveStream>> = withContext(Dispatchers.IO) {
        runCatching {
            val params = buildList {
                if (liveOnly) add("live=true")
                if (!category.isNullOrBlank()) add("category=${encode(category)}")
                if (!search.isNullOrBlank()) add("search=${encode(search)}")
                if (!sort.isNullOrBlank()) add("sort=${encode(sort)}")
                add("limit=$limit")
            }.joinToString("&")
            api.get("/streams?$params", auth = api.hasSession())
                .optJSONArray("streams")
                .toObjectList(LiveStream::from)
        }
    }

    suspend fun stream(id: String): Result<LiveStream> = withContext(Dispatchers.IO) {
        runCatching {
            LiveStream.from(api.get("/streams/${encode(id)}", auth = api.hasSession()).getJSONObject("stream"))
        }
    }

    suspend fun myStreams(): Result<List<LiveStream>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/users/me/streams").optJSONArray("streams").toObjectList(LiveStream::from)
        }
    }

    suspend fun mySessions(): Result<List<StreamSessionItem>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/users/me/sessions").optJSONArray("sessions").toObjectList(StreamSessionItem::from)
        }
    }

    suspend fun presence(streamId: String): Result<StreamPresence> = withContext(Dispatchers.IO) {
        runCatching {
            StreamPresence.from(api.get("/streams/${encode(streamId)}/presence", auth = false))
        }
    }

    suspend fun ticket(streamId: String, role: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            api.post(
                "/ws/tickets",
                JSONObject().put("streamId", streamId).put("role", role),
                auth = role == "host" || api.hasSession(),
            ).getString("ticket")
        }
    }

    suspend fun iceServers(): Result<List<IceServerConfig>> = withContext(Dispatchers.IO) {
        runCatching {
            val payload = api.get("/config/rtc/ice", auth = false)
            val rows = payload.optJSONArray("iceServers") ?: JSONArray()
            buildList {
                for (index in 0 until rows.length()) {
                    val item = rows.optJSONObject(index) ?: continue
                    val urls = when (val raw = item.opt("urls")) {
                        is JSONArray -> buildList { for (urlIndex in 0 until raw.length()) add(raw.optString(urlIndex)) }
                        is String -> listOf(raw)
                        else -> emptyList()
                    }.filter(String::isNotBlank)
                    if (urls.isNotEmpty()) {
                        add(
                            IceServerConfig(
                                urls = urls,
                                username = item.optString("username").takeIf { it.isNotBlank() },
                                credential = item.optString("credential").takeIf { it.isNotBlank() },
                            ),
                        )
                    }
                }
            }
        }
    }

    suspend fun categories(): Result<List<CategoryItem>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/config/categories", auth = false).optJSONArray("categories").toObjectList(CategoryItem::from)
        }
    }

    suspend fun trending(): Result<TrendingFeed> = withContext(Dispatchers.IO) {
        runCatching {
            val res = api.get("/search/trending", auth = api.hasSession())
            TrendingFeed(
                streams = res.optJSONArray("streams").toObjectList(LiveStream::from),
                categories = res.optJSONArray("categories").toObjectList(CategoryItem::from),
                rising = res.optJSONArray("rising").toObjectList(UserProfile::from),
                upcoming = res.optJSONArray("upcoming").toObjectList(ScheduledBroadcast::from),
            )
        }
    }

    suspend fun search(query: String, scope: String = "all"): Result<UnifiedSearchResults> = withContext(Dispatchers.IO) {
        runCatching {
            val res = api.get("/search?q=${encode(query)}&scope=${encode(scope)}&limit=24", auth = api.hasSession())
            UnifiedSearchResults(
                query = query,
                streams = res.optJSONArray("streams").toObjectList(LiveStream::from),
                channels = res.optJSONArray("channels").toObjectList(UserProfile::from),
                recordings = res.optJSONArray("recordings").toObjectList(Recording::from),
                categories = res.optJSONArray("categories").toObjectList(CategoryItem::from),
            )
        }
    }

    suspend fun searchSuggestions(query: String): Result<List<SearchSuggestion>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/search/suggest?q=${encode(query)}", auth = false)
                .optJSONArray("suggestions")
                .toObjectList(SearchSuggestion::from)
        }
    }

    suspend fun createStream(
        title: String,
        category: String,
        description: String? = null,
        tags: List<String> = emptyList(),
        streamType: String = "internet",
        isRecording: Boolean = false,
        isMature: Boolean = false,
    ): Result<LiveStream> = withContext(Dispatchers.IO) {
        runCatching {
            val tagsJson = JSONArray().apply { tags.forEach(::put) }
            val body = JSONObject()
                .put("title", title.trim())
                .put("category", category)
                .put("tags", tagsJson)
                .put("streamType", streamType)
                .put("isRecording", isRecording)
                .put("isMature", isMature)
            if (!description.isNullOrBlank()) body.put("description", description.trim())
            LiveStream.from(api.post("/streams", body).getJSONObject("stream"))
        }
    }

    suspend fun updateStream(
        streamId: String,
        title: String? = null,
        description: String? = null,
        category: String? = null,
        tags: List<String>? = null,
        isMature: Boolean? = null,
    ): Result<LiveStream> = withContext(Dispatchers.IO) {
        runCatching {
            val body = JSONObject()
            title?.let { body.put("title", it.trim()) }
            description?.let { body.put("description", it.trim()) }
            category?.let { body.put("category", it) }
            tags?.let { list -> body.put("tags", JSONArray().apply { list.forEach(::put) }) }
            isMature?.let { body.put("isMature", it) }
            LiveStream.from(api.patch("/streams/${encode(streamId)}", body).getJSONObject("stream"))
        }
    }

    suspend fun deleteStream(streamId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.delete("/streams/${encode(streamId)}")
            true
        }
    }

    suspend fun rotateStreamKey(streamId: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            api.post("/streams/${encode(streamId)}/key", JSONObject()).getString("streamKey")
        }
    }

    suspend fun startStream(streamId: String, isRecording: Boolean = false): Result<LiveStream> = withContext(Dispatchers.IO) {
        runCatching {
            LiveStream.from(
                api.post("/streams/${encode(streamId)}/start", JSONObject().put("isRecording", isRecording))
                    .getJSONObject("stream"),
            )
        }
    }

    suspend fun heartbeat(streamId: String, viewerCount: Int = 0): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.post("/streams/${encode(streamId)}/heartbeat", JSONObject().put("viewerCount", viewerCount))
            true
        }
    }

    suspend fun postStreamStats(streamId: String, viewerCount: Int, bandwidthKbps: Int): Result<Boolean> =
        withContext(Dispatchers.IO) {
            runCatching {
                api.post(
                    "/streams/${encode(streamId)}/stats",
                    JSONObject().put("viewerCount", viewerCount).put("bandwidth", bandwidthKbps),
                )
                true
            }
        }

    suspend fun stopStream(streamId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.post("/streams/${encode(streamId)}/stop", JSONObject())
            true
        }
    }

    suspend fun chatHistoryPage(streamId: String, limit: Int = 80): Result<ChatHistoryPage> = withContext(Dispatchers.IO) {
        runCatching {
            val payload = api.get("/streams/${encode(streamId)}/chat?limit=$limit", auth = false)
            ChatHistoryPage(
                messages = payload.optJSONArray("messages").toObjectList(ChatMessage::from),
                rules = ChatRules.from(payload.optJSONObject("rules")),
            )
        }
    }

    suspend fun chatHistory(streamId: String): Result<List<ChatMessage>> =
        chatHistoryPage(streamId).map { it.messages }

    suspend fun sendRestChat(streamId: String, message: String, replyToId: String? = null): Result<ChatMessage> =
        withContext(Dispatchers.IO) {
            runCatching {
                val body = JSONObject().put("message", message.trim())
                if (!replyToId.isNullOrBlank()) body.put("replyToId", replyToId)
                ChatMessage.from(api.post("/streams/${encode(streamId)}/chat", body).getJSONObject("message"))
            }
        }

    suspend fun moderateChatMessage(streamId: String, messageId: String, hide: Boolean): Result<Boolean> =
        withContext(Dispatchers.IO) {
            runCatching {
                api.patch(
                    "/streams/${encode(streamId)}/chat/${encode(messageId)}",
                    JSONObject().put("isModerated", hide),
                )
                true
            }
        }

    suspend fun startWatch(streamId: String? = null, recordingId: String? = null): Result<String> =
        withContext(Dispatchers.IO) {
            runCatching {
                val body = JSONObject().put("device", "android")
                if (!streamId.isNullOrBlank()) body.put("streamId", streamId)
                if (!recordingId.isNullOrBlank()) body.put("recordingId", recordingId)
                api.post("/analytics/watch/start", body, auth = api.hasSession()).optString("sessionId")
            }
        }

    suspend fun heartbeatWatch(sessionId: String, seconds: Int = 30): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.post("/analytics/watch/heartbeat", JSONObject().put("sessionId", sessionId).put("seconds", seconds), auth = false)
            true
        }
    }

    suspend fun endWatch(sessionId: String, seconds: Int = 0): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.post("/analytics/watch/end", JSONObject().put("sessionId", sessionId).put("seconds", seconds), auth = false)
            true
        }
    }

    suspend fun watchHistory(): Result<List<WatchHistoryItem>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/analytics/history?limit=16").optJSONArray("history").toObjectList(WatchHistoryItem::from)
        }
    }

    suspend fun followState(userId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching { api.get("/users/${encode(userId)}/follow").optBoolean("isFollowing", false) }
    }

    suspend fun follow(userId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.put("/users/${encode(userId)}/follow")
            true
        }
    }

    suspend fun unfollow(userId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.delete("/users/${encode(userId)}/follow")
            false
        }
    }

    suspend fun recordingsMine(): Result<List<Recording>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/recordings/mine").optJSONArray("recordings").toObjectList(Recording::from)
        }
    }

    suspend fun playbackUrl(recordingId: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val raw = api.get("/recordings/${encode(recordingId)}/playback-url", auth = api.hasSession()).getString("url")
            api.endpoints.resolveMediaUrl(raw)
        }
    }

    private fun encode(part: String): String = URLEncoder.encode(part, "UTF-8")
}
