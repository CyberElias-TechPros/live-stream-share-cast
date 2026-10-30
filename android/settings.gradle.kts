import org.gradle.api.initialization.resolve.RepositoriesMode

pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
        // The legacy org.webrtc AAR is published from this official WebRTC Maven repo.
        maven { url = uri("https://webrtc.github.io/maven") }
    }
}

rootProject.name = "im-live-android"
include(":app")
