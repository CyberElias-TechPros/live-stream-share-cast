package com.imlive.app.ui.screens

import android.net.Uri
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.PhotoCamera
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
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
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.imlive.app.model.ChatRules
import com.imlive.app.model.CreatorAnalyticsOverview
import com.imlive.app.model.CreatorEarningsInfo
import com.imlive.app.model.LiveStream
import com.imlive.app.model.ModerationReportItem
import com.imlive.app.model.ProfileDetail
import com.imlive.app.model.Recording
import com.imlive.app.model.StreamRestrictionItem
import com.imlive.app.model.UserProfile
import com.imlive.app.ui.ImLiveContainer
import com.imlive.app.ui.components.AvatarCircle
import com.imlive.app.ui.components.BadgePill
import com.imlive.app.ui.components.RecordingFeedCard
import com.imlive.app.ui.components.SectionHeader
import com.imlive.app.ui.components.StatMetricTile
import com.imlive.app.ui.components.StreamFeedCard
import com.imlive.app.ui.theme.ImLivePalette
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ProfileAndCreatorScreen(
    container: ImLiveContainer,
    viewingUsername: String? = null,
    onBack: (() -> Unit)? = null,
    onWatchStream: (LiveStream) -> Unit,
    onOpenRecording: (Recording) -> Unit,
    onOpenCreator: (String) -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenSettings: () -> Unit,
    onRequireSignIn: () -> Unit,
) {
    if (onBack != null) BackHandler(onBack = onBack)

    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val apiBase by container.endpointStore.apiBaseUrlFlow.collectAsState()
    val currentUser by container.authRepository.currentUser.collectAsState()

    val targetUsername = viewingUsername ?: currentUser?.username

    if (targetUsername == null) {
        Column(
            modifier = Modifier.fillMaxSize().padding(24.dp),
            verticalArrangement = Arrangement.Center,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Text("Creator Hub & Profile", style = MaterialTheme.typography.headlineMedium)
            Spacer(Modifier.height(8.dp))
            Text(
                "Sign in to customize your channel, manage chat moderation rules, view creator analytics, or configure settings.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            Spacer(Modifier.height(16.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Button(onClick = onRequireSignIn) { Text("Sign in / Create Account") }
                OutlinedButton(onClick = onOpenSettings) { Text("App Settings") }
            }
        }
        return
    }

    val isSelf = currentUser?.username?.equals(targetUsername, ignoreCase = true) == true
    var tab by remember(isSelf) { mutableStateOf("channel") } // channel | analytics | moderation | connections
    var detail by remember { mutableStateOf<ProfileDetail?>(null) }
    var followers by remember { mutableStateOf<List<UserProfile>>(emptyList()) }
    var following by remember { mutableStateOf<List<UserProfile>>(emptyList()) }

    var analyticsDays by remember { mutableStateOf(30) }
    var analytics by remember { mutableStateOf<CreatorAnalyticsOverview?>(null) }
    var earnings by remember { mutableStateOf<CreatorEarningsInfo?>(null) }

    var chatRules by remember { mutableStateOf(ChatRules()) }
    var restrictions by remember { mutableStateOf<List<StreamRestrictionItem>>(emptyList()) }
    var blockedUsers by remember { mutableStateOf<List<UserProfile>>(emptyList()) }
    var modReports by remember { mutableStateOf<List<ModerationReportItem>>(emptyList()) }

    var showEditProfileDialog by remember { mutableStateOf(false) }
    var statusBanner by remember { mutableStateOf<String?>(null) }

    suspend fun loadProfile() {
        container.platformRepository.profile(targetUsername).onSuccess { loaded ->
            detail = loaded
            container.platformRepository.followers(loaded.profile.id).onSuccess { followers = it }
            container.platformRepository.following(loaded.profile.id).onSuccess { following = it }
        }
        if (isSelf) {
            container.platformRepository.creatorAnalytics(analyticsDays).onSuccess { analytics = it }
            container.platformRepository.creatorEarnings().onSuccess { earnings = it }
            container.platformRepository.chatRules().onSuccess { chatRules = it }
            container.platformRepository.restrictions().onSuccess { restrictions = it }
            container.platformRepository.blockedUsers().onSuccess { blockedUsers = it }
            if (currentUser?.isModeratorOrAdmin == true) {
                container.platformRepository.moderationReports("open").onSuccess { modReports = it }
            }
        }
    }

    LaunchedEffect(targetUsername, analyticsDays, currentUser?.id) {
        loadProfile()
    }

    val avatarPicker = rememberLauncherForActivityResult(ActivityResultContracts.GetContent()) { uri: Uri? ->
        if (uri == null) return@rememberLauncherForActivityResult
        scope.launch {
            val res = withContext(Dispatchers.IO) {
                runCatching {
                    val mime = context.contentResolver.getType(uri) ?: "image/jpeg"
                    val bytes = context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
                        ?: error("Could not read image")
                    val ext = if (mime.contains("png")) "png" else "jpg"
                    container.platformRepository.uploadAvatarBytes(bytes, "avatar.$ext", mime).getOrThrow()
                }
            }
            res.fold(
                onSuccess = {
                    container.authRepository.me()
                    loadProfile()
                    statusBanner = "Avatar updated!"
                },
                onFailure = { statusBanner = it.message ?: "Avatar upload failed" },
            )
        }
    }

    val prof = detail?.profile

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (onBack != null) {
                        IconButton(onClick = onBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                    Text(
                        if (isSelf) "Your Channel & Studio" else "@$targetUsername",
                        style = MaterialTheme.typography.headlineMedium,
                    )
                }
                if (isSelf) {
                    Row {
                        IconButton(onClick = onOpenNotifications) {
                            Icon(Icons.Default.Notifications, contentDescription = "Notifications")
                        }
                        IconButton(onClick = onOpenSettings) {
                            Icon(Icons.Default.Settings, contentDescription = "Settings & Security")
                        }
                    }
                }
            }
        }

        statusBanner?.let { msg ->
            item {
                Surface(color = ImLivePalette.CardElevated, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                    Text(msg, modifier = Modifier.padding(10.dp), style = MaterialTheme.typography.bodyMedium)
                }
            }
        }

        // Channel Header Card
        if (prof != null) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                    border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            AvatarCircle(
                                name = prof.bestName,
                                avatarUrl = prof.avatarUrl,
                                apiBaseUrl = apiBase,
                                size = 64.dp,
                                isLive = detail?.liveStream != null,
                            )
                            Spacer(Modifier.width(14.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(prof.bestName, style = MaterialTheme.typography.titleLarge)
                                    if (prof.isVerified) BadgePill("VERIFIED", ImLivePalette.OnlineEmerald)
                                }
                                Text("@${prof.username}", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                Text(
                                    "${detail?.followerCount ?: prof.followerCount} followers · ${detail?.followingCount ?: prof.followingCount} following",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }

                        prof.bio?.takeIf(String::isNotBlank)?.let {
                            Text(it, style = MaterialTheme.typography.bodyLarge)
                        }
                        prof.websiteUrl?.takeIf(String::isNotBlank)?.let {
                            Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.primary)
                        }

                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            if (isSelf) {
                                OutlinedButton(onClick = { showEditProfileDialog = true }) {
                                    Icon(Icons.Default.Edit, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Edit Profile")
                                }
                                OutlinedButton(onClick = { avatarPicker.launch("image/*") }) {
                                    Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(Modifier.width(6.dp))
                                    Text("Avatar")
                                }
                            } else if (currentUser != null) {
                                val followingNow = detail?.isFollowing == true
                                Button(onClick = {
                                    scope.launch {
                                        val r = if (followingNow) container.platformRepository.unfollowUser(prof.id)
                                        else container.platformRepository.followUser(prof.id)
                                        if (r.isSuccess) loadProfile()
                                    }
                                }) {
                                    Text(if (followingNow) "Following" else "Follow")
                                }
                                val blockedNow = detail?.isBlocked == true
                                OutlinedButton(onClick = {
                                    scope.launch {
                                        if (blockedNow) container.platformRepository.unblockUser(prof.id)
                                        else container.platformRepository.blockUser(prof.id)
                                        loadProfile()
                                    }
                                }) {
                                    Text(if (blockedNow) "Unblock" else "Block")
                                }
                            }
                        }
                    }
                }
            }
        }

        item {
            FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = tab == "channel", onClick = { tab = "channel" }, label = { Text("Channel") })
                FilterChip(selected = tab == "connections", onClick = { tab = "connections" }, label = { Text("Followers (${followers.size})") })
                if (isSelf) {
                    FilterChip(selected = tab == "analytics", onClick = { tab = "analytics" }, label = { Text("Analytics & Earnings") })
                    FilterChip(selected = tab == "moderation", onClick = { tab = "moderation" }, label = { Text("Safety & Chat Rules") })
                }
            }
        }

        when (tab) {
            "channel" -> {
                detail?.liveStream?.let { live ->
                    item {
                        SectionHeader("Live Right Now")
                        Spacer(Modifier.height(6.dp))
                        StreamFeedCard(stream = live, apiBaseUrl = apiBase, onClick = { onWatchStream(live) })
                    }
                }
                val recs = detail?.recordings.orEmpty()
                item { SectionHeader("Published Replays & Clips (${recs.size})") }
                if (recs.isEmpty()) {
                    item {
                        Text("No public recordings yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                } else {
                    items(recs, key = { "prof-rec-${it.id}" }) { rec ->
                        RecordingFeedCard(recording = rec, apiBaseUrl = apiBase, onClick = { onOpenRecording(rec) })
                    }
                }
            }

            "connections" -> {
                item { SectionHeader("Followers (${followers.size})") }
                items(followers, key = { "flw-${it.id}" }) { u ->
                    Surface(
                        color = ImLivePalette.CardDark,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth().clickable { onOpenCreator(u.username) },
                    ) {
                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            AvatarCircle(name = u.bestName, avatarUrl = u.avatarUrl, apiBaseUrl = apiBase, size = 38.dp)
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(u.bestName, style = MaterialTheme.typography.titleMedium)
                                Text("@${u.username}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
                item { SectionHeader("Following (${following.size})") }
                items(following, key = { "ing-${it.id}" }) { u ->
                    Surface(
                        color = ImLivePalette.CardDark,
                        shape = RoundedCornerShape(12.dp),
                        modifier = Modifier.fillMaxWidth().clickable { onOpenCreator(u.username) },
                    ) {
                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                            AvatarCircle(name = u.bestName, avatarUrl = u.avatarUrl, apiBaseUrl = apiBase, size = 38.dp)
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(u.bestName, style = MaterialTheme.typography.titleMedium)
                                Text("@${u.username}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            }
                        }
                    }
                }
            }

            "analytics" -> {
                item {
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        listOf(7, 30, 90).forEach { d ->
                            FilterChip(selected = analyticsDays == d, onClick = { analyticsDays = d }, label = { Text("${d}d") })
                        }
                    }
                }
                analytics?.let { a ->
                    item {
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            StatMetricTile("Broadcasts", "${a.totalStreams}", "Last ${a.days} days", Modifier.weight(1f))
                            StatMetricTile("Live Minutes", "${a.liveMinutes}", "On-air time", Modifier.weight(1f))
                        }
                        Spacer(Modifier.height(10.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                            StatMetricTile("Watch Minutes", "${a.watchMinutes}", "${a.uniqueViewers} viewers", Modifier.weight(1f))
                            StatMetricTile("VOD Views", "${a.vodViews}", "${a.totalRecordings} replays", Modifier.weight(1f))
                        }
                    }
                }
                earnings?.let { e ->
                    item {
                        Card(
                            colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                            border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("Creator Tips & Earnings", style = MaterialTheme.typography.titleMedium)
                                val netUsd = "%.2f".format(e.totalNetCents / 100.0)
                                val grossUsd = "%.2f".format(e.totalGrossCents / 100.0)
                                Text("Net Earned: $$netUsd  (Gross $$grossUsd across ${e.tipCount} tips)", style = MaterialTheme.typography.bodyLarge, color = ImLivePalette.OnlineEmerald)
                            }
                        }
                    }
                }
            }

            "moderation" -> {
                item {
                    ChatRulesCard(
                        initial = chatRules,
                        onSave = { updated ->
                            scope.launch {
                                container.platformRepository.updateChatRules(updated).onSuccess {
                                    chatRules = it
                                    statusBanner = "Chat moderation rules saved!"
                                }
                            }
                        },
                    )
                }

                item {
                    ViewerRestrictionsCard(
                        restrictions = restrictions,
                        onAdd = { username, kind ->
                            scope.launch {
                                container.platformRepository.addRestriction(username, kind).onSuccess { loadProfile() }
                            }
                        },
                        onRemove = { id ->
                            scope.launch {
                                container.platformRepository.removeRestriction(id).onSuccess { loadProfile() }
                            }
                        },
                    )
                }

                if (blockedUsers.isNotEmpty()) {
                    item { SectionHeader("Blocked Users (${blockedUsers.size})") }
                    items(blockedUsers, key = { "blk-${it.id}" }) { u ->
                        Surface(color = ImLivePalette.CardDark, shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth()) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                Text("@${u.username}")
                                TextButton(onClick = {
                                    scope.launch {
                                        container.platformRepository.unblockUser(u.id).onSuccess { loadProfile() }
                                    }
                                }) { Text("Unblock") }
                            }
                        }
                    }
                }

                if (currentUser?.isModeratorOrAdmin == true) {
                    item { SectionHeader("Open Moderation Queue (${modReports.size})") }
                    items(modReports, key = { "rep-${it.id}" }) { rep ->
                        Card(colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark), modifier = Modifier.fillMaxWidth()) {
                            Column(modifier = Modifier.padding(12.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text("${rep.targetType.uppercase()} · ${rep.reason}", style = MaterialTheme.typography.titleMedium)
                                rep.details?.let { Text(it, style = MaterialTheme.typography.bodyMedium) }
                                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Button(onClick = {
                                        scope.launch {
                                            container.platformRepository.resolveModerationReport(rep.id, "resolved", "Reviewed on Android")
                                            loadProfile()
                                        }
                                    }) { Text("Resolve") }
                                    OutlinedButton(onClick = {
                                        scope.launch {
                                            container.platformRepository.resolveModerationReport(rep.id, "dismissed", "Dismissed")
                                            loadProfile()
                                        }
                                    }) { Text("Dismiss") }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showEditProfileDialog && prof != null) {
        var displayName by remember(prof.id) { mutableStateOf(prof.displayName ?: "") }
        var bio by remember(prof.id) { mutableStateOf(prof.bio ?: "") }
        var website by remember(prof.id) { mutableStateOf(prof.websiteUrl ?: "") }

        AlertDialog(
            onDismissRequest = { showEditProfileDialog = false },
            title = { Text("Edit Channel Profile") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    OutlinedTextField(value = displayName, onValueChange = { displayName = it }, label = { Text("Display name") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = bio, onValueChange = { bio = it }, label = { Text("Bio") }, modifier = Modifier.fillMaxWidth())
                    OutlinedTextField(value = website, onValueChange = { website = it }, label = { Text("Website URL (https://…)") }, singleLine = true, modifier = Modifier.fillMaxWidth())
                }
            },
            confirmButton = {
                Button(onClick = {
                    scope.launch {
                        container.platformRepository.updateProfile(displayName, bio, website).onSuccess {
                            showEditProfileDialog = false
                            container.authRepository.me()
                            loadProfile()
                        }
                    }
                }) { Text("Save") }
            },
            dismissButton = { TextButton(onClick = { showEditProfileDialog = false }) { Text("Cancel") } },
        )
    }
}

@Composable
private fun ChatRulesCard(initial: ChatRules, onSave: (ChatRules) -> Unit) {
    var slowSec by remember(initial) { mutableStateOf(initial.slowModeSeconds.toString()) }
    var followersOnly by remember(initial) { mutableStateOf(initial.followersOnly) }
    var linksAllowed by remember(initial) { mutableStateOf(initial.linksAllowed) }
    var bannedWordsText by remember(initial) { mutableStateOf(initial.bannedWords.joinToString(", ")) }

    Card(
        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Text("Channel Chat Rules", style = MaterialTheme.typography.titleMedium)
            OutlinedTextField(
                value = slowSec,
                onValueChange = { slowSec = it.filter(Char::isDigit) },
                label = { Text("Slow mode seconds (0 = off)") },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Followers-only chat")
                Switch(checked = followersOnly, onCheckedChange = { followersOnly = it })
            }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text("Allow URLs / links in chat")
                Switch(checked = linksAllowed, onCheckedChange = { linksAllowed = it })
            }
            OutlinedTextField(
                value = bannedWordsText,
                onValueChange = { bannedWordsText = it },
                label = { Text("Blocked words (comma separated)") },
                modifier = Modifier.fillMaxWidth(),
            )
            Button(
                onClick = {
                    onSave(
                        initial.copy(
                            slowModeSeconds = (slowSec.toIntOrNull() ?: 0).coerceIn(0, 600),
                            followersOnly = followersOnly,
                            linksAllowed = linksAllowed,
                            bannedWords = bannedWordsText.split(',').map { it.trim() }.filter { it.isNotBlank() },
                        ),
                    )
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text("Save Chat Rules") }
        }
    }
}

@Composable
private fun ViewerRestrictionsCard(
    restrictions: List<StreamRestrictionItem>,
    onAdd: (username: String, kind: String) -> Unit,
    onRemove: (String) -> Unit,
) {
    var targetUsername by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf("mute") }

    Card(
        colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("Channel Mutes & Bans (${restrictions.size})", style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = kind == "mute", onClick = { kind = "mute" }, label = { Text("Mute") })
                FilterChip(selected = kind == "ban", onClick = { kind = "ban" }, label = { Text("Ban") })
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                OutlinedTextField(
                    value = targetUsername,
                    onValueChange = { targetUsername = it },
                    label = { Text("Username") },
                    singleLine = true,
                    modifier = Modifier.weight(1f),
                )
                Button(
                    enabled = targetUsername.isNotBlank(),
                    onClick = {
                        onAdd(targetUsername.removePrefix("@").trim(), kind)
                        targetUsername = ""
                    },
                ) { Text("Apply") }
            }
            restrictions.forEach { item ->
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text("@${item.username ?: item.restrictedUserId} · ${item.restrictionType.uppercase()}", style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = { onRemove(item.id) }) { Text("Remove") }
                }
            }
        }
    }
}
