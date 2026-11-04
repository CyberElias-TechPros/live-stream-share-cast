package com.imlive.app.auth

import android.content.Context
import com.imlive.app.model.AuthSessionItem
import com.imlive.app.model.PersonalApiTokenItem
import com.imlive.app.model.UserProfile
import com.imlive.app.model.toObjectList
import com.imlive.app.network.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

data class CreatedApiTokenResult(
    val id: String,
    val name: String,
    val tokenPlaintext: String,
    val prefix: String,
)

class AuthRepository(
    context: Context,
    private val api: ApiClient = ApiClient(context),
) {
    private val _currentUser = MutableStateFlow<UserProfile?>(null)
    val currentUser: StateFlow<UserProfile?> = _currentUser.asStateFlow()

    suspend fun login(email: String, password: String): Result<UserProfile> = withContext(Dispatchers.IO) {
        runCatching {
            val response = api.post(
                "/auth/login",
                JSONObject()
                    .put("email", email.trim())
                    .put("password", password),
                auth = false,
            )
            api.saveSession(response.getString("accessToken"), response.getString("refreshToken"))
            val user = response.optJSONObject("user")?.let(UserProfile::from)
                ?: refreshMe().getOrThrow()
            _currentUser.value = user
            user
        }
    }

    suspend fun signUp(
        username: String,
        email: String,
        password: String,
        displayName: String = username,
        acceptTerms: Boolean = true,
    ): Result<UserProfile> = withContext(Dispatchers.IO) {
        runCatching {
            val response = api.post(
                "/auth/signup",
                JSONObject()
                    .put("username", username.trim())
                    .put("displayName", displayName.trim().ifBlank { username.trim() })
                    .put("email", email.trim())
                    .put("password", password)
                    .put("acceptTerms", acceptTerms),
                auth = false,
            )
            api.saveSession(response.getString("accessToken"), response.getString("refreshToken"))
            val user = response.optJSONObject("user")?.let(UserProfile::from)
                ?: refreshMe().getOrThrow()
            _currentUser.value = user
            user
        }
    }

    suspend fun me(): Result<JSONObject> = runCatching {
        val res = api.get("/auth/me")
        res.optJSONObject("user")?.let { _currentUser.value = UserProfile.from(it) }
        res
    }

    suspend fun refreshMe(): Result<UserProfile> = withContext(Dispatchers.IO) {
        runCatching {
            val res = api.get("/users/me")
            val userObj = res.getJSONObject("user")
            val user = UserProfile.from(userObj)
            _currentUser.value = user
            user
        }
    }

    fun updateCachedUser(user: UserProfile?) {
        _currentUser.value = user
    }

    suspend fun forgotPassword(email: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val res = api.post("/auth/forgot-password", JSONObject().put("email", email.trim()), auth = false)
            val devToken = res.optString("devToken").takeIf { it.isNotBlank() }
            val message = res.optString("message", "If that email exists, a reset link is on its way.")
            if (devToken != null) "$message (Dev reset token: $devToken)" else message
        }
    }

    suspend fun resetPassword(token: String, newPassword: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.post(
                "/auth/reset-password",
                JSONObject().put("token", token.trim()).put("password", newPassword),
                auth = false,
            )
            true
        }
    }

    suspend fun changePassword(currentPassword: String, newPassword: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.post(
                "/auth/change-password",
                JSONObject()
                    .put("currentPassword", currentPassword)
                    .put("newPassword", newPassword),
            )
            true
        }
    }

    suspend fun verifyEmail(token: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val res = api.post("/auth/verify-email", JSONObject().put("token", token.trim()), auth = false)
            refreshMe()
            res.optString("email", "Verified")
        }
    }

    suspend fun resendVerification(): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            val res = api.post("/auth/resend-verification", JSONObject())
            res.optBoolean("delivered", true)
        }
    }

    suspend fun sessions(): Result<List<AuthSessionItem>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/auth/sessions").optJSONArray("sessions").toObjectList(AuthSessionItem::from)
        }
    }

    suspend fun revokeSession(sessionId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.delete("/auth/sessions/$sessionId")
            true
        }
    }

    suspend fun revokeAllSessions(): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.delete("/auth/sessions")
            api.clearSession()
            _currentUser.value = null
            true
        }
    }

    suspend fun apiTokens(): Result<List<PersonalApiTokenItem>> = withContext(Dispatchers.IO) {
        runCatching {
            api.get("/auth/tokens").optJSONArray("tokens").toObjectList(PersonalApiTokenItem::from)
        }
    }

    suspend fun createApiToken(name: String, scopes: List<String> = listOf("read", "write")): Result<CreatedApiTokenResult> =
        withContext(Dispatchers.IO) {
            runCatching {
                val scopesArr = JSONArray().apply { scopes.forEach(::put) }
                val res = api.post(
                    "/auth/tokens",
                    JSONObject().put("name", name.trim().ifBlank { "Android Token" }).put("scopes", scopesArr),
                )
                CreatedApiTokenResult(
                    id = res.optString("id"),
                    name = res.optString("name", name),
                    tokenPlaintext = res.getString("token"),
                    prefix = res.optString("prefix"),
                )
            }
        }

    suspend fun revokeApiToken(tokenId: String): Result<Boolean> = withContext(Dispatchers.IO) {
        runCatching {
            api.delete("/auth/tokens/$tokenId")
            true
        }
    }

    suspend fun exportAccountJson(): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val payload = api.get("/auth/account/export")
            payload.toString(2)
        }
    }

    suspend fun deleteAccount(password: String, confirmText: String): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            val res = api.delete(
                "/auth/account",
                JSONObject().put("password", password).put("confirm", confirmText.trim()),
            )
            api.clearSession()
            _currentUser.value = null
            res.optString("purgeAfter", "")
        }
    }

    suspend fun legalInfo(): Result<JSONObject> = withContext(Dispatchers.IO) {
        runCatching { api.get("/auth/legal", auth = false) }
    }

    fun loggedIn(): Boolean = api.hasSession()

    suspend fun logoutRemoteAndClear() {
        runCatching { api.post("/auth/logout", JSONObject()) }
        api.clearSession()
        _currentUser.value = null
    }

    fun logout() {
        api.clearSession()
        _currentUser.value = null
    }
}
