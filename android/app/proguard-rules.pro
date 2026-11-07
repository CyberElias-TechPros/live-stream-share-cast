# Keep WebRTC JNI entry points and JSON DTOs available to the native media stack.
-keep class org.webrtc.** { *; }
-keep class io.getstream.** { *; }
-keep class org.json.** { *; }

# Keep AndroidX Media3 ExoPlayer reflective/JNI surfaces safe under R8 shrinking.
-keep class androidx.media3.** { *; }
-dontwarn androidx.media3.**

# Keep application models & contracts intact.
-keep class com.imlive.app.model.** { *; }
-keep class com.imlive.app.media.LanSignallingContract { *; }

# The maintained WebRTC distribution reaches a few classes reflectively and
# through native JNI registration. These references are optional at runtime on
# some Android variants; do not make R8 turn them into a release failure.
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}
-dontwarn org.webrtc.**
-dontwarn io.getstream.**
-dontwarn javax.annotation.**
-dontwarn com.google.crypto.tink.**
-dontwarn okhttp3.**
-dontwarn okio.**
