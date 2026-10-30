package com.imlive.app.live

import com.imlive.app.network.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class LiveRepository(private val api: ApiClient) {
    suspend fun liveStreams(): Result<List<LiveStream>> = withContext(Dispatchers.IO) {
        runCatching {
            val rows = api.get("/streams?live=true&limit=24", auth = false).optJSONArray("streams") ?: JSONArray()
            buildList {
                for (index in 0 until rows.length()) add(LiveStream.from(rows.getJSONObject(index)))
            }
        }
    }

    suspend fun stream(id: String): Result<LiveStream> = runCatching {
        LiveStream.from(api.get("/streams/$id", auth = false).getJSONObject("stream"))
    }

    suspend fun ticket(streamId: String, role: String): Result<String> = runCatching {
        api.post("/ws/tickets", JSONObject().put("streamId", streamId).put("role", role)).getString("ticket")
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

    suspend fun startWatch(streamId: String): Result<String> = runCatching {
        api.post("/analytics/watch/start", JSONObject().put("streamId", streamId), auth = false).optString("sessionId")
    }

    suspend fun createStream(title: String, category: String): Result<LiveStream> = runCatching {
        LiveStream.from(
            api.post("/streams", JSONObject().put("title", title).put("category", category)).getJSONObject("stream"),
        )
    }

    suspend fun startStream(streamId: String): Result<LiveStream> = runCatching {
        LiveStream.from(api.post("/streams/$streamId/start", JSONObject()).getJSONObject("stream"))
    }

    suspend fun heartbeat(streamId: String, viewerCount: Int = 0): Result<Boolean> = runCatching {
        api.post("/streams/$streamId/heartbeat", JSONObject().put("viewerCount", viewerCount))
        true
    }

    suspend fun stopStream(streamId: String): Result<Boolean> = runCatching {
        api.post("/streams/$streamId/stop", JSONObject())
        true
    }

    suspend fun chatHistory(streamId: String): Result<List<ChatMessage>> = withContext(Dispatchers.IO) {
        runCatching {
            val rows = api.get("/streams/$streamId/chat?limit=50", auth = false).optJSONArray("messages") ?: JSONArray()
            buildList {
                for (index in 0 until rows.length()) add(ChatMessage.from(rows.getJSONObject(index)))
            }
        }
    }

    suspend fun followState(userId: String): Result<Boolean> = runCatching {
        api.get("/users/$userId/follow").optBoolean("isFollowing", false)
    }

    suspend fun follow(userId: String): Result<Boolean> = runCatching {
        api.put("/users/$userId/follow")
        true
    }

    suspend fun unfollow(userId: String): Result<Boolean> = runCatching {
        api.delete("/users/$userId/follow")
        false
    }

    suspend fun recordingsMine(): Result<List<Recording>> = withContext(Dispatchers.IO) {
        runCatching {
            val rows = api.get("/recordings/mine").optJSONArray("recordings") ?: JSONArray()
            buildList {
                for (index in 0 until rows.length()) add(Recording.from(rows.getJSONObject(index)))
            }
        }
    }

    suspend fun playbackUrl(recordingId: String): Result<String> = runCatching {
        api.get("/recordings/$recordingId/playback-url").getString("url")
    }
}

data class Recording(
    val id: String,
    val title: String,
    val visibility: String,
    val status: String,
    val durationSeconds: Int?,
) {
    companion object {
        fun from(json: JSONObject) = Recording(
            id = json.optString("id"),
            title = json.optString("title", "Untitled recording"),
            visibility = json.optString("visibility", "private"),
            status = json.optString("status", "unknown"),
            durationSeconds = if (json.has("durationSeconds") && !json.isNull("durationSeconds")) json.optInt("durationSeconds") else null,
        )
    }
}


data class IceServerConfig(
    val urls: List<String>,
    val username: String?,
    val credential: String?,
)

data class LiveStream(
    val id: String,
    val title: String,
    val ownerId: String?,
    val username: String?,
    val category: String?,
    val viewers: Int,
    val isLive: Boolean,
) {
    companion object {
        fun from(json: JSONObject) = LiveStream(
            id = json.optString("id"),
            title = json.optString("title", "Untitled broadcast"),
            ownerId = json.optString("userId").ifBlank { json.optString("ownerId") }.takeIf { it.isNotBlank() },
            username = json.optString("username").takeIf { it.isNotBlank() },
            category = json.optString("category").takeIf { it.isNotBlank() },
            viewers = json.optInt("viewerCount", 0),
            isLive = json.optBoolean("isLive", true),
        )
    }
}
