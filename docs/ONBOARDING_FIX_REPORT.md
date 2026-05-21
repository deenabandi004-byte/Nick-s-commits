# Onboarding Fix - Changes by Phase

Report of all code and behavior changes made across Phases 1–4.

---

## PHASE 1 - Backend: Set needsOnboarding for All New Users

**Goal:** Ensure every new user (web, extension, or future entry points) gets `needsOnboarding: true`. Fix extension-created users never seeing onboarding.

### File 1: `backend/app/models/users.py`

| Change | Description |
|--------|-------------|
| **Added field** | `'needsOnboarding': True` in the `user_data` dict returned by `create_user_data()`. |
| **Placement** | Top-level of the user document (same level as `email`, `tier`, etc.). |
| **Comment** | `# All new users (web, extension, etc.) start with onboarding required` |

**Snippet:**
```python
'needsOnboarding': True,  # All new users (web, extension, etc.) start with onboarding required
```

### File 2: `backend/app/routes/auth_extension.py`

| Change | Description |
|--------|-------------|
| **Comment only** | In the "Create user document in Firestore" block, added: *(create_user_data includes needsOnboarding: True for new users)*. |
| **Logic** | No logic change. New users are created only via `create_user_data()` and `user_ref.set(user_data)`; they now receive `needsOnboarding: True` from the model. Existing users are unchanged (only `name`/`picture` updated when missing). |

### File 3: `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx`

| Change | Description |
|--------|-------------|
| **Legacy users in loadUserData()** | Comment added: *Legacy users (doc exists but no needsOnboarding field) are treated as needsOnboarding: false*. Behavior unchanged: `needsOnboarding: d.needsOnboarding ?? false` already implements this. |
| **signIn() - avoid race** | For new users: after `await setDoc(ref, newUserPayload)`, added an immediate `setUser({ ...newUserPayload, needsOnboarding: true })` so the routing guard has the flag before `onIdTokenChanged`/`loadUserData` run. New-user payload is built once and used for both Firestore and state. |

**Summary:** Web and extension creation paths both set `needsOnboarding: true` for new users; existing users and legacy docs (no field) remain treated as onboarded.

---

## PHASE 2 - Tighten the Web Routing Guard

**Goal:** Make onboarding routing bulletproof: never render protected content or redirect logged-in users before full user data (including `needsOnboarding`) is loaded.

### File 1: `connect-grow-hire/src/App.tsx`

| Change | Description |
|--------|-------------|
| **ProtectedRoute** | Comment at top: guard waits for *full user object (including needsOnboarding)*; `isLoading` stays true until Firestore user doc is fetched. Numbered comments (1–5) for: loading → signedOut → no user → needs onboarding → allow. Loading copy: *Still loading (Firestore user doc), showing loading*. |
| **PublicRoute** | Comment: *Wait for full user data before redirecting logged-in users*. Replaced raw spinner with same `LoadingContainer` as ProtectedRoute (label: "Loading Offerloop..."). Numbered comments (1–4). Loading copy: *Still loading (Firestore user doc), showing loading*. |

No change to guard order; only clarity and consistent loading UX.

### File 2: `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx`

| Change | Description |
|--------|-------------|
| **Auth listener** | Wrapped callback body in `try/finally`. `setIsLoading(false)` moved into `finally` so loading is always cleared after `loadUserData()` runs (success or failure). Comment before `loadUserData`: *Load full user from Firestore (including needsOnboarding) before we set loading false*. Comment in `finally`: *Only set loading false AFTER Firestore user doc is fetched and user state is set*. |

**Summary:** Both guards wait on `isLoading`; loading is set false only after Firestore user (and thus `needsOnboarding`) is loaded, and always cleared in `finally`.

---

## PHASE 3 - Chrome Extension Onboarding Gate

**Goal:** Extension users who have not completed onboarding see a gate and are sent to the web app; no feature use until onboarding is done.

### File 1: `backend/app/routes/billing.py`

| Change | Description |
|--------|-------------|
| **GET /api/check-credits** | Response now includes `needs_onboarding`. When user doc exists: `needs_onboarding = user_data.get('needsOnboarding', False)`. When user doc does not exist: `needs_onboarding: True`. Fallback (no Firebase): `needs_onboarding: False`. |

### File 2: `chrome-extension/background.js`

| Change | Description |
|--------|-------------|
| **handleGetCredits** | Included in `sendResponse`: `needsOnboarding: data.needs_onboarding === true`. |

### File 3: `chrome-extension/popup.html`

| Change | Description |
|--------|-------------|
| **Onboarding gate section** | New block after "Not on LinkedIn Profile": icon, title "Complete your profile to get started", description "Set up your profile on the Offerloop web app to start networking.", button "Complete Profile" (`id="completeProfileBtn"`), button "Refresh" (`id="onboardingRefreshBtn"`). Reuses `.message-box` and `.btn` styles. |

### File 4: `chrome-extension/popup.css`

| Change | Description |
|--------|-------------|
| **.btn-link-text** | New class for link-style button: transparent background, blue text, underline on hover (used for "Refresh"). |

### File 5: `chrome-extension/popup.js`

| Change | Description |
|--------|-------------|
| **WEB_APP_BASE_URL** | Constant `'https://www.offerloop.ai'` (matches existing app links). |
| **elements** | Added `onboardingGateSection`, `tabSwitcher` (query for `.tab-switcher`). |
| **initElements()** | Initialize `onboardingGateSection`, `tabSwitcher`. |
| **showSection()** | New case `'onboardingGate'`: show gate, hide login/noProfile/profile; when section is `'onboardingGate'` hide tab switcher (`display: none`), otherwise show it. |
| **fetchUserStatus()** | New. Calls `getCredits` via `chrome.runtime.sendMessage`; returns `{ credits, needsOnboarding }` or `null`. `needsOnboarding = response.needsOnboarding === true`. |
| **handleCompleteProfile()** | New. `chrome.tabs.create({ url: WEB_APP_BASE_URL + '/onboarding' })`. |
| **handleOnboardingRefresh()** | New. Calls `fetchUserStatus()`; if `!needsOnboarding` updates credits and runs `checkAndShowContent()`, else stays on gate. |
| **handleLogin()** | After saving token/credits, calls `fetchUserStatus()`. If `status.needsOnboarding` → `showSection('onboardingGate')` and return; else `checkAndShowContent()`. |
| **init()** | When already logged in and token refreshed, calls `fetchUserStatus()`. If `status.needsOnboarding` → `showSection('onboardingGate')` and update credits; else `checkAndShowContent()`. |
| **initEventListeners()** | `completeProfileBtn` → `handleCompleteProfile`, `onboardingRefreshBtn` → `handleOnboardingRefresh`. |

**Summary:** New and non-onboarded extension users see the gate; "Complete Profile" opens web `/onboarding`; "Refresh" rechecks and shows normal UI when `needs_onboarding` is false. Auth flow unchanged.

---

## PHASE 4 - Cleanup & Edge Case Handling

**Goal:** Handle edge cases and align messaging; verify flows.

### File 1: `connect-grow-hire/src/App.tsx`

| Change | Description |
|--------|-------------|
| **ProtectedRoute - direct /onboarding** | After the "user needs onboarding" block, added: if path is `/onboarding` and user does **not** need onboarding → `<Navigate to="/contact-search" replace />`. So logged-in users who already completed onboarding are redirected away from `/onboarding` instead of seeing the flow again. Comment: *User already onboarded but hit /onboarding directly → redirect to app*. Step numbering updated (new step 5, then 6 for "authenticated and onboarded"). |

### File 2: `connect-grow-hire/src/pages/OnboardingFlow.tsx`

| Change | Description |
|--------|-------------|
| **completeOnboarding() failure** | In `handleLocationData` catch block: toast message changed to *"Failed to save profile. Please try again."* Comment updated: *Don't navigate if onboarding failed - user stays on last step and can retry.* (Try/catch and `setIsSubmitting(false)` were already in place.) |

**Confirmed (no code change):**

- **Edge case 1 (legacy users):** `loadUserData()` already uses `needsOnboarding: d.needsOnboarding ?? false`.
- **Edge case 2 (refresh during onboarding):** Progress is not persisted (state only); guard keeps user on `/onboarding` on refresh.
- **Edge case 3 (direct URL):** Logged-out → signin; logged-in onboarded → now redirect to `/contact-search` (added in Phase 4).
- **Edge case 4 (completeOnboarding failure):** Error handling and no navigation on failure; only toast text updated.

---

## File Summary (All Phases)

| File | Phases | Summary of changes |
|------|--------|--------------------|
| **backend/app/models/users.py** | 1 | `create_user_data()` adds `needsOnboarding: True`. |
| **backend/app/routes/auth_extension.py** | 1 | Comment that new users get `needsOnboarding` from `create_user_data()`. |
| **backend/app/routes/billing.py** | 3 | `check-credits` response includes `needs_onboarding`. |
| **connect-grow-hire/src/contexts/FirebaseAuthContext.tsx** | 1, 2 | Phase 1: legacy comment, immediate `setUser` for new user in `signIn()`. Phase 2: `try/finally` and comments around `setIsLoading(false)`. |
| **connect-grow-hire/src/App.tsx** | 2, 4 | Phase 2: guard comments, PublicRoute uses LoadingContainer. Phase 4: redirect from `/onboarding` when user already onboarded. |
| **connect-grow-hire/src/pages/OnboardingFlow.tsx** | 4 | Toast on failure: "Failed to save profile. Please try again."; comment on no-navigate. |
| **chrome-extension/background.js** | 3 | `getCredits` response includes `needsOnboarding`. |
| **chrome-extension/popup.html** | 3 | Onboarding gate section (title, description, Complete Profile, Refresh). |
| **chrome-extension/popup.css** | 3 | `.btn-link-text` for Refresh button. |
| **chrome-extension/popup.js** | 3 | WEB_APP_BASE_URL, gate section, fetchUserStatus, handlers, post-login/init onboarding check. |

---

## Not Modified (Per Instructions)

- OnboardingFlow step components (OnboardingWelcome, OnboardingProfile, OnboardingAcademics, OnboardingLocationPreferences).
- Extension auth flow (Chrome Identity + backend token exchange).
- No onboarding forms added inside the extension; all onboarding on web app.
