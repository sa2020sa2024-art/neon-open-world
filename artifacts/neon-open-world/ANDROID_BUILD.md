# Neon Open World — Android APK

The Android wrapper in `android/` loads the production game bundle from
`android/app/src/main/assets/www/`. It runs in landscape fullscreen and keeps
the existing Three.js game, touch controls, audio, fleet selection, map,
vehicle entry/exit, and BOOST system.

## Build the APK

From the project root:

```bash
bash artifacts/neon-open-world/scripts/build-android-apk.sh
```

The script rebuilds the game and copies it into the Android asset bundle. If
Android SDK and Gradle are installed, it then creates:

```text
artifacts/neon-open-world/android/app/build/outputs/apk/debug/app-debug.apk
```

If the Replit environment reports that Android SDK is unavailable, open
`artifacts/neon-open-world/android/` in Android Studio and choose:

**Build → Build Bundle(s) / APK(s) → Build APK(s)**

The generated debug APK can be installed on an Android phone. For Google Play,
create a signed release build from Android Studio and use a unique signing
key.