#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT_DIR/android"
ASSET_DIR="$ANDROID_DIR/app/src/main/assets/www"

echo "Building the web game bundle..."
(
  cd "$ROOT_DIR"
  PORT="${PORT:-24083}" BASE_PATH="/" pnpm --filter @workspace/neon-open-world run build
)

echo "Copying the game into the Android asset bundle..."
rm -rf "$ASSET_DIR"
mkdir -p "$ASSET_DIR"
cp -R "$ROOT_DIR/dist/public/." "$ASSET_DIR/"

if [[ -z "${ANDROID_HOME:-}" && -z "${ANDROID_SDK_ROOT:-}" ]]; then
  cat <<'EOF'
Android SDK was not found in this environment.
The Android project is ready at artifacts/neon-open-world/android.
Open that folder in Android Studio and run:
  Build > Build Bundle(s) / APK(s) > Build APK(s)
EOF
  exit 2
fi

if ! command -v gradle >/dev/null 2>&1; then
  echo "Gradle was not found. Open artifacts/neon-open-world/android in Android Studio to build the APK."
  exit 2
fi

(
  cd "$ANDROID_DIR"
  gradle assembleDebug
)

echo "APK created at $ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"