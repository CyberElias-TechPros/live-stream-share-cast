package com.imlive.app.network

import android.content.Context
import com.imlive.app.BuildConfig
import com.imlive.app.auth.SecureTokenStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.util.UUID
import java.util.concurrent.TimeUnit

class ApiException(
    val status: Int,
    val code: String?,
    override val message: String,
    val details: JSONObject? = null,
) : IOException(message)

/**
 * Shared Cloudflare Worker REST client with:
 * - single-flight refresh-token rotation Mutex (prevents concurrent 401s from invalidating sessions);
 * - multipart upload support for avatars, thumbnails, and recordings;
 * - dynamic ServerEndpointStore resolution;
 * - structured error translation matching web `ApiRequestError`.
 */
class ApiClient(
    context: Context,
    val endpoints: ServerEndpointStore = ServerEndpointStore(context.applicationContext),
) {
    private val tokens = SecureTokenStore(context.applicationContext)
    private val refreshMutex = Mutex()
    val http: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(45, TimeUnit.SECONDS)
        .writeTimeout(120, TimeUnit.SECONDS)
        .build()

    private val jsonType = "application/json; charset=utf-8".toMediaType()

    suspend fun get(path: String, auth: Boolean = true): JSONObject =
        JSONObject(requestText("GET", path, null, auth))

    suspend fun getRawText(path: String, auth: Boolean = true): String =
        requestText("GET", path, null, auth)

    suspend fun getArray(path: String, auth: Boolean = true): JSONArray =
        JSONArray(requestText("GET", path, null, auth))

    suspend fun post(path: String, body: JSONObject? = null, auth: Boolean = true): JSONObject =
        JSONObject(requestText("POST", path, body ?: JSONObject(), auth))

    suspend fun put(path: String, body: JSONObject? = null, auth: Boolean = true): JSONObject =
        JSONObject(requestText("PUT", path, body ?: JSONObject(), auth))

    suspend fun patch(path: String, body: JSONObject, auth: Boolean = true): JSONObject =
        JSONObject(requestText("PATCH", path, body, auth))

    suspend fun delete(path: String, body: JSONObject? = null, auth: Boolean = true): JSONObject =
        JSONObject(requestText("DELETE", path, body, auth))

    suspend fun postMultipartBytes(
        path: String,
        fieldName: String,
        fileName: String,
        mimeType: String,
        bytes: ByteArray,
        fields: Map<String, String> = emptyMap(),
    ): JSONObject = withContext(Dispatchers.IO) {
        val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
        fields.forEach { (key, value) -> builder.addFormDataPart(key, value) }
        builder.addFormDataPart(fieldName, fileName, bytes.toRequestBody(mimeType.toMediaType()))
        val multipartBody = builder.build()
        JSONObject(executeMultipart(path, multipartBody, retried = false))
    }

    suspend fun postMultipartFile(
        path: String,
        fieldName: String,
        file: File,
        mimeType: String,
        fields: Map<String, String> = emptyMap(),
    ): JSONObject = withContext(Dispatchers.IO) {
        val builder = MultipartBody.Builder().setType(MultipartBody.FORM)
        fields.forEach { (key, value) -> builder.addFormDataPart(key, value) }
        builder.addFormDataPart(fieldName, file.name, file.asRequestBody(mimeType.toMediaType()))
        val multipartBody = builder.build()
        JSONObject(executeMultipart(path, multipartBody, retried = false))
    }

    suspend fun refresh(): Boolean = withContext(Dispatchers.IO) {
        val tokenBeforeLock = tokens.accessToken
        refreshMutex.withLock {
            // If another coroutine already rotated the session while we waited on the mutex, reuse it.
            val currentAccess = tokens.accessToken
            if (!currentAccess.isNullOrBlank() && currentAccess != tokenBeforeLock) {
                return@withLock true
            }
            val refresh = tokens.refreshToken ?: return@withLock false
            try {
                val request = Request.Builder()
                    .url("${endpoints.apiBaseUrl}/auth/refresh")
                    .header("Accept", "application/json")
                    .header("User-Agent", USER_AGENT)
                    .post(JSONObject().put("refreshToken", refresh).toString().toRequestBody(jsonType))
                    .build()
                http.newCall(request).execute().use { response ->
                    val text = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        if (response.code == 401 || response.code == 403) tokens.clear()
                        return@withLock false
                    }
                    val payload = JSONObject(text)
                    tokens.save(payload.getString("accessToken"), payload.getString("refreshToken"))
                    true
                }
            } catch (_: Exception) {
                false
            }
        }
    }

    fun saveSession(access: String, refresh: String) = tokens.save(access, refresh)
    fun clearSession() = tokens.clear()
    fun hasSession(): Boolean = !tokens.accessToken.isNullOrBlank()
    fun currentAccessToken(): String? = tokens.accessToken

    private suspend fun executeMultipart(
        path: String,
        multipartBody: MultipartBody,
        retried: Boolean,
    ): String = withContext(Dispatchers.IO) {
        val builder = Request.Builder()
            .url("${endpoints.apiBaseUrl}$path")
            .header("Accept", "application/json")
            .header("User-Agent", USER_AGENT)
            .header("X-Request-Id", UUID.randomUUID().toString())
            .post(multipartBody)
        tokens.accessToken?.let { builder.header("Authorization", "Bearer $it") }

        http.newCall(builder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code == 401 && !retried && tokens.refreshToken != null && refresh()) {
                return@withContext executeMultipart(path, multipartBody, retried = true)
            }
            if (!response.isSuccessful) throw parseError(response.code, response.message, text)
            text.ifBlank { "{}" }
        }
    }

    private suspend fun requestText(
        method: String,
        path: String,
        body: JSONObject?,
        auth: Boolean,
        retried: Boolean = false,
    ): String = withContext(Dispatchers.IO) {
        val requestBuilder = Request.Builder()
            .url("${endpoints.apiBaseUrl}$path")
            .header("Accept", "application/json")
            .header("User-Agent", USER_AGENT)
            .header("X-Request-Id", UUID.randomUUID().toString())

        if (auth) tokens.accessToken?.let { requestBuilder.header("Authorization", "Bearer $it") }
        when {
            body != null -> requestBuilder.method(method, body.toString().toRequestBody(jsonType))
            method == "POST" || method == "PUT" || method == "PATCH" ->
                requestBuilder.method(method, "{}".toRequestBody(jsonType))
            else -> requestBuilder.method(method, null)
        }

        http.newCall(requestBuilder.build()).execute().use { response ->
            val text = response.body?.string().orEmpty()
            if (response.code == 401 && auth && !retried && tokens.refreshToken != null && refresh()) {
                return@withContext requestText(method, path, body, auth, retried = true)
            }
            if (!response.isSuccessful) {
                throw parseError(response.code, response.message, text)
            }
            text.ifBlank { "{}" }
        }
    }

    private fun parseError(status: Int, fallbackMessage: String, bodyText: String): ApiException {
        val payload = runCatching { JSONObject(bodyText) }.getOrElse { JSONObject() }
        val code = payload.optString("code").takeIf { it.isNotBlank() }
        val rawError = payload.optString("error").takeIf { it.isNotBlank() } ?: fallbackMessage.ifBlank { "Request failed ($status)" }
        return ApiException(status, code, rawError, payload.optJSONObject("details"))
    }

    private companion object {
        const val USER_AGENT = "ImLive-Android/${BuildConfig.VERSION_NAME}"
    }
}
