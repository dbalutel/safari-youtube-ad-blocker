#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"
export DEVELOPER_DIR

if [ ! -d "$DEVELOPER_DIR" ]; then
  echo "Xcode not found at $DEVELOPER_DIR" >&2
  exit 1
fi

if command -v node >/dev/null 2>&1; then
  echo "Running tests..."
  node --test
else
  echo "Node not found; skipping tests."
fi

PROJECT="$ROOT/YouTube Ad Blocker/YouTube Ad Blocker.xcodeproj"
if [ ! -d "$PROJECT" ]; then
  echo "Generating Xcode project..."
  "$DEVELOPER_DIR/usr/bin/safari-web-extension-converter" extension \
    --project-location "$ROOT" \
    --app-name "YouTube Ad Blocker" \
    --bundle-identifier com.personal.youtubeadblocker \
    --macos-only \
    --swift \
    --no-open --no-prompt --force
fi

IDENTITY="$(security find-identity -v -p codesigning 2>/dev/null \
  | sed -n 's/.*"\(Apple Development:[^"]*\)".*/\1/p' \
  | head -1)"
TEAM=""
if [ -n "$IDENTITY" ]; then
  TEAM="$(security find-certificate -c "$IDENTITY" -p 2>/dev/null \
    | openssl x509 -noout -subject -nameopt RFC2253 2>/dev/null \
    | sed -n 's/.*OU=\([^,]*\).*/\1/p')"
fi

LOG="$ROOT/build/xcodebuild.log"
mkdir -p "$ROOT/build"

build() {
  xcodebuild \
    -project "$PROJECT" \
    -scheme "YouTube Ad Blocker" \
    -configuration Debug \
    -derivedDataPath "$ROOT/build" \
    "$@" \
    build >"$LOG" 2>&1
}

if [ -n "$IDENTITY" ] && [ -n "$TEAM" ]; then
  echo "Building with Apple Development signing (team $TEAM)..."
  if ! build DEVELOPMENT_TEAM="$TEAM" CODE_SIGN_STYLE=Automatic \
    CODE_SIGN_IDENTITY="Apple Development" -allowProvisioningUpdates; then
    echo "Signed build failed; retrying ad-hoc." >&2
    build CODE_SIGN_IDENTITY=- || { tail -40 "$LOG"; exit 1; }
  fi
else
  echo "No Apple Development identity found; building ad-hoc."
  build CODE_SIGN_IDENTITY=- || { tail -40 "$LOG"; exit 1; }
fi

APP="$ROOT/build/Build/Products/Debug/YouTube Ad Blocker.app"
if [ ! -d "$APP" ]; then
  echo "Build finished but the app is missing." >&2
  tail -40 "$LOG"
  exit 1
fi

echo
echo "Built: $APP"
echo "Open it once, then enable it in Safari > Settings > Extensions."
