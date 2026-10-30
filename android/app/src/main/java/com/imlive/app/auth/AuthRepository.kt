package com.imlive.app.auth

import android.content.Context
import com.imlive.app.network.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject

class AuthRepository(context: Context) {
    private val api = ApiClient(context)
    private val tokens = SecureTokenStore(context.applicationContext)

    suspend fun login(email: String, password: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val response = api.post(
                "/auth/login",
                JSONObject().put("email", email.trim()).put("password", password),
                auth = false,
            )
            tokens.save(response.getString("accessToken"), response.getString("refreshToken"))
            response.optJSONObject("user")?.optString("username") ?: email
        }
    }

    suspend fun signUp(username: String, email: String, password: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val response = api.post(
                "/auth/signup",
                JSONObject()
                    .put("username", username.trim())
                    .put("email", email.trim())
                    .put("password", password),
                auth = false,
            )
            tokens.save(response.getString("accessToken"), response.getString("refreshToken"))
            username
        }
    }

    suspend fun me(): Result<JSONObject> = runCatching { api.get("/auth/me") }

    fun loggedIn(): Boolean = api.hasSession()
    fun logout() = api.clearSession()
}
