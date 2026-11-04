package com.imlive.app.ui.screens

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.imlive.app.model.CategoryItem
import com.imlive.app.model.CreatorSummary
import com.imlive.app.model.LiveStream
import com.imlive.app.model.Recording
import com.imlive.app.model.UnifiedSearchResults
import com.imlive.app.ui.ImLiveContainer
import com.imlive.app.ui.components.AvatarCircle
import com.imlive.app.ui.components.BadgePill
import com.imlive.app.ui.components.RecordingFeedCard
import com.imlive.app.ui.components.SectionHeader
import com.imlive.app.ui.components.StreamFeedCard
import com.imlive.app.ui.theme.ImLivePalette
import kotlinx.coroutines.delay

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ExploreScreen(
    container: ImLiveContainer,
    onWatchStream: (LiveStream) -> Unit,
    onOpenRecording: (Recording) -> Unit,
    onOpenCreator: (String) -> Unit,
) {
    val apiBase by container.endpointStore.apiBaseUrlFlow.collectAsState()

    var query by remember { mutableStateOf("") }
    var selectedCategory by remember { mutableStateOf<String?>(null) }
    var activeSection by remember { mutableStateOf("all") } // all | streams | creators | vods
    var categories by remember { mutableStateOf<List<CategoryItem>>(emptyList()) }
    var browseStreams by remember { mutableStateOf<List<LiveStream>>(emptyList()) }
    var browseCreators by remember { mutableStateOf<List<CreatorSummary>>(emptyList()) }
    var browseRecordings by remember { mutableStateOf<List<Recording>>(emptyList()) }
    var searchResults by remember { mutableStateOf<UnifiedSearchResults?>(null) }
    var loading by remember { mutableStateOf(true) }

    LaunchedEffect(apiBase, selectedCategory) {
        loading = true
        container.liveRepository.categories().onSuccess { categories = it }
        container.liveRepository.browseStreams(status = "live", category = selectedCategory, sort = "viewers")
            .onSuccess { browseStreams = it }
        container.liveRepository.trending().onSuccess { browseCreators = it.creators }
        container.platformRepository.publicRecordings().onSuccess { browseRecordings = it }
        loading = false
    }

    LaunchedEffect(query) {
        val trimmed = query.trim()
        if (trimmed.length < 2) {
            searchResults = null
            return@LaunchedEffect
        }
        delay(280L)
        container.liveRepository.search(trimmed).onSuccess { searchResults = it }
    }

    val showingStreams = searchResults?.streams ?: browseStreams
    val showingCreators = searchResults?.creators ?: browseCreators
    val showingRecordings = searchResults?.recordings ?: browseRecordings

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Text("Explore & Search", style = MaterialTheme.typography.headlineLarge)
            Text(
                "Find live broadcasts, categories, creators, and recorded clips.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }

        item {
            OutlinedTextField(
                value = query,
                onValueChange = { query = it },
                placeholder = { Text("Search streams, @creators, tags, replays…") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (query.isNotEmpty()) {
                        IconButton(onClick = { query = "" }) {
                            Icon(Icons.Default.Clear, contentDescription = "Clear search")
                        }
                    }
                },
                singleLine = true,
                modifier = Modifier.fillMaxWidth(),
            )
        }

        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = activeSection == "all", onClick = { activeSection = "all" }, label = { Text("All") })
                FilterChip(selected = activeSection == "streams", onClick = { activeSection = "streams" }, label = { Text("Live (${showingStreams.size})") })
                FilterChip(selected = activeSection == "creators", onClick = { activeSection = "creators" }, label = { Text("Creators (${showingCreators.size})") })
                FilterChip(selected = activeSection == "vods", onClick = { activeSection = "vods" }, label = { Text("VODs (${showingRecordings.size})") })
            }
        }

        if (categories.isNotEmpty() && query.isBlank()) {
            item {
                SectionHeader(
                    title = "Categories",
                    actionLabel = if (selectedCategory != null) "Clear filter" else null,
                    onAction = { selectedCategory = null },
                )
                FlowRow(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                    modifier = Modifier.padding(top = 8.dp),
                ) {
                    categories.forEach { cat ->
                        val active = selectedCategory.equals(cat.name, ignoreCase = true)
                        FilterChip(
                            selected = active,
                            onClick = { selectedCategory = if (active) null else cat.name },
                            label = {
                                Text(
                                    if (cat.liveStreams > 0) "${cat.name} · ${cat.liveStreams}"
                                    else cat.name,
                                )
                            },
                        )
                    }
                }
            }
        }

        if (loading && showingStreams.isEmpty() && showingCreators.isEmpty()) {
            item {
                Row(Modifier.fillMaxWidth().padding(24.dp), horizontalArrangement = Arrangement.Center) {
                    CircularProgressIndicator()
                }
            }
        }

        if (activeSection == "all" || activeSection == "creators") {
            if (showingCreators.isNotEmpty()) {
                item { SectionHeader("Creators") }
                items(showingCreators.take(if (activeSection == "all") 5 else 30), key = { "cr-${it.id}" }) { creator ->
                    Surface(
                        color = ImLivePalette.CardDark,
                        border = BorderStroke(1.dp, ImLivePalette.BorderSubtle),
                        shape = RoundedCornerShape(14.dp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { onOpenCreator(creator.username) },
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            AvatarCircle(
                                name = creator.bestName,
                                avatarUrl = creator.avatarUrl,
                                apiBaseUrl = apiBase,
                                size = 44.dp,
                                isLive = creator.isLive,
                            )
                            Spacer(Modifier.width(12.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(creator.bestName, style = MaterialTheme.typography.titleMedium)
                                    if (creator.isLive) BadgePill("LIVE", ImLivePalette.LiveRose)
                                }
                                Text(
                                    "@${creator.username} · ${creator.followerCount} followers",
                                    style = MaterialTheme.typography.bodyMedium,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                )
                            }
                        }
                    }
                }
            }
        }

        if (activeSection == "all" || activeSection == "streams") {
            item { SectionHeader("Live Broadcasts") }
            if (showingStreams.isEmpty()) {
                item {
                    Text(
                        "No matching live broadcasts right now.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            } else {
                items(showingStreams, key = { "st-${it.id}" }) { stream ->
                    StreamFeedCard(
                        stream = stream,
                        apiBaseUrl = apiBase,
                        onClick = { onWatchStream(stream) },
                        onCreatorClick = onOpenCreator,
                    )
                }
            }
        }

        if (activeSection == "all" || activeSection == "vods") {
            if (showingRecordings.isNotEmpty()) {
                item { SectionHeader("Replays & Clips") }
                items(showingRecordings.take(if (activeSection == "all") 6 else 40), key = { "vod-${it.id}" }) { rec ->
                    RecordingFeedCard(
                        recording = rec,
                        apiBaseUrl = apiBase,
                        onClick = { onOpenRecording(rec) },
                    )
                }
            }
        }
    }
}
