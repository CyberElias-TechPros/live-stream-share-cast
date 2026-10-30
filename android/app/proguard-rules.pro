# Keep WebRTC JNI entry points and JSON DTOs available to the native media stack.
-keep class org.webrtc.** { *; }
-keep class io.getstream.** { *; }
-keep class org.json.** { *; }

# The maintained WebRTC distribution reaches a few classes reflectively and
# through native JNI registration. These references are optional at runtime on
# some Android variants; do not make R8 turn them into a release failure.
-keepclasseswithmembernames,includedescriptorclasses class * {
    native <methods>;
}
-dontwarn org.webrtc.**
-dontwarn io.getstream.**
-dontwarn javax.annotation.**
