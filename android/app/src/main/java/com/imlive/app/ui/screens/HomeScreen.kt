package com.imlive.app.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Login
import androidx.compose.material.icons.filled.Notifications
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material.icons.filled.WifiTethering
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.imlive.app.model.CreatorSummary
import com.imlive.app.model.LiveStream
import com.imlive.app.model.Recording
import com.imlive.app.model.ScheduledBroadcast
import com.imlive.app.network.EndpointUrlRules
import com.imlive.app.ui.ImLiveContainer
import com.imlive.app.ui.components.AvatarCircle
import com.imlive.app.ui.components.LivePulseBadge
import com.imlive.app.ui.components.OfflineModeBanner
import com.imlive.app.ui.components.RecordingFeedCard
import com.imlive.app.ui.components.SectionHeader
import com.imlive.app.ui.components.StreamFeedCard
import com.imlive.app.ui.components.formatDurationClock
import com.imlive.app.ui.components.sharePlainText
import com.imlive.app.ui.theme.ImLivePalette
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

@Composable
fun HomeScreen(
    container: ImLiveContainer,
    unreadNotifications: Int,
    onWatchStream: (LiveStream) -> Unit,
    onOpenBroadcastStudio: () -> Unit,
    onOpenOfflineRooms: () -> Unit,
    onOpenExplore: () -> Unit,
    onOpenLibrary: (Recording?) -> Unit,
    onOpenCreatorProfile: (String) -> Unit,
    onOpenNotifications: () -> Unit,
    onOpenSignIn: () -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val apiBase by container.endpointStore.apiBaseUrlFlow.collectAsState()
    val netStatus by container.networkMonitor.status.collectAsState()
    val studioState by container.broadcastManager.state.collectAsState()
    val currentUser by container.authRepository.currentUser.collectAsState()

    var streams by remember { mutableStateOf<List<LiveStream>>(emptyList()) }
    var followingStreams by remember { mutableStateOf<List<LiveStream>>(emptyList()) }
    var trendingCreators by remember { mutableStateOf<List<CreatorSummary>>(emptyList()) }
    var upcoming by remember { mutableStateOf<List<ScheduledBroadcast>>(emptyList()) }
    var latestRecordings by remember { mutableStateOf<List<Recording>>(emptyList()) }
    var filterMode by remember { mutableStateOf("all") } // all | internet | local
    var loading by remember { mutableStateOf(true) }
    var errorText by remember { mutableStateOf<String?>(null) }

    suspend fun refreshFeed(silent: Boolean = false) {
        if (!silent) loading = true
        val liveDef = scope.async { container.liveRepository.liveStreams() }
        val trendDef = scope.async { container.liveRepository.trending() }
        val schedDef = scope.async { container.platformRepository.scheduledBroadcasts() }
        val recDef = scope.async { container.platformRepository.publicRecordings() }
        val followDef = if (currentUser != null) scope.async { container.liveRepository.followingStreams() } else null

        val liveRes = liveDef.await()
        liveRes.fold(
            onSuccess = {
                streams = it
                errorText = null
            },
            onFailure = { err ->
                if (!silent) errorText = err.message ?: "Could not load live streams"
            },
        )
        trendDef.await().onSuccess { trendingCreators = it.creators }
        schedDef.await().onSuccess { upcoming = it.take(4) }
        recDef.await().onSuccess { latestRecordings = it.take(4) }
        followDef?.await()?.onSuccess { followingStreams = it.filter { s -> s.isLive } }
        loading = false
    }

    LaunchedEffect(apiBase, currentUser?.id) {
        refreshFeed(silent = false)
        while (isActive) {
            delay(20_000L)
            if (netStatus.isOnline) refreshFeed(silent = true)
        }
    }

    val filteredStreams = remember(streams, filterMode) {
        when (filterMode) {
            "internet" -> streams.filter { it.streamType != "local" }
            "local" -> streams.filter { it.streamType == "local" }
            else -> streams
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 14.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Column {
                    Text("I'm Live", style = MaterialTheme.typography.headlineLarge)
                    Text(
                        if (currentUser != null) "Welcome back, ${currentUser?.bestName}"
                        else "Instant peer-to-peer live broadcasts",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(onClick = { scope.launch { refreshFeed(silent = false) } }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh feed")
                    }
                    if (currentUser != null) {
                        IconButton(onClick = onOpenNotifications) {
                            BadgedBox(
                                badge = {
                                    if (unreadNotifications > 0) {
                                        Badge { Text(unreadNotifications.coerceAtMost(99).toString()) }
                                    }
                                },
                            ) {
                                Icon(Icons.Default.Notifications, contentDescription = "Notifications")
                            }
                        }
                    } else {
                        OutlinedButton(onClick = onOpenSignIn) {
                            Icon(Icons.AutoMirrored.Filled.Login, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Sign in")
                        }
                    }
                }
            }
        }

        if (studioState.isLive) {
            item {
                Surface(
                    color = ImLivePalette.LiveRose.copy(alpha = 0.16f),
                    border = BorderStroke(1.dp, ImLivePalette.LiveRose),
                    shape = RoundedCornerShape(16.dp),
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(onClick = onOpenBroadcastStudio),
                ) {
                    Row(
                        modifier = Modifier.padding(14.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween,
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                            LivePulseBadge("ON AIR")
                            Spacer(Modifier.width(10.dp))
                            Column {
                                Text(
                                    studioState.activeStream?.title ?: studioState.lanRoom?.title ?: "Active Broadcast",
                                    style = MaterialTheme.typography.titleMedium,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                )
                                Text(
                                    "${formatDurationClock(studioState.elapsedSeconds)} · ${studioState.viewerCount} watching · Tap to open studio",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }

        item {
            OfflineModeBanner(isOnline = netStatus.isOnline, onOpenOfflineRooms = onOpenOfflineRooms)
        }

        item {
            Card(
                colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                shape = RoundedCornerShape(20.dp),
                modifier = Modifier.fillMaxWidth(),
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text("Broadcast or connect anywhere", style = MaterialTheme.typography.titleLarge)
                    Text(
                        "Go live globally with cloud WebRTC + TURN, or stream zero-data over local Wi-Fi / mobile hotspot.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.fillMaxWidth()) {
                        Button(onClick = onOpenBroadcastStudio, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Default.Videocam, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text(if (studioState.isLive) "Open Studio" else "Go Live")
                        }
                        OutlinedButton(onClick = onOpenOfflineRooms, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Default.WifiTethering, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(6.dp))
                            Text("Offline LAN")
                        }
                    }
                }
            }
        }

        if (followingStreams.isNotEmpty()) {
            item {
                SectionHeader("Following · Live Now")
                Spacer(Modifier.height(8.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(followingStreams, key = { "follow-${it.id}" }) { item ->
                        Surface(
                            color = ImLivePalette.CardDark,
                            border = BorderStroke(1.dp, MaterialTheme.colorScheme.primary.copy(alpha = 0.5f)),
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier
                                .width(220.dp)
                                .clickable { onWatchStream(item) },
                        ) {
                            Row(
                                modifier = Modifier.padding(10.dp),
                                verticalAlignment = Alignment.CenterVertically,
                            ) {
                                AvatarCircle(
                                    name = item.hostDisplay,
                                    avatarUrl = item.streamerAvatar,
                                    apiBaseUrl = apiBase,
                                    size = 38.dp,
                                    isLive = true,
                                )
                                Spacer(Modifier.width(10.dp))
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(item.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text("${item.hostDisplay} · ${item.viewerCount} watching", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                }
                            }
                        }
                    }
                }
            }
        }

        item {
            SectionHeader(
                title = "Live Now (${filteredStreams.size})",
                actionLabel = "Search & Categories",
                onAction = onOpenExplore,
            )
            Spacer(Modifier.height(8.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = filterMode == "all", onClick = { filterMode = "all" }, label = { Text("All Live") })
                FilterChip(selected = filterMode == "internet", onClick = { filterMode = "internet" }, label = { Text("Cloud Internet") })
                FilterChip(selected = filterMode == "local", onClick = { filterMode = "local" }, label = { Text("Same-Wi-Fi") })
            }
        }

        if (loading && streams.isEmpty()) {
            item {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp),
                    horizontalArrangement = Arrangement.Center,
                ) {
                    CircularProgressIndicator()
                }
            }
        }

        errorText?.let { msg ->
            item {
                Surface(
                    color = MaterialTheme.colorScheme.error.copy(alpha = 0.14f),
                    shape = RoundedCornerShape(12.dp),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(msg, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(12.dp))
                }
            }
        }

        if (!loading && filteredStreams.isEmpty()) {
            item {
                Card(
                    colors = CardDefaults.cardColors(containerColor = ImLivePalette.CardDark),
                    border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text("No broadcasts on air right now", style = MaterialTheme.typography.titleMedium)
                        Text(
                            "Start the first live broadcast from your phone camera, watch recent VOD replays below, or open an Offline Wi-Fi LAN room.",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }
        } else {
            items(filteredStreams, key = { it.id }) { stream ->
                val shareWebRoot = EndpointUrlRules.toOriginRootUrl(apiBase)
                StreamFeedCard(
                    stream = stream,
                    apiBaseUrl = apiBase,
                    onClick = { onWatchStream(stream) },
                    onCreatorClick = onOpenCreatorProfile,
                    onShare = {
                        sharePlainText(
                            context = context,
                            subject = "Watch ${stream.title} live on I'm Live",
                            text = "${stream.title} by ${stream.hostDisplay}\nApp deep link: imlive://watch/${stream.id}\nWeb: $shareWebRoot/watch/${stream.id}",
                        )
                    },
                )
            }
        }

        if (trendingCreators.isNotEmpty()) {
            item {
                SectionHeader("Creators to Discover", actionLabel = "Browse all", onAction = onOpenExplore)
                Spacer(Modifier.height(10.dp))
                LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(trendingCreators, key = { it.id }) { creator ->
                        Surface(
                            color = ImLivePalette.CardDark,
                            border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                            shape = RoundedCornerShape(16.dp),
                            modifier = Modifier
                                .width(150.dp)
                                .clickable { onOpenCreatorProfile(creator.username) },
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                AvatarCircle(
                                    name = creator.bestName,
                                    avatarUrl = creator.avatarUrl,
                                    apiBaseUrl = apiBase,
                                    size = 52.dp,
                                    isLive = creator.isLive,
                                )
                                Spacer(Modifier.height(8.dp))
                                Text(creator.bestName, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                Text("@${creator.username}", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                                Spacer(Modifier.height(4.dp))
                                Text("${creator.followerCount} followers", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.primary)
                            }
                        }
                    }
                }
            }
        }

        if (upcoming.isNotEmpty()) {
            item {
                SectionHeader("Upcoming Scheduled Streams", actionLabel = "Schedule", onAction = { onOpenLibrary(null) })
                Spacer(Modifier.height(8.dp))
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    upcoming.forEach { sched ->
                        Surface(
                            color = ImLivePalette.CardDark,
                            border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { onOpenLibrary(null) },
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.SpaceBetween,
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(sched.title, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                    Text(
                                        "${sched.displayName ?: sched.username ?: "Creator"} · ${sched.scheduledFor.replace('T', ' ').take(16)} UTC",
                                        style = MaterialTheme.typography.bodyMedium,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    )
                                }
                                Text(
                                    "${sched.reminderCount}提醒".replace("提醒", " reminders"),
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.primary,
                                )
                            }
                        }
                    }
                }
            }
        }

        if (latestRecordings.isNotEmpty()) {
            item {
                SectionHeader("Recent Replays & Clips", actionLabel = "Open VOD Library", onAction = { onOpenLibrary(null) })
            }
            items(latestRecordings, key = { "rec-${it.id}" }) { rec ->
                RecordingFeedCard(
                    recording = rec,
                    apiBaseUrl = apiBase,
                    onClick = { onOpenLibrary(rec) },
                )
            }
        }
    }
}
