package com.imlive.app.ui.screens

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.DoneAll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.imlive.app.model.AccentTheme
import com.imlive.app.model.AdminOverviewData
import com.imlive.app.model.AdminUserRow
import com.imlive.app.model.AppNotification
import com.imlive.app.model.AuthSessionItem
import com.imlive.app.model.FeatureFlagRow
import com.imlive.app.model.PersonalApiTokenItem
import com.imlive.app.model.RuntimePlatformConfig
import com.imlive.app.model.ServerHealthInfo
import com.imlive.app.model.VideoQualityPreset
import com.imlive.app.model.WebhookEndpointItem
import com.imlive.app.ui.ImLiveContainer
import com.imlive.app.ui.components.BadgePill
import com.imlive.app.ui.components.SectionHeader
import com.imlive.app.ui.components.StatMetricTile
import com.imlive.app.ui.components.sharePlainText
import com.imlive.app.ui.theme.ImLivePalette
import kotlinx.coroutines.launch

@Composable
fun NotificationsScreen(
    container: ImLiveContainer,
    onBack: () -> Unit,
    onUnreadChanged: (Int) -> Unit,
) {
    BackHandler(onBack = onBack)
    val scope = rememberCoroutineScope()
    var unreadOnly by remember { mutableStateOf(false) }
    var items by remember { mutableStateOf<List<AppNotification>>(emptyList()) }

    suspend fun load() {
        container.platformRepository.notifications(unreadOnly = unreadOnly).onSuccess { (list, unread) ->
            items = list
            onUnreadChanged(unread)
        }
    }

    LaunchedEffect(unreadOnly) { load() }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                    Text("Notifications", style = MaterialTheme.typography.headlineMedium)
                }
                TextButton(onClick = {
                    scope.launch {
                        container.platformRepository.markAllNotificationsRead().onSuccess { load() }
                    }
                }) {
                    Icon(Icons.Default.DoneAll, contentDescription = null)
                    Spacer(Modifier.width(4.dp))
                    Text("Mark all read")
                }
            }
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = !unreadOnly, onClick = { unreadOnly = false }, label = { Text("All") })
                FilterChip(selected = unreadOnly, onClick = { unreadOnly = true }, label = { Text("Unread only") })
            }
        }

        if (items.isEmpty()) {
            item {
                Text(
                    "You're all caught up — no notifications here.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        items(items, key = { it.id }) { notif ->
            val isRead = !notif.isUnread
            Card(
                onClick = {
                    if (notif.isUnread) {
                        scope.launch {
                            container.platformRepository.markNotificationRead(notif.id).onSuccess { load() }
                        }
                    }
                },
                colors = CardDefaults.cardColors(
                    containerColor = if (isRead) ImLivePalette.CardDark else ImLivePalette.CardElevated,
                ),
                border = BorderStroke(
                    1.dp,
                    if (isRead) ImLivePalette.BorderSubtle else MaterialTheme.colorScheme.primary.copy(alpha = 0.6f),
                ),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                        Text(notif.title, style = MaterialTheme.typography.titleMedium)
                        if (notif.isUnread) BadgePill("NEW", MaterialTheme.colorScheme.primary)
                    }
                    notif.body?.takeIf(String::isNotBlank)?.let {
                        Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    Text(notif.createdAt.replace('T', ' ').take(16), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
        }
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SettingsAndAdminScreen(
    container: ImLiveContainer,
    onBack: () -> Unit,
    onSignedOut: () -> Unit,
) {
    BackHandler(onBack = onBack)

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val prefs by container.preferences.settings.collectAsState()
    val apiBase by container.endpointStore.apiBaseUrlFlow.collectAsState()
    val netStatus by container.networkMonitor.status.collectAsState()
    val currentUser by container.authRepository.currentUser.collectAsState()

    var section by remember { mutableStateOf("preferences") }
    var health by remember { mutableStateOf<ServerHealthInfo?>(null) }
    var runtimeConfig by remember { mutableStateOf<RuntimePlatformConfig?>(null) }
    var sessions by remember { mutableStateOf<List<AuthSessionItem>>(emptyList()) }
    var apiTokens by remember { mutableStateOf<List<PersonalApiTokenItem>>(emptyList()) }
    var webhooks by remember { mutableStateOf<List<WebhookEndpointItem>>(emptyList()) }

    var adminOverview by remember { mutableStateOf<AdminOverviewData?>(null) }
    var adminUsers by remember { mutableStateOf<List<AdminUserRow>>(emptyList()) }
    var adminFlags by remember { mutableStateOf<List<FeatureFlagRow>>(emptyList()) }

    var showServerDialog by remember { mutableStateOf(false) }
    var showDeleteAccountDialog by remember { mutableStateOf(false) }
    var banner by remember { mutableStateOf<String?>(null) }

    suspend fun loadDiagnosticsAndSecurity() {
        container.platformRepository.health().onSuccess { health = it }
        container.platformRepository.runtimeConfig().onSuccess { runtimeConfig = it }
        if (currentUser != null) {
            container.authRepository.sessions().onSuccess { sessions = it }
            container.authRepository.apiTokens().onSuccess { apiTokens = it }
            container.platformRepository.webhooks().onSuccess { webhooks = it }
            if (currentUser?.isAdmin == true) {
                container.platformRepository.adminOverview().onSuccess { adminOverview = it }
                container.platformRepository.adminUsers().onSuccess { adminUsers = it }
                container.platformRepository.adminFlags().onSuccess { adminFlags = it }
            }
        }
    }

    LaunchedEffect(apiBase, currentUser?.id) {
        loadDiagnosticsAndSecurity()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = onBack) {
                    Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                }
                Text("Settings, Security & Diagnostics", style = MaterialTheme.typography.headlineMedium)
            }
        }

        banner?.let { msg ->
            item {
                Surface(color = ImLivePalette.CardElevated, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Text(msg, modifier = Modifier.padding(10.dp), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        item {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = section == "preferences", onClick = { section = "preferences" }, label = { Text("Device & Server") })
                if (currentUser != null) {
                    FilterChip(selected = section == "security", onClick = { section = "security" }, label = { Text("Security & Privacy") })
                    FilterChip(selected = section == "developers", onClick = { section = "developers" }, label = { Text("API & Webhooks") })
                }
                if (currentUser?.isAdmin == true) {
                    FilterChip(selected = section == "admin", onClick = { section = "admin" }, label = { Text("Admin Console") })
                }
            }
        }

        when (section) {
            "preferences" -> {
                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            Text("Appearance & Accent Theme", style = MaterialTheme.typography.titleMedium)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                AccentTheme.entries.forEach { accent ->
                                    FilterChip(
                                        selected = prefs.accentTheme == accent,
                                        onClick = { container.preferences.setAccentTheme(accent) },
                                        label = { Text(accent.label) },
                                    )
                                }
                            }

                            Text("Default Stream Quality", style = MaterialTheme.typography.titleMedium)
                            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                VideoQualityPreset.entries.forEach { preset ->
                                    FilterChip(
                                        selected = prefs.defaultQuality == preset,
                                        onClick = { container.preferences.setDefaultQuality(preset) },
                                        label = { Text(preset.label.substringBefore(" ")) },
                                    )
                                }
                            }

                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text("Cellular Data Saver (360p cap)")
                                Switch(checked = prefs.dataSaver, onCheckedChange = { container.preferences.setDataSaver(it) })
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text("Auto-record local MP4 when broadcasting")
                                Switch(checked = prefs.autoRecordLocal, onCheckedChange = { container.preferences.setAutoRecordLocal(it) })
                            }
                            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                Text("Keep screen awake while watching/live")
                                Switch(checked = prefs.keepScreenAwake, onCheckedChange = { container.preferences.setKeepScreenAwake(it) })
                            }
                        }
                    }
                }

                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            Text("Cloud Endpoint & Live Diagnostics", style = MaterialTheme.typography.titleMedium)
                            Text("API Base: $apiBase", style = MaterialTheme.typography.bodyMedium)
                            Text(
                                "Device Network: ${netStatus.transportLabel} · Online=${netStatus.isOnline} · Metered=${netStatus.isMetered}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                            val healthy = health?.status == "ok" || health?.status == "healthy"
                            Text(
                                "Worker Health: ${health?.let { "${it.status} (DB: ${it.database}, TURN: ${it.turnConfigured})" } ?: "Unreachable / Offline"}",
                                style = MaterialTheme.typography.bodyMedium,
                                color = if (healthy) ImLivePalette.OnlineEmerald else ImLivePalette.WarningAmber,
                            )
                            runtimeConfig?.let { cfg ->
                                Text(
                                    "Platform Limits: max P2P viewers=${cfg.maxP2pViewers} · retention=${cfg.recordingRetentionHours}h · TURN=${cfg.turnConfigured}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                OutlinedButton(onClick = { showServerDialog = true }) { Text("Switch Server") }
                                OutlinedButton(onClick = { scope.launch { loadDiagnosticsAndSecurity() } }) { Text("Re-test Health") }
                            }
                        }
                    }
                }

                if (currentUser != null) {
                    item {
                        OutlinedButton(
                            onClick = {
                                scope.launch {
                                    container.authRepository.logoutRemoteAndClear()
                                    onSignedOut()
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                        ) { Text("Sign Out (@${currentUser?.username})") }
                    }
                }
            }

            "security" -> {
                item {
                    EmailAndPasswordSecurityCard(
                        container = container,
                        isEmailVerified = currentUser?.emailVerified == true,
                        onFeedback = { banner = it },
                    )
                }

                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            SectionHeader(
                                title = "Active Device Sessions (${sessions.size})",
                                actionLabel = "Revoke All",
                                onAction = {
                                    scope.launch {
                                        container.authRepository.revokeAllSessions().onSuccess {
                                            onSignedOut()
                                        }
                                    }
                                },
                            )
                            sessions.forEach { sess ->
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically,
                                ) {
                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            (sess.userAgent ?: "Session").take(42) + if (sess.current) " (This device)" else "",
                                            style = MaterialTheme.typography.bodyMedium,
                                        )
                                        Text(sess.createdAt, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                    }
                                    if (!sess.current) {
                                        TextButton(onClick = {
                                            scope.launch {
                                                container.authRepository.revokeSession(sess.id).onSuccess { loadDiagnosticsAndSecurity() }
                                            }
                                        }) { Text("Revoke") }
                                    }
                                }
                            }
                        }
                    }
                }

                item {
                    Card(
                        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text("GDPR Data Export & Account Deletion", style = MaterialTheme.typography.titleMedium)
                            OutlinedButton(
                                onClick = {
                                    scope.launch {
                                        container.authRepository.exportAccountJson().onSuccess { json ->
                                            sharePlainText(context, "I'm Live Account Data Export", json)
                                        }
                                    }
                                },
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("Export Full Account Data (JSON)") }

                            Button(
                                onClick = { showDeleteAccountDialog = true },
                                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = Color.White),
                                modifier = Modifier.fillMaxWidth(),
                            ) { Text("Delete Account Permanently") }
                        }
                    }
                }
            }

            "developers" -> {
                item {
                    DeveloperTokensAndWebhooksCard(
                        container = container,
                        tokens = apiTokens,
                        webhooks = webhooks,
                        onReload = { scope.launch { loadDiagnosticsAndSecurity() } },
                        onFeedback = { banner = it },
                    )
                }
            }

            "admin" -> {
                adminOverview?.let { ov ->
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            StatMetricTile("Users", "${ov.totalUsers}", "New today: ${ov.newUsersToday}", Modifier.weight(1f))
                            StatMetricTile("Live Now", "${ov.liveStreams}", "Active rooms", Modifier.weight(1f))
                            StatMetricTile("Open Reports", "${ov.openReports}", "Moderation", Modifier.weight(1f))
                        }
                    }
                }

                if (adminFlags.isNotEmpty()) {
                    item {
                        Card(colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark), modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                Text("Runtime Feature Flags", style = MaterialTheme.typography.titleMedium)
                                adminFlags.forEach { flag ->
                                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                                        Text(flag.key, style = MaterialTheme.typography.bodyMedium)
                                        Switch(
                                            checked = flag.enabled,
                                            onCheckedChange = { next ->
                                                scope.launch {
                                                    container.platformRepository.adminToggleFlag(flag.key, next).onSuccess {
                                                        loadDiagnosticsAndSecurity()
                                                    }
                                                }
                                            },
                                        )
                                    }
                                }
                            }
                        }
                    }
                }

                item { SectionHeader("Recent Users (${adminUsers.size})") }
                items(adminUsers, key = { "adm-u-${it.id}" }) { row ->
                    Surface(color = ImLivePalette.CardDark, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                        Row(
                            modifier = Modifier.padding(10.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text("@${row.username} (${row.email})", style = MaterialTheme.typography.bodyMedium)
                                Text(
                                    buildString {
                                        append(if (row.isAdmin) "admin" else "user")
                                        if (row.isStreamer) append(", streamer")
                                        if (row.isBanned) append(" · BANNED")
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                            TextButton(onClick = {
                                scope.launch {
                                    val res = if (row.isBanned) {
                                        container.platformRepository.adminUnbanUser(row.id)
                                    } else {
                                        container.platformRepository.adminBanUser(row.id, "Banned from Android Admin")
                                    }
                                    if (res.isSuccess) loadDiagnosticsAndSecurity()
                                }
                            }) {
                                Text(if (row.isBanned) "Unban" else "Ban")
                            }
                        }
                    }
                }
            }
        }
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

    if (showDeleteAccountDialog) {
        var confirmPassword by remember { mutableStateOf("") }
        AlertDialog(
            onDismissRequest = { showDeleteAccountDialog = false },
            title = { Text("Delete Account?") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("This schedules permanent deletion of your profile, streams, recordings, and tokens.")
                    OutlinedTextField(
                        value = confirmPassword,
                        onValueChange = { confirmPassword = it },
                        label = { Text("Confirm current password") },
                        visualTransformation = PasswordVisualTransformation(),
                        singleLine = true,
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                Button(
                    enabled = confirmPassword.length >= 8,
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    onClick = {
                        scope.launch {
                            container.authRepository.deleteAccount(confirmPassword, "DELETE").fold(
                                onSuccess = {
                                    showDeleteAccountDialog = false
                                    onSignedOut()
                                },
                                onFailure = { banner = it.message ?: "Could not delete account" },
                            )
                        }
                    },
                ) { Text("Delete Forever") }
            },
            dismissButton = { TextButton(onClick = { showDeleteAccountDialog = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun EmailAndPasswordSecurityCard(
    container: ImLiveContainer,
    isEmailVerified: Boolean,
    onFeedback: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var verifyToken by remember { mutableStateOf("") }
    var currentPass by remember { mutableStateOf("") }
    var nextPass by remember { mutableStateOf("") }

    Card(
        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Email & Password", style = MaterialTheme.typography.titleMedium)
                BadgePill(
                    if (isEmailVerified) "EMAIL VERIFIED" else "UNVERIFIED",
                    if (isEmailVerified) ImLivePalette.OnlineEmerald else ImLivePalette.WarningAmber,
                )
            }
            if (!isEmailVerified) {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedButton(onClick = {
                        scope.launch {
                            container.authRepository.resendVerification().onSuccess {
                                onFeedback("Verification email requested.")
                            }
                        }
                    }) { Text("Resend") }
                    OutlinedTextField(
                        value = verifyToken,
                        onValueChange = { verifyToken = it },
                        label = { Text("Verification token") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Button(
                        enabled = verifyToken.length >= 12,
                        onClick = {
                            scope.launch {
                                container.authRepository.verifyEmail(verifyToken).fold(
                                    onSuccess = { onFeedback("Email verified!") },
                                    onFailure = { onFeedback(it.message ?: "Verification failed") },
                                )
                            }
                        },
                    ) { Text("Verify") }
                }
            }

            OutlinedTextField(
                value = currentPass,
                onValueChange = { currentPass = it },
                label = { Text("Current password") },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = nextPass,
                onValueChange = { nextPass = it },
                label = { Text("New password (8+ chars)") },
                visualTransformation = PasswordVisualTransformation(),
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                enabled = currentPass.length >= 8 && nextPass.length >= 8,
                onClick = {
                    scope.launch {
                        container.authRepository.changePassword(currentPass, nextPass).fold(
                            onSuccess = {
                                currentPass = ""; nextPass = ""
                                onFeedback("Password updated.")
                            },
                            onFailure = { onFeedback(it.message ?: "Password change failed") },
                        )
                    }
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Change Password") }
        }
    }
}

@Composable
private fun DeveloperTokensAndWebhooksCard(
    container: ImLiveContainer,
    tokens: List<PersonalApiTokenItem>,
    webhooks: List<WebhookEndpointItem>,
    onReload: () -> Unit,
    onFeedback: (String) -> Unit,
) {
    val scope = rememberCoroutineScope()
    var tokenName by remember { mutableStateOf("") }
    var newlyMintedSecret by remember { mutableStateOf<String?>(null) }
    var webhookUrl by remember { mutableStateOf("") }

    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Card(colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark), modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Personal API Tokens (${tokens.size})", style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = tokenName,
                        onValueChange = { tokenName = it },
                        label = { Text("Token label (e.g. OBS / CLI)") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Button(
                        enabled = tokenName.trim().length >= 2,
                        onClick = {
                            scope.launch {
                                container.authRepository.createApiToken(tokenName.trim()).fold(
                                    onSuccess = { created ->
                                        tokenName = ""
                                        newlyMintedSecret = created.tokenPlaintext
                                        onReload()
                                    },
                                    onFailure = { onFeedback(it.message ?: "Token creation failed") },
                                )
                            }
                        },
                    ) { Text("Create") }
                }
                newlyMintedSecret?.let { raw ->
                    Text("Copy your new token now: $raw", color = ImLivePalette.OnlineEmerald, style = MaterialTheme.typography.bodyMedium)
                }
                tokens.forEach { tok ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text("${tok.name} (${tok.prefix}…)", style = MaterialTheme.typography.bodyMedium)
                        TextButton(onClick = {
                            scope.launch { container.authRepository.revokeApiToken(tok.id).onSuccess { onReload() } }
                        }) { Text("Revoke") }
                    }
                }
            }
        }

        Card(colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark), modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text("Outbound Event Webhooks (${webhooks.size})", style = MaterialTheme.typography.titleMedium)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                    OutlinedTextField(
                        value = webhookUrl,
                        onValueChange = { webhookUrl = it },
                        label = { Text("https://example.com/webhook") },
                        singleLine = true,
                        modifier = Modifier.weight(1f),
                    )
                    Button(
                        enabled = webhookUrl.startsWith("https://"),
                        onClick = {
                            scope.launch {
                                container.platformRepository.createWebhook(
                                    url = webhookUrl.trim(),
                                    events = listOf("stream.started", "stream.ended", "tip.received"),
                                ).fold(
                                    onSuccess = { created ->
                                        webhookUrl = ""
                                        onFeedback("Webhook added! Secret: ${created.secret}")
                                        onReload()
                                    },
                                    onFailure = { onFeedback(it.message ?: "Webhook error") },
                                )
                            }
                        },
                    ) { Text("Add") }
                }
                webhooks.forEach { wh ->
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                        Text(wh.url, style = MaterialTheme.typography.bodyMedium, modifier = Modifier.weight(1f))
                        Row {
                            TextButton(onClick = {
                                scope.launch {
                                    container.platformRepository.testWebhook(wh.id).onSuccess { ok ->
                                        onFeedback(if (ok) "Test webhook delivered!" else "Webhook returned non-2xx")
                                    }
                                }
                            }) { Text("Test") }
                            TextButton(onClick = {
                                scope.launch { container.platformRepository.deleteWebhook(wh.id).onSuccess { onReload() } }
                            }) { Text("Delete") }
                        }
                    }
                }
            }
        }
    }
}
