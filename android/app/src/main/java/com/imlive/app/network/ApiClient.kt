package com.imlive.app.network

import android.content.Context
import com.imlive.app.BuildConfig
import com.imlive.app.auth.SecureTokenStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException

class ApiException(
    val status: Int,
    val code: String?,
    override val message: String,
) : IOException(message)

/** Small typed-enough Worker client; every endpoint preserves the web error contract. */
class ApiClient(context: Context) {
    private val tokens = SecureTokenStore(context.applicationContext)
    private val http = OkHttpClient.Builder().build()
    private val baseUrl = BuildConfig.API_BASE_URL.trimEnd('/')
    private val jsonType = "application/json; charset=utf-8".toMediaType()

    suspend fun get(path: String, auth: Boolean = true): JSONObject =
        JSONObject(requestText("GET", path, null, auth))

    suspend fun getArray(path: String, auth: Boolean = true): JSONArray =
        JSONArray(requestText("GET", path, null, auth))

    suspend fun post(path: String, body: JSONObject? = null, auth: Boolean = true): JSONObject =
        JSONObject(requestText("POST", path, body, auth))

    suspend fun put(path: String, body: JSONObject? = null, auth: Boolean = true): JSONObject =
        JSONObject(requestText("PUT", path, body, auth))

    suspend fun patch(path: String, body: JSONObject, auth: Boolean = true): JSONObject =
        JSONObject(requestText("PATCH", path, body, auth))

    suspend fun delete(path: String, auth: Boolean = true): JSONObject =
        JSONObject(requestText("DELETE", path, null, auth))

    suspend fun refresh(): Boolean = withContext(Dispatchers.IO) {
        val refresh = tokens.refreshToken ?: return@withContext false
        try {
            val payload = post("/auth/refresh", JSONObject().put("refreshToken", refresh), auth = false)
            tokens.save(payload.getString("accessToken"), payload.getString("refreshToken"))
            true
        } catch (_: IOException) {
            tokens.clear()
            false
        }
    }

    fun clearSession() = tokens.clear()
    fun hasSession(): Boolean = !tokens.accessToken.isNullOrBlank()

    private suspend fun requestText(
        method: String,
        path: String,
        body: JSONObject?,
        auth: Boolean,
        retried: Boolean = false,
    ): String = withContext(Dispatchers.IO) {
        val requestBuilder = Request.Builder().url("$baseUrl$path")
            .header("Accept", "application/json")
        if (auth) tokens.accessToken?.let { requestBuilder.header("Authorization", "Bearer $it") }
        if (body != null) requestBuilder.method(method, body.toString().toRequestBody(jsonType))
        else requestBuilder.method(method, null)

        http.newCall(requestBuilder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code == 401 && auth && !retried && tokens.refreshToken != null && refresh()) {
                return@withContext requestText(method, path, body, auth, retried = true)
            }
            if (!response.isSuccessful) {
                val payload = runCatching { JSONObject(text) }.getOrElse { JSONObject() }
                throw ApiException(
                    response.code,
                    payload.optString("code").takeIf { it.isNotBlank() },
                    payload.optString("error", response.message),
                )
            }
            text.ifBlank { "{}" }
        }
    }
}
