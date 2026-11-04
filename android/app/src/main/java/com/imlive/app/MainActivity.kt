package com.imlive.app

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Explore
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.VideoLibrary
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import com.imlive.app.media.LanRoomInfo
import com.imlive.app.model.LiveStream
import com.imlive.app.model.Recording
import com.imlive.app.network.DeepLinkDestination
import com.imlive.app.network.EndpointUrlRules
import com.imlive.app.ui.ImLiveContainer
import com.imlive.app.ui.screens.AuthScreen
import com.imlive.app.ui.screens.BroadcastScreen
import com.imlive.app.ui.screens.ExploreScreen
import com.imlive.app.ui.screens.HomeScreen
import com.imlive.app.ui.screens.LibraryAndScheduleScreen
import com.imlive.app.ui.screens.NotificationsScreen
import com.imlive.app.ui.screens.OfflineRoomsScreen
import com.imlive.app.ui.screens.ProfileAndCreatorScreen
import com.imlive.app.ui.screens.SettingsAndAdminScreen
import com.imlive.app.ui.theme.ImLivePalette
import com.imlive.app.ui.theme.ImLiveTheme
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.isActive

class MainActivity : ComponentActivity() {
    private val deepLinkFlow = MutableStateFlow<DeepLinkDestination?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        deepLinkFlow.value = EndpointUrlRules.parseDeepLink(intent?.data?.toString())
        setContent {
            val incomingLink by deepLinkFlow.collectAsState()
            ImLiveRootApp(
                incomingDeepLink = incomingLink,
                onDeepLinkConsumed = { deepLinkFlow.value = null },
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        EndpointUrlRules.parseDeepLink(intent.data?.toString())?.let { parsed ->
            deepLinkFlow.value = parsed
        }
    }
}

private enum class PrimaryTab { HOME, EXPLORE, STUDIO, LIBRARY, PROFILE }

private sealed interface OverlayRoute {
    data object Auth : OverlayRoute
    data class Watch(val stream: LiveStream) : OverlayRoute
    data class OfflineRooms(val initialLan: LanRoomInfo? = null) : OverlayRoute
    data class CreatorProfile(val username: String) : OverlayRoute
    data object Notifications : OverlayRoute
    data object Settings : OverlayRoute
}

@Composable
private fun ImLiveRootApp(
    incomingDeepLink: DeepLinkDestination?,
    onDeepLinkConsumed: () -> Unit,
) {
    val context = LocalContext.current
    val container = remember { ImLiveContainer.get(context) }
    val prefs by container.preferences.settings.collectAsState()
    val currentUser by container.authRepository.currentUser.collectAsState()

    var activeTab by remember { mutableStateOf(PrimaryTab.HOME) }
    var overlay by remember {
        mutableStateOf<OverlayRoute?>(if (container.authRepository.loggedIn()) null else OverlayRoute.Auth)
    }
    var studioLanPreselect by remember { mutableStateOf(false) }
    var studioPreparedStreamId by remember { mutableStateOf<String?>(null) }
    var selectedLibraryRecording by remember { mutableStateOf<Recording?>(null) }
    var unreadNotifications by remember { mutableIntStateOf(0) }

    LaunchedEffect(currentUser?.id) {
        if (container.authRepository.loggedIn()) {
            container.authRepository.me()
            while (isActive && container.authRepository.loggedIn()) {
                container.platformRepository.unreadNotificationCount().onSuccess { unread ->
                    unreadNotifications = unread
                }
                delay(45_000L)
            }
        } else {
            unreadNotifications = 0
        }
    }

    LaunchedEffect(incomingDeepLink) {
        val link = incomingDeepLink ?: return@LaunchedEffect
        when (link) {
            is DeepLinkDestination.Watch -> {
                container.liveRepository.stream(link.streamId).onSuccess { loaded ->
                    overlay = OverlayRoute.Watch(loaded)
                }.onFailure {
                    overlay = OverlayRoute.Watch(
                        LiveStream(id = link.streamId, title = "Live Stream", isLive = true),
                    )
                }
            }
            is DeepLinkDestination.Profile -> {
                overlay = OverlayRoute.CreatorProfile(link.username)
            }
            is DeepLinkDestination.Broadcast -> {
                overlay = null
                studioLanPreselect = false
                activeTab = PrimaryTab.STUDIO
            }
            is DeepLinkDestination.OfflineRooms -> {
                overlay = OverlayRoute.OfflineRooms(null)
            }
            is DeepLinkDestination.JoinLan -> {
                overlay = OverlayRoute.OfflineRooms(link.room)
            }
            is DeepLinkDestination.LibraryRecording -> {
                val recId = link.recordingId
                if (!recId.isNullOrBlank()) {
                    container.platformRepository.recording(recId).onSuccess { rec ->
                        selectedLibraryRecording = rec
                    }
                }
                overlay = null
                activeTab = PrimaryTab.LIBRARY
            }
            is DeepLinkDestination.Schedule -> {
                overlay = null
                activeTab = PrimaryTab.LIBRARY
            }
            is DeepLinkDestination.ResetPassword,
            is DeepLinkDestination.VerifyEmail -> {
                overlay = OverlayRoute.Auth
            }
        }
        onDeepLinkConsumed()
    }

    ImLiveTheme(accent = prefs.accentTheme) {
        Surface(modifier = Modifier.fillMaxSize(), color = ImLivePalette.Obsidian) {
            when (val currentOverlay = overlay) {
                is OverlayRoute.Auth -> AuthScreen(
                    container = container,
                    onAuthenticated = { overlay = null },
                    onContinueAsGuest = { overlay = null; activeTab = PrimaryTab.HOME },
                    onOpenOfflineRooms = { overlay = OverlayRoute.OfflineRooms(null) },
                    onStartOfflineLanBroadcast = {
                        overlay = null
                        studioLanPreselect = true
                        activeTab = PrimaryTab.STUDIO
                    },
                )

                is OverlayRoute.Watch -> WatchScreen(
                    container = container,
                    initialStream = currentOverlay.stream,
                    onBack = { overlay = null },
                    onOpenCreatorProfile = { username -> overlay = OverlayRoute.CreatorProfile(username) },
                    onRequireSignIn = { overlay = OverlayRoute.Auth },
                )

                is OverlayRoute.OfflineRooms -> OfflineRoomsScreen(
                    container = container,
                    initialLanRoom = currentOverlay.initialLan,
                    onBack = { overlay = null },
                    onStartHostingLan = {
                        overlay = null
                        studioLanPreselect = true
                        activeTab = PrimaryTab.STUDIO
                    },
                )

                is OverlayRoute.CreatorProfile -> ProfileAndCreatorScreen(
                    container = container,
                    viewingUsername = currentOverlay.username,
                    onBack = { overlay = null },
                    onWatchStream = { s -> overlay = OverlayRoute.Watch(s) },
                    onOpenRecording = { r ->
                        selectedLibraryRecording = r
                        overlay = null
                        activeTab = PrimaryTab.LIBRARY
                    },
                    onOpenCreator = { u -> overlay = OverlayRoute.CreatorProfile(u) },
                    onOpenNotifications = { overlay = OverlayRoute.Notifications },
                    onOpenSettings = { overlay = OverlayRoute.Settings },
                    onRequireSignIn = { overlay = OverlayRoute.Auth },
                )

                is OverlayRoute.Notifications -> NotificationsScreen(
                    container = container,
                    onBack = { overlay = null },
                    onUnreadChanged = { unreadNotifications = it },
                )

                is OverlayRoute.Settings -> SettingsAndAdminScreen(
                    container = container,
                    onBack = { overlay = null },
                    onSignedOut = { overlay = OverlayRoute.Auth },
                )

                null -> Scaffold(
                    containerColor = ImLivePalette.Obsidian,
                    bottomBar = {
                        NavigationBar(containerColor = ImLivePalette.SurfaceDark) {
                            NavigationBarItem(
                                selected = activeTab == PrimaryTab.HOME,
                                onClick = { activeTab = PrimaryTab.HOME },
                                icon = { Icon(Icons.Default.Home, contentDescription = "Home") },
                                label = { Text("Home") },
                            )
                            NavigationBarItem(
                                selected = activeTab == PrimaryTab.EXPLORE,
                                onClick = { activeTab = PrimaryTab.EXPLORE },
                                icon = { Icon(Icons.Default.Explore, contentDescription = "Explore") },
                                label = { Text("Explore") },
                            )
                            NavigationBarItem(
                                selected = activeTab == PrimaryTab.STUDIO,
                                onClick = {
                                    studioLanPreselect = false
                                    activeTab = PrimaryTab.STUDIO
                                },
                                icon = { Icon(Icons.Default.Videocam, contentDescription = "Go Live") },
                                label = { Text("Go Live") },
                            )
                            NavigationBarItem(
                                selected = activeTab == PrimaryTab.LIBRARY,
                                onClick = { activeTab = PrimaryTab.LIBRARY },
                                icon = { Icon(Icons.Default.VideoLibrary, contentDescription = "Library") },
                                label = { Text("Library") },
                            )
                            NavigationBarItem(
                                selected = activeTab == PrimaryTab.PROFILE,
                                onClick = { activeTab = PrimaryTab.PROFILE },
                                icon = { Icon(Icons.Default.Person, contentDescription = "You") },
                                label = { Text("You") },
                            )
                        }
                    },
                ) { innerPadding ->
                    Box(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
                        when (activeTab) {
                            PrimaryTab.HOME -> HomeScreen(
                                container = container,
                                unreadNotifications = unreadNotifications,
                                onWatchStream = { s -> overlay = OverlayRoute.Watch(s) },
                                onOpenBroadcastStudio = {
                                    studioLanPreselect = false
                                    activeTab = PrimaryTab.STUDIO
                                },
                                onOpenOfflineRooms = { overlay = OverlayRoute.OfflineRooms(null) },
                                onOpenExplore = { activeTab = PrimaryTab.EXPLORE },
                                onOpenLibrary = { rec ->
                                    selectedLibraryRecording = rec
                                    activeTab = PrimaryTab.LIBRARY
                                },
                                onOpenCreatorProfile = { username -> overlay = OverlayRoute.CreatorProfile(username) },
                                onOpenNotifications = { overlay = OverlayRoute.Notifications },
                                onOpenSignIn = { overlay = OverlayRoute.Auth },
                            )

                            PrimaryTab.EXPLORE -> ExploreScreen(
                                container = container,
                                onWatchStream = { s -> overlay = OverlayRoute.Watch(s) },
                                onOpenRecording = { rec ->
                                    selectedLibraryRecording = rec
                                    activeTab = PrimaryTab.LIBRARY
                                },
                                onOpenCreator = { username -> overlay = OverlayRoute.CreatorProfile(username) },
                            )

                            PrimaryTab.STUDIO -> BroadcastScreen(
                                container = container,
                                initialLanOnly = studioLanPreselect,
                                preparedStreamId = studioPreparedStreamId,
                                onRequireSignIn = { overlay = OverlayRoute.Auth },
                            )

                            PrimaryTab.LIBRARY -> LibraryAndScheduleScreen(
                                container = container,
                                initialRecording = selectedLibraryRecording,
                                onGoLiveFromSchedule = { streamId ->
                                    studioPreparedStreamId = streamId
                                    studioLanPreselect = false
                                    activeTab = PrimaryTab.STUDIO
                                },
                                onRequireSignIn = { overlay = OverlayRoute.Auth },
                            )

                            PrimaryTab.PROFILE -> ProfileAndCreatorScreen(
                                container = container,
                                viewingUsername = null,
                                onBack = null,
                                onWatchStream = { s -> overlay = OverlayRoute.Watch(s) },
                                onOpenRecording = { rec ->
                                    selectedLibraryRecording = rec
                                    activeTab = PrimaryTab.LIBRARY
                                },
                                onOpenCreator = { username -> overlay = OverlayRoute.CreatorProfile(username) },
                                onOpenNotifications = { overlay = OverlayRoute.Notifications },
                                onOpenSettings = { overlay = OverlayRoute.Settings },
                                onRequireSignIn = { overlay = OverlayRoute.Auth },
                            )
                        }
                    }
                }
            }
        }
    }
}
