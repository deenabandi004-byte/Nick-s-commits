# Browser Auth for Local QA

This doc explains how to sign in to the local Offerloop dev server inside gstack's
Chromium browser so you can run `$B` commands against protected routes without
wrestling with Firebase auth injection.

**TL;DR:**

```bash
# 1. Start the dev server
cd connect-grow-hire && npm run dev    # http://localhost:8080

# 2. Start the Flask API
cd backend && python3 wsgi.py          # http://localhost:5001

# 3. Auth the browser (one time)
./scripts/browse-auth.sh

# 4. Run any $B command against a protected route
$B goto http://localhost:8080/find
$B snapshot -i
$B screenshot
```

That's it. After step 3 runs once, every future `$B` command stays signed in until
you explicitly clear the profile.

---

## The short version of what's going on

gstack has two browser modes:

| Mode | How it launches | Profile | Auth persists? |
|------|-----------------|---------|----------------|
| **Headed** (`$B connect`) | `launchPersistentContext(~/.gstack/chromium-profile)` | Persistent on disk | **Yes** |
| **Headless** (default) | `chromium.launch()` + fresh `newContext()` | Ephemeral, wiped every server restart | **No** |

`browse-auth.sh` uses headed mode with the persistent profile, so Firebase auth
(stored in localStorage via `setPersistence(browserLocalPersistence)`) survives
across every future `$B` command. No re-injection, no JSON wrangling.

The "headed" window can be minimized or dropped to another macOS Space. It's not
in your way, and seeing the browser during QA is usually a feature, not a bug.

---

## Two bugs this solves

### Bug 1: the headed window disappears within ~15 seconds

**Symptom:** `$B connect` opens a Chrome window, you start Google OAuth, the window
closes before you can finish signing in.

**Root cause:** The gstack browse server has a parent-process watchdog
(`~/.claude/skills/gstack/browse/src/server.ts:745`) that polls `process.kill(parent, 0)`
every 15 seconds and self-terminates if the parent shell is gone. When you run
`$B connect` from Claude Code's Bash tool, the parent shell exits as soon as the
command returns, so the watchdog fires and kills the server about 15 seconds later.
Chromium dies with the server.

**Fix:** Set `BROWSE_PARENT_PID=0` before `$B connect`. The server already supports
this flag (it's how `$B pair-agent` stays alive for remote agents - see
`cli.ts:988`). The server treats `0` as "don't run the watchdog."

```bash
BROWSE_PARENT_PID=0 $B connect
```

`browse-auth.sh` sets this automatically. If you want the same fix for your own
`$B connect` calls, set it in your shell profile:

```bash
export BROWSE_PARENT_PID=0
```

### Bug 2: headless auth gets wiped between every command

**Symptom:** You inject Firebase auth into `localStorage` and `IndexedDB`, it works
once, the next `$B` command loses it.

**Root cause:** Headless mode in gstack uses `chromium.launch()` with an ephemeral
context (`browser-manager.ts:146-202`). No persistent user data dir - localStorage
and IndexedDB are wiped on every server restart. And the server restarts often
because of Bug 1 above.

**Also:** `$B state save` looks like it should help, but it only persists cookies
and URLs, not localStorage (see `meta-commands.ts:565`: "V1: cookies + URLs only
(not localStorage - breaks on load-before-navigate)"). Firebase doesn't use cookies
for auth, so this is a dead end.

**Fix:** Use headed mode with the persistent profile
(`~/.gstack/chromium-profile`). `launchPersistentContext()` stores localStorage,
IndexedDB, cookies, extensions, everything on disk. One sign-in, reused forever.

---

## Common tasks

### Clear auth and start fresh

```bash
rm -rf ~/.gstack/chromium-profile
./scripts/browse-auth.sh
```

### Grab a fresh Firebase ID token for curl/Postman

```bash
./scripts/browse-auth.sh --print-token
```

Or inline:

```bash
$B js "JSON.parse(localStorage.getItem('firebase:authUser:AIzaSyCxcZbNwbh09DFw70tBQUSoqBIDaXNwZdE:[DEFAULT]')).stsTokenManager.accessToken"
```

Then use it:

```bash
TOKEN="$(./scripts/browse-auth.sh --print-token | tail -1)"
curl -H "Authorization: Bearer $TOKEN" http://localhost:5001/api/users/me
```

Firebase ID tokens expire after 1 hour. If your curl returns 401, refresh the
token by navigating the browser to any authenticated page (`$B goto http://localhost:8080/find`)
and re-running `--print-token`.

### Authenticate against staging or prod instead of local

```bash
DEV_URL=https://offerloop.ai ./scripts/browse-auth.sh
```

### Check if you're still signed in

```bash
$B goto http://localhost:8080/find
$B snapshot -i         # should show the authenticated UI, not /signin
```

Or check the token directly:

```bash
$B js "localStorage.getItem('firebase:authUser:AIzaSyCxcZbNwbh09DFw70tBQUSoqBIDaXNwZdE:[DEFAULT]') ? 'signed in' : 'signed out'"
```

### Disconnect the headed browser (but keep the profile)

```bash
$B disconnect
```

Your auth is saved in the profile dir. Next time you run `./scripts/browse-auth.sh`
it'll reuse the saved session without asking you to sign in again.

### Sign out of Firebase

```bash
$B js "Object.keys(localStorage).filter(k => k.startsWith('firebase:')).forEach(k => localStorage.removeItem(k))"
$B goto http://localhost:8080/signin
```

---

## Troubleshooting

### "Dev server at http://localhost:8080 is not responding"

Start it: `cd connect-grow-hire && npm run dev`

### The window opens but I land on /signin even after signing in

Firebase v10 can race between IndexedDB and localStorage on initial load. The auth
context calls `setPersistence(auth, browserLocalPersistence)` at line 85 of
`FirebaseAuthContext.tsx`, but the SDK may have already written to IndexedDB first.

Clear the profile and try again:

```bash
rm -rf ~/.gstack/chromium-profile
./scripts/browse-auth.sh
```

### `$B connect` says "Already connected in headed mode" but I can't see the window

The server thinks it's alive but the Chrome process may have crashed independently.
Force a clean restart:

```bash
pkill -9 -f "browse/src/server.ts"
pkill -9 -f "Google Chrome for Testing"
rm -f "$(git rev-parse --show-toplevel)/.gstack/browse.json"
./scripts/browse-auth.sh
```

### "SingletonLock" errors when launching Chromium

The previous Chromium process didn't clean up its profile locks. The script
handles this automatically, but if you're running `$B connect` by hand:

```bash
rm -f ~/.gstack/chromium-profile/Singleton{Lock,Socket,Cookie}
```

### After a gstack upgrade, auth is gone

Some upgrades migrate or reset the Chromium profile. Just re-run the script.

### I need real headless mode (e.g., CI)

For pure headless on GitHub Actions or similar, the persistent-profile trick
doesn't apply. Options:

1. **Cache the profile dir as a GHA artifact** - works but you still need a human
   to do the initial OAuth once, and the cached profile needs periodic refresh.
2. **Dev-only `/api/dev/sign-in-as` route** that takes a secret and a UID and
   returns a Firebase custom token - then call `signInWithCustomToken` client-side.
   Clean for CI, but requires backend + FE glue.
3. **Firebase emulator** - run the auth emulator in CI and sign in with fixture
   users. Heaviest lift, cleanest isolation.

None of these are currently wired up. Ping me if CI headless becomes a real need
and we'll pick one.

---

## Files touched

- `scripts/browse-auth.sh` - the one-shot auth script
- `scripts/HEADLESS_AUTH.md` - this file

No changes to the frontend, backend, or the gstack tool itself. This is pure
tooling layered on top of gstack's existing headed mode.
