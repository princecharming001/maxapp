#!/usr/bin/env bash
#
# setup_simulator.sh — put the iOS Simulator into a known-good state before
# running the Max Maestro suite.
#
# Usage:
#   ./setup_simulator.sh                 # auto-detect the booted sim
#   ./setup_simulator.sh <UDID>          # target a specific sim
#   CLEAR_AUTH=1 ./setup_simulator.sh    # also wipe the keychain (logs the user out)
#
# What it does:
#   1. Resolves the target simulator UDID (booted one, or the arg you pass).
#   2. Boots it if needed and opens Simulator.app.
#   3. Dismisses the Expo dev-client onboarding modal permanently.
#   4. (optional) Clears the keychain so the app starts logged-out.
#   5. Verifies Metro (8081) and the FastAPI backend (8000) are reachable.
#
# It does NOT flip feature flags: in this build flags are compile-time constants
# (constants/featureFlags.ts — onboardingV2=true, newNav=false, faceScan=true).
# There is no runtime/simctl way to change them; the tests are written against
# that shipped configuration.

set -euo pipefail

APP_ID="com.cannon.mobile"
METRO_PORT="8081"
BACKEND_PORT="8000"
EXPO_ONBOARDING_KEY="EXDevMenuIsOnboardingFinished"

# ---------------------------------------------------------------------------
# 1. Resolve the simulator UDID
# ---------------------------------------------------------------------------
if [[ "${1:-}" != "" ]]; then
  UDID="$1"
else
  # First currently-booted simulator
  UDID="$(xcrun simctl list devices booted -j \
    | python3 -c 'import json,sys; d=json.load(sys.stdin)["devices"]; ids=[x["udid"] for v in d.values() for x in v if x.get("state")=="Booted"]; print(ids[0] if ids else "")')"
fi

if [[ -z "${UDID}" ]]; then
  echo "✗ No booted simulator found. Boot one (or pass a UDID) and retry." >&2
  echo "  Tip: xcrun simctl list devices | grep -i 'iphone .*Booted'" >&2
  exit 1
fi
echo "✔ Target simulator: ${UDID}"

# ---------------------------------------------------------------------------
# 2. Boot + foreground Simulator.app (no-op if already booted)
# ---------------------------------------------------------------------------
xcrun simctl bootstatus "${UDID}" -b >/dev/null 2>&1 || xcrun simctl boot "${UDID}" || true
open -a Simulator || true
echo "✔ Simulator booted"

# ---------------------------------------------------------------------------
# 3. Permanently dismiss the Expo dev-client onboarding modal
#    (the "This is the developer menu" sheet that steals the first tap)
# ---------------------------------------------------------------------------
xcrun simctl terminate "${UDID}" "${APP_ID}" >/dev/null 2>&1 || true
xcrun simctl spawn "${UDID}" defaults write "${APP_ID}" "${EXPO_ONBOARDING_KEY}" -bool YES
echo "✔ Expo dev onboarding modal disabled (${EXPO_ONBOARDING_KEY}=YES)"

# ---------------------------------------------------------------------------
# 4. (optional) Clear auth so the app starts on the Login screen
#    expo-secure-store persists Supabase tokens in the keychain; resetting it
#    forces a logged-out cold start. Skipped unless CLEAR_AUTH=1.
# ---------------------------------------------------------------------------
if [[ "${CLEAR_AUTH:-0}" == "1" ]]; then
  xcrun simctl keychain "${UDID}" reset >/dev/null 2>&1 \
    && echo "✔ Keychain reset — app will cold-start logged-out" \
    || echo "⚠ Keychain reset unsupported on this Xcode; use a fresh sim for a clean auth state"
else
  echo "• Skipping keychain reset (set CLEAR_AUTH=1 to start logged-out)"
fi

# ---------------------------------------------------------------------------
# 5. Reachability checks for Metro + backend
# ---------------------------------------------------------------------------
if lsof -ti :"${METRO_PORT}" >/dev/null 2>&1; then
  echo "✔ Metro is up on :${METRO_PORT}"
else
  echo "⚠ Metro NOT running on :${METRO_PORT} — start it:  npx expo start --port ${METRO_PORT} --clear"
fi

if lsof -ti :"${BACKEND_PORT}" >/dev/null 2>&1; then
  echo "✔ Backend is up on :${BACKEND_PORT}"
else
  echo "⚠ Backend NOT running on :${BACKEND_PORT} — auth/scan/chat tests will fail offline"
fi

echo ""
echo "Ready. Run the suite with:"
echo "  maestro test mobile/maestro/   # all flows"
echo "  maestro test mobile/maestro/smoke_launch.yaml"
