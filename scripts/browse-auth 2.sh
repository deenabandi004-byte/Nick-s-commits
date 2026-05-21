#!/usr/bin/env bash
#
# browse-auth.sh - one-shot auth setup for the gstack browse tool
#
# Signs you into the local dev server (http://localhost:8080) inside gstack's
# persistent Chromium profile. After this runs once, every $B command stays
# authenticated until you delete the profile or sign out.
#
# See scripts/HEADLESS_AUTH.md for the full story.

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────
DEV_URL="${DEV_URL:-http://localhost:8080}"
FIREBASE_API_KEY="${FIREBASE_API_KEY:-AIzaSyCxcZbNwbh09DFw70tBQUSoqBIDaXNwZdE}"
FIREBASE_LS_KEY="firebase:authUser:${FIREBASE_API_KEY}:[DEFAULT]"
PROFILE_DIR="${HOME}/.gstack/chromium-profile"
STATE_FILE="$(git rev-parse --show-toplevel 2>/dev/null)/.gstack/browse.json"

# Locate the browse binary. Prefer repo-local copy, fall back to global install.
B=""
_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"
if [ -n "$_ROOT" ] && [ -x "$_ROOT/.claude/skills/gstack/browse/dist/browse" ]; then
  B="$_ROOT/.claude/skills/gstack/browse/dist/browse"
elif [ -x "$HOME/.claude/skills/gstack/browse/dist/browse" ]; then
  B="$HOME/.claude/skills/gstack/browse/dist/browse"
else
  echo "ERROR: gstack browse binary not found. Install gstack first." >&2
  exit 1
fi

# ─── Helpers ───────────────────────────────────────────────────────────────
say()  { printf "\033[1;36m[browse-auth]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[browse-auth]\033[0m %s\n" "$*" >&2; }
err()  { printf "\033[1;31m[browse-auth]\033[0m %s\n" "$*" >&2; }

server_is_headed_and_alive() {
  [ -f "$STATE_FILE" ] || return 1
  local pid mode
  # Regex tolerates optional whitespace after colons (state file is pretty-printed JSON)
  pid="$(grep -Eo '"pid"[[:space:]]*:[[:space:]]*[0-9]+' "$STATE_FILE" 2>/dev/null | grep -Eo '[0-9]+' || true)"
  mode="$(grep -Eo '"mode"[[:space:]]*:[[:space:]]*"[^"]*"' "$STATE_FILE" 2>/dev/null | sed -E 's/.*"mode"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/' || true)"
  [ -n "$pid" ] && [ "$mode" = "headed" ] && kill -0 "$pid" 2>/dev/null
}

kill_stale_servers() {
  say "Cleaning up any stale browse servers and profile locks..."
  pkill -9 -f "browse/src/server.ts" 2>/dev/null || true
  pkill -9 -f "sidebar-agent" 2>/dev/null || true
  # Only kill Playwright-launched Chromium, not your real Chrome
  pkill -9 -f "Google Chrome for Testing" 2>/dev/null || true
  sleep 1
  rm -f "$STATE_FILE"
  for lock in SingletonLock SingletonSocket SingletonCookie; do
    rm -f "$PROFILE_DIR/$lock"
  done
}

check_dev_server() {
  if ! curl -fsS --max-time 3 "$DEV_URL" > /dev/null 2>&1; then
    err "Dev server at $DEV_URL is not responding."
    err "Start it first: cd connect-grow-hire && npm run dev"
    exit 1
  fi
}

# ─── Main ──────────────────────────────────────────────────────────────────
say "Dev URL: $DEV_URL"
check_dev_server

# If we already have a healthy headed server, try to reuse it.
if server_is_headed_and_alive; then
  say "Found existing headed browse server - reusing it."
else
  kill_stale_servers
  say "Launching headed Chromium (watchdog disabled, profile: $PROFILE_DIR)..."
  # BROWSE_PARENT_PID=0 disables the server's parent-process watchdog.
  # Without this, the server self-terminates ~15s after the parent shell exits,
  # which kills the visible Chrome window mid-OAuth flow.
  BROWSE_PARENT_PID=0 "$B" connect >/dev/null
  sleep 1
  if ! server_is_headed_and_alive; then
    err "Failed to launch headed browser. Run '$B status' to debug."
    exit 1
  fi
fi

# Check if we're already authed. If so, short-circuit.
say "Checking existing auth state..."
"$B" goto "$DEV_URL/signin" >/dev/null
sleep 1
EXISTING_AUTH="$("$B" js "(function(){try{return localStorage.getItem('${FIREBASE_LS_KEY}')||''}catch(e){return ''}})()" 2>/dev/null | tr -d '\n' || true)"

if [ -n "$EXISTING_AUTH" ] && [ "$EXISTING_AUTH" != "null" ] && [ "$EXISTING_AUTH" != '""' ]; then
  say "✅ Already signed in to Firebase. Profile: $PROFILE_DIR"
  say "   Every future \$B command will reuse this session."
  EMAIL="$("$B" js "(function(){try{return JSON.parse(localStorage.getItem('${FIREBASE_LS_KEY}')).email||'unknown'}catch(e){return 'unknown'}})()" 2>/dev/null | tr -d '\n"' || echo "unknown")"
  say "   Signed in as: $EMAIL"
  exit 0
fi

# Not authed - walk the user through the sign-in flow.
"$B" focus >/dev/null 2>&1 || true

cat <<'EOF'

────────────────────────────────────────────────────────────────────
SIGN-IN REQUIRED

A GStack Browser window is open on the Offerloop /signin page.

  1. Click "Continue with Google"
  2. Complete the Google OAuth flow
  3. Wait until you land on /find (or /onboarding)
  4. Come back here and press ENTER

The auth will be saved in the persistent Chromium profile at
~/.gstack/chromium-profile and reused by every future $B command.
────────────────────────────────────────────────────────────────────

EOF

printf "Press ENTER when you're signed in... "
# Try stdin first; fall back to /dev/tty if stdin is redirected/not a terminal.
# Claude Code's Bash tool has no tty - run this script from your own terminal.
if [ -t 0 ]; then
  read -r _
elif [ -r /dev/tty ]; then
  read -r _ </dev/tty
else
  err "No interactive terminal available (stdin and /dev/tty both unusable)."
  err "Run this script from your own terminal, not from an automation harness."
  err "In Claude Code, prefix with '!' to run in the session shell: ! ./scripts/browse-auth.sh"
  exit 1
fi

# Verify auth landed in localStorage
say "Verifying auth..."
AUTH_JSON="$("$B" js "(function(){try{return localStorage.getItem('${FIREBASE_LS_KEY}')||''}catch(e){return ''}})()" 2>/dev/null | tr -d '\n' || true)"

if [ -z "$AUTH_JSON" ] || [ "$AUTH_JSON" = "null" ] || [ "$AUTH_JSON" = '""' ]; then
  err "Auth verification failed - no Firebase user in localStorage."
  err "Did the OAuth flow complete? Check the Chrome window."
  err "If you saw an error, try: rm -rf $PROFILE_DIR && rerun this script."
  exit 1
fi

EMAIL="$("$B" js "(function(){try{return JSON.parse(localStorage.getItem('${FIREBASE_LS_KEY}')).email||'unknown'}catch(e){return 'unknown'}})()" 2>/dev/null | tr -d '\n"' || echo "unknown")"

cat <<EOF

✅ Signed in as: $EMAIL
   Profile:      $PROFILE_DIR
   Server PID:   $(grep -Eo '"pid"[[:space:]]*:[[:space:]]*[0-9]+' "$STATE_FILE" | grep -Eo '[0-9]+')

Next steps:
  \$B goto http://localhost:8080/find       # go to any protected route
  \$B snapshot -i                           # inspect the page
  \$B screenshot                            # grab a screenshot

To get a fresh Firebase ID token (for curl against the Flask API):
  ./scripts/browse-auth.sh --print-token

To clear auth and start fresh:
  rm -rf $PROFILE_DIR

EOF

# Optional: print the Firebase ID token for API testing.
if [ "${1:-}" = "--print-token" ]; then
  say "Fresh Firebase ID token:"
  "$B" js "(function(){try{return JSON.parse(localStorage.getItem('${FIREBASE_LS_KEY}')).stsTokenManager.accessToken}catch(e){return ''}})()" 2>/dev/null | tr -d '"'
  echo
fi
