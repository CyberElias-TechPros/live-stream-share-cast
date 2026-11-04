package com.imlive.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Router
import androidx.compose.material.icons.filled.Visibility
import androidx.compose.material.icons.filled.VisibilityOff
import androidx.compose.material.icons.filled.WifiTethering
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.imlive.app.network.EndpointUrlRules
import com.imlive.app.ui.ImLiveContainer
import com.imlive.app.ui.theme.ImLivePalette
import kotlinx.coroutines.launch

private enum class AuthTab { SIGN_IN, SIGN_UP, RESET_PASSWORD }

@Composable
fun AuthScreen(
    container: ImLiveContainer,
    initialResetToken: String? = null,
    onAuthenticated: () -> Unit,
    onContinueAsGuest: () -> Unit,
    onOpenOfflineRooms: () -> Unit,
    onStartOfflineLanBroadcast: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    val apiBase by container.endpointStore.apiBaseUrlFlow.collectAsState()

    var tab by remember(initialResetToken) {
        mutableStateOf(if (!initialResetToken.isNullOrBlank()) AuthTab.RESET_PASSWORD else AuthTab.SIGN_IN)
    }
    var username by remember { mutableStateOf("") }
    var displayName by remember { mutableStateOf("") }
    var email by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var resetToken by remember(initialResetToken) { mutableStateOf(initialResetToken ?: "") }
    var newPassword by remember { mutableStateOf("") }
    var showPassword by remember { mutableStateOf(false) }

    var busy by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    var infoMessage by remember { mutableStateOf<String?>(null) }
    var showServerDialog by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = 22.dp, vertical = 24.dp),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(44.dp)
                        .clip(CircleShape)
                        .background(
                            Brush.linearGradient(
                                listOf(MaterialTheme.colorScheme.primary, ImLivePalette.LiveRose),
                            ),
                        ),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(Icons.Default.PlayArrow, contentDescription = null, tint = ImLivePalette.Obsidian)
                }
                Spacer(Modifier.width(12.dp))
                Column {
                    Text("I'm Live", style = MaterialTheme.typography.headlineMedium)
                    Text(
                        "Native WebRTC live video · Cloud & Offline LAN",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            IconButton(onClick = { showServerDialog = true }) {
                Icon(Icons.Default.Cloud, contentDescription = "Configure server", tint = MaterialTheme.colorScheme.primary)
            }
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
            border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
            shape = RoundedCornerShape(22.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = tab == AuthTab.SIGN_IN,
                        onClick = { tab = AuthTab.SIGN_IN; errorMessage = null; infoMessage = null },
                        label = { Text("Sign in") },
                    )
                    FilterChip(
                        selected = tab == AuthTab.SIGN_UP,
                        onClick = { tab = AuthTab.SIGN_UP; errorMessage = null; infoMessage = null },
                        label = { Text("Create account") },
                    )
                    FilterChip(
                        selected = tab == AuthTab.RESET_PASSWORD,
                        onClick = { tab = AuthTab.RESET_PASSWORD; errorMessage = null; infoMessage = null },
                        label = { Text("Reset") },
                    )
                }

                when (tab) {
                    AuthTab.SIGN_IN, AuthTab.SIGN_UP -> {
                        if (tab == AuthTab.SIGN_UP) {
                            OutlinedTextField(
                                value = username,
                                onValueChange = { username = it },
                                label = { Text("Username (e.g. alex_live)") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                            OutlinedTextField(
                                value = displayName,
                                onValueChange = { displayName = it },
                                label = { Text("Display name (optional)") },
                                singleLine = true,
                                modifier = Modifier.fillMaxWidth(),
                            )
                        }
                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it },
                            label = { Text("Email address") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = password,
                            onValueChange = { password = it },
                            label = { Text(if (tab == AuthTab.SIGN_UP) "Password (8+ characters)" else "Password") },
                            visualTransformation = if (showPassword) VisualTransformation.None else PasswordVisualTransformation(),
                            trailingIcon = {
                                IconButton(onClick = { showPassword = !showPassword }) {
                                    Icon(
                                        if (showPassword) Icons.Default.VisibilityOff else Icons.Default.Visibility,
                                        contentDescription = "Toggle password visibility",
                                    )
                                }
                            },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )

                        Button(
                            onClick = {
                                busy = true
                                errorMessage = null
                                infoMessage = null
                                scope.launch {
                                    val result = if (tab == AuthTab.SIGN_UP) {
                                        container.authRepository.signUp(
                                            username = username,
                                            email = email,
                                            password = password,
                                            displayName = displayName.ifBlank { username },
                                        )
                                    } else {
                                        container.authRepository.login(email, password)
                                    }
                                    busy = false
                                    result.fold(
                                        onSuccess = { onAuthenticated() },
                                        onFailure = { errorMessage = it.message ?: "Authentication failed" },
                                    )
                                }
                            },
                            enabled = !busy && email.isNotBlank() && password.length >= 8 &&
                                (tab == AuthTab.SIGN_IN || username.trim().length >= 3),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            if (busy) {
                                CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp)
                            } else {
                                Text(if (tab == AuthTab.SIGN_UP) "Create account & continue" else "Sign in")
                            }
                        }
                    }

                    AuthTab.RESET_PASSWORD -> {
                        Text(
                            "Request a password reset token for your email, or paste an existing token to set a new password.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        OutlinedTextField(
                            value = email,
                            onValueChange = { email = it },
                            label = { Text("Account email") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedButton(
                            onClick = {
                                busy = true
                                errorMessage = null
                                infoMessage = null
                                scope.launch {
                                    val res = container.authRepository.forgotPassword(email)
                                    busy = false
                                    res.fold(
                                        onSuccess = { msg -> infoMessage = msg },
                                        onFailure = { errorMessage = it.message ?: "Could not request reset" },
                                    )
                                }
                            },
                            enabled = !busy && email.contains("@"),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Send reset token")
                        }

                        OutlinedTextField(
                            value = resetToken,
                            onValueChange = { resetToken = it },
                            label = { Text("Reset token") },
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        OutlinedTextField(
                            value = newPassword,
                            onValueChange = { newPassword = it },
                            label = { Text("New password (8+ characters)") },
                            visualTransformation = PasswordVisualTransformation(),
                            singleLine = true,
                            modifier = Modifier.fillMaxWidth(),
                        )
                        Button(
                            onClick = {
                                busy = true
                                errorMessage = null
                                infoMessage = null
                                scope.launch {
                                    val res = container.authRepository.resetPassword(resetToken, newPassword)
                                    busy = false
                                    res.fold(
                                        onSuccess = {
                                            infoMessage = "Password updated! Sign in with your new password."
                                            password = newPassword
                                            tab = AuthTab.SIGN_IN
                                        },
                                        onFailure = { errorMessage = it.message ?: "Reset failed" },
                                    )
                                }
                            },
                            enabled = !busy && resetToken.length >= 12 && newPassword.length >= 8,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Text("Set new password")
                        }
                    }
                }

                errorMessage?.let {
                    Surface(
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.14f),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            it,
                            color = MaterialTheme.colorScheme.error,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(10.dp),
                        )
                    }
                }
                infoMessage?.let {
                    Surface(
                        color = ImLivePalette.OnlineEmerald.copy(alpha = 0.14f),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(
                            it,
                            color = ImLivePalette.OnlineEmerald,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(10.dp),
                        )
                    }
                }
            }
        }

        OutlinedButton(
            onClick = onContinueAsGuest,
            modifier = Modifier.fillMaxWidth(),
        ) {
            Icon(Icons.Default.Explore, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(Modifier.width(8.dp))
            Text("Explore live streams & VOD library as Guest")
        }

        Card(
            colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
            border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
            shape = RoundedCornerShape(20.dp),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Column(
                modifier = Modifier.padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.WifiTethering, contentDescription = null, tint = ImLivePalette.OnlineEmerald)
                    Spacer(Modifier.width(8.dp))
                    Text("Zero-Internet Local Wi-Fi & Hotspot Mode", style = MaterialTheme.typography.titleMedium)
                }
                Text(
                    "Stream camera & microphone directly between phones and laptops on the same Wi-Fi or mobile hotspot — no account, no cloud server, and zero mobile data.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                    OutlinedButton(onClick = onOpenOfflineRooms, modifier = Modifier.weight(1f)) {
                        Icon(Icons.Default.Router, contentDescription = null, modifier = Modifier.size(16.dp))
                        Spacer(Modifier.width(6.dp))
                        Text("Join / SDP Room")
                    }
                    Button(onClick = onStartOfflineLanBroadcast, modifier = Modifier.weight(1f)) {
                        Text("Host LAN Live")
                    }
                }
            }
        }

        Text(
            "Connected API: $apiBase",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }

    if (showServerDialog) {
        ServerEndpointDialog(
            currentUrl = apiBase,
            onDismiss = { showServerDialog = false },
            onSave = { next ->
                container.endpointStore.updateCustomUrl(next).getOrThrow()
                showServerDialog = false
            },
            onResetDefault = {
                container.endpointStore.resetToDefault()
                showServerDialog = false
            },
        )
    }
}

@Composable
fun ServerEndpointDialog(
    currentUrl: String,
    onDismiss: () -> Unit,
    onSave: (String) -> Unit,
    onResetDefault: () -> Unit,
) {
    var draft by remember(currentUrl) { mutableStateOf(currentUrl) }
    var validationError by remember { mutableStateOf<String?>(null) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cloud API Server") },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text(
                    "Point I'm Live at the official Cloudflare Worker, a self-hosted Worker, or a local emulator dev server.",
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedTextField(
                    value = draft,
                    onValueChange = { draft = it; validationError = null },
                    label = { Text("API base URL") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = draft == EndpointUrlRules.OFFICIAL_PRODUCTION_API_URL,
                        onClick = { draft = EndpointUrlRules.OFFICIAL_PRODUCTION_API_URL },
                        label = { Text("Official Cloud") },
                    )
                    FilterChip(
                        selected = draft.contains("10.0.2.2"),
                        onClick = { draft = "http://10.0.2.2:8787/api" },
                        label = { Text("Emulator 8787") },
                    )
                }
                validationError?.let {
                    Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium)
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    runCatching { onSave(draft) }
                        .onFailure { validationError = it.message ?: "Invalid server URL" }
                },
            ) {
                Text("Save")
            }
        },
        dismissButton = {
            Row {
                TextButton(onClick = onResetDefault) { Text("Reset") }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}
