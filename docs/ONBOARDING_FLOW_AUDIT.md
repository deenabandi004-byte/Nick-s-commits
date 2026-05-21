# Onboarding Flow - Full Audit

## 1. Onboarding Flow

### Where is the onboarding component/page?

| File | Role |
|------|------|
| **connect-grow-hire/src/pages/OnboardingFlow.tsx** | Main container: state machine (steps), data aggregation, resume upload, `completeOnboarding()` call, post-completion redirect |
| **connect-grow-hire/src/pages/OnboardingWelcome.tsx** | Step 1: Welcome screen, “Get Started” → profile |
| **connect-grow-hire/src/pages/OnboardingProfile.tsx** | Step 2: Profile + optional resume upload |
| **connect-grow-hire/src/pages/OnboardingAcademics.tsx** | Step 3: University, degree, major, graduation |
| **connect-grow-hire/src/pages/OnboardingLocationPreferences.tsx** | Step 4: Country/state/city, job types, interests, preferred locations |

Onboarding is rendered at route **`/onboarding`** in `App.tsx` (see §2).

### Onboarding steps in order and data collected

| Step | Component | Data collected |
|------|-----------|----------------|
| 1 | **OnboardingWelcome** | None (welcome only). `userName` from `user?.name`. |
| 2 | **OnboardingProfile** | `firstName`, `lastName`, `email`, `phone`, optional `resume` (File). |
| 3 | **OnboardingAcademics** | `university`, `degree`, `major`, `graduationMonth`, `graduationYear`. |
| 4 | **OnboardingLocationPreferences** | `country`, `state`, `city`, `jobTypes[]`, `interests[]`, `preferredLocation[]`. |

On completion, `OnboardingFlow` builds `finalData` (profile, academics, location), optionally uploads resume via `POST /api/parse-resume`, then calls `completeOnboarding(finalData)` from context.

### Where is onboarding completion stored?

- **Firestore**: `users/{uid}` document. Context’s `completeOnboarding()` either:
  - **Updates** existing doc with `updateDoc(ref, { ...cleaned, needsOnboarding: false, ... })`, or
  - **Creates** doc with `setDoc(ref, { ...payload, needsOnboarding: false })`.
- **Session**: `sessionStorage.setItem('onboarding_just_completed', 'true')` is set before redirect (for any logic that might key off it).
- **In-memory**: `setUser({ ...user, needsOnboarding: false })` in `FirebaseAuthContext` so the next route resolution sees the user as “onboarded.”

So “completion” is: Firestore `users/{uid}.needsOnboarding === false` plus context state.

### What sets the “needs onboarding” flag for new users?

- **Web (FirebaseAuthContext)**  
  - In **`signIn()`** (FirebaseAuthContext.tsx): when the user doc does not exist (`!snap.exists()`), it does `setDoc(ref, { ..., needsOnboarding: true })` and returns `"onboarding"`.  
  - In **`loadUserData()`**: when the user doc does not exist, it builds `newUser` with `needsOnboarding: true` and `setDoc(userDocRef, { ...newUser, ... })`.  
  So for **web-only** sign-ups, the flag is set in both code paths.

- **Chrome extension (backend)**  
  - In **`backend/app/routes/auth_extension.py`**, when the Firestore user doc does not exist, it creates the doc via `create_user_data(...)` and `user_ref.set(user_data)`.  
  - **`backend/app/models/users.py`** → **`create_user_data()`** does **not** include `needsOnboarding`. So new users created **only** via the extension never get `needsOnboarding: true`.  
  - The frontend reads `d.needsOnboarding ?? false`, so a missing field is treated as “no onboarding needed.”  

**Conclusion:** The “needs onboarding” flag is set correctly for **web** sign-ups and **not** set for **extension-created** users (bug).

---

## 2. Routing & Guards

### How the app decides onboarding vs main app

- **ProtectedRoute** (App.tsx):  
  - If `user.needsOnboarding === true` and path is not `/onboarding` → redirect to `/onboarding?returnTo=...`.  
  - If `user.needsOnboarding === true` and path is `/onboarding` → render children (onboarding).  
  - So any protected app route forces onboarding when the flag is true.

- **PublicRoute** (App.tsx):  
  - If there is a `user` and they are not on a “signed out” path: redirect to `user.needsOnboarding ? "/onboarding" : "/contact-search"`.  
  - So landing page and `/signin` (both under PublicRoute) send authenticated users either to onboarding or contact-search.

### Route guard / redirect that checks onboarding

- **File:** `connect-grow-hire/src/App.tsx`  
- **Components:** `ProtectedRoute` (lines 82–145) and `PublicRoute` (lines 147–196).  
- **Logic:** Both use `useFirebaseAuth()` and `user.needsOnboarding` to decide redirect vs render.

### Exact routing logic: sign-up → where they land → how they get to onboarding

**Web sign-up (Sign In page):**

1. User is on `/signin` (or `/signin?mode=signup`).
2. Clicks “Continue with Google” → `handleGoogleAuth()` → `signIn({ prompt: "consent" })`.
3. In **FirebaseAuthContext.signIn()**:  
   - If user doc does not exist: `setDoc(..., needsOnboarding: true)`, return `"onboarding"`.  
   - If user doc exists: return `data.needsOnboarding ?? !!info?.isNewUser ? "onboarding" : "home"`.
4. Back in SignIn:  
   - If `checkNeedsGmailConnection()` is true → `initiateGmailOAuth(false)` → **full-page redirect** to Google OAuth (no client-side navigate to `/onboarding` yet).  
   - After Gmail OAuth, backend redirects to **`get_frontend_redirect_uri()` + `?connected=gmail`** which is **`/signin?connected=gmail`** (see `backend/app/config.py`: production = `https://www.offerloop.ai/signin`).
5. User lands on **`/signin?connected=gmail`**.  
   - `onIdTokenChanged` has already run (same Firebase session), so `loadUserData` has loaded the user doc (with `needsOnboarding: true`).  
   - SignIn’s `useEffect` sees `justConnectedGmail` and does `forceNavigate(user?.needsOnboarding ? "/onboarding" : "/home")` → **should go to `/onboarding`** for new users.
6. If Gmail was already connected: right after `signIn()` returns, SignIn does `forceNavigate(next === "onboarding" ? "/onboarding" : "/home")` → new user goes to `/onboarding`.

So in code, **new web users are supposed to land on `/onboarding`** either after Gmail OAuth (via `/signin?connected=gmail`) or directly from SignIn when Gmail is already connected.

### After onboarding completes - where they go and what prevents seeing onboarding again

- **In OnboardingFlow.tsx:**  
  - `completeOnboarding(finalData)` updates Firestore and context with `needsOnboarding: false`.  
  - Then `refreshUser()`, then `navigate(destination)` where `destination` is `returnTo` (if valid and not `/onboarding` or `/signin`) or `"/home"`.  
  - `/home` is defined in App.tsx as `<Navigate to="/contact-search" replace />`.
- **What prevents seeing onboarding again:**  
  - Firestore `users/{uid}.needsOnboarding` is set to `false`.  
  - Context `user.needsOnboarding` is set to `false`.  
  - So ProtectedRoute and PublicRoute no longer redirect to `/onboarding`.

---

## 3. Chrome Extension Entry Point

### How users get into the app from the extension

- They do **not** open the web app by default. They use the **extension popup** (and optional links to the site).
- Auth: **Chrome Identity API** → get Google token → **POST `/api/auth/google-extension`** with `{ googleToken }` → backend verifies token, finds/creates Firebase user, ensures Firestore `users/{uid}` exists, returns Firebase ID token.
- Extension stores `authToken` (and user info) in `chrome.storage.local` and uses it for API calls. No redirect to the web app for sign-in.

### URL/route extension users land on

- Extension **never** sends users to a specific app route. It only:
  - Opens hardcoded links (e.g. `https://www.offerloop.ai/...`) for “See in Library” / “Hiring Manager Tracker” etc. in popup.html/popup.js.
  - Does **not** open `/onboarding` or `/signin` after first-time sign-in.

### Does the extension auth flow use the same sign-in page as normal users?

- **No.** Normal users sign in on the **web** via `/signin` and Firebase `signInWithPopup`. Extension users sign in **inside the extension** via Chrome Identity + backend `/api/auth/google-extension`. Same Firebase/Firestore user, different entry point.

### Separate auth / token mechanism from extension

- **Yes.** Extension uses Chrome Identity → backend `/api/auth/google-extension` → receives Firebase ID token → stores it and sends `Authorization: Bearer <token>` on API requests. The web app uses Firebase Auth (popup) and the same Firestore user doc.

### Where the extension flow should check for onboarding, and whether it does

- **Should:** After a new user is created (or when the API indicates `needsOnboarding`), the extension could open a tab to `https://www.offerloop.ai/onboarding` (or `/signin` which would then redirect to onboarding if the flag is true).
- **Currently:** The extension does **not** check onboarding. It does not call an endpoint that returns `needsOnboarding`, and it does not open the web app for onboarding. In addition, **new users created by the extension never get `needsOnboarding: true`** in Firestore (see §1), so even if they later visit the website and sign in with the same Google account, the web app will treat them as already onboarded.

---

## 4. The Bug

### Trace: brand new user signing up (web) - step by step

1. User on `/` or `/signin` → clicks “Create account” / “Continue with Google”.
2. `handleGoogleAuth()` → `signIn({ prompt: "consent" })` in context.
3. Firebase popup completes; in `signIn()`: user doc does not exist → `setDoc(ref, { ..., needsOnboarding: true })`, return `"onboarding"`.
4. SignIn calls `checkNeedsGmailConnection()`. If **needs Gmail**: `initiateGmailOAuth(false)` → `window.location.replace(data.authUrl)` → user leaves to Google.
5. User completes Gmail OAuth; backend redirects to **`/signin?connected=gmail`**.
6. Page loads; `onIdTokenChanged` runs, `loadUserData()` runs, doc exists with `needsOnboarding: true` → `setUser(...)`, `setIsLoading(false)`.
7. SignIn `useEffect` runs (user set, not loading), sees `justConnectedGmail` → `forceNavigate(user?.needsOnboarding ? "/onboarding" : "/home")` → **intended: `/onboarding`**.

**Where the redirect “should” fire:** In that same `useEffect` when `justConnectedGmail` is true and `user` is set (with `needsOnboarding: true`). So the redirect **should** fire. If new web users still don’t see onboarding, possible causes include: race (user not yet set when effect runs), or another code path (e.g. different `return_path` from OAuth, or frontend redirect URI differing from `/signin` in some env).

### Trace: extension user - step by step

1. User opens extension popup, clicks “Sign in” (or equivalent).
2. `handleLogin()` in popup.js: `chrome.identity.getAuthToken({ interactive: true })` → Google token.
3. **POST** `/api/auth/google-extension` with `{ googleToken }`.
4. Backend: no Firebase user for email → create Firebase user; no Firestore doc → **create doc via `create_user_data()`** (no `needsOnboarding` field) and `user_ref.set(user_data)`.
5. Backend returns `{ success, token, user, credits }`. Extension stores token and user, shows popup UI. **No redirect to web app, no onboarding check.**
6. If that user later visits the website and signs in with Google: Firebase finds existing user, `loadUserData()` loads Firestore doc → `d.needsOnboarding ?? false` → **false** (field missing). So they are **never** sent to onboarding.

So onboarding is skipped for extension users because:  
- The extension never sends them to the web app for onboarding, and  
- The backend never sets `needsOnboarding: true` when creating their user doc.

### Is the onboarding route still registered and component imported?

- **Yes.** In **App.tsx**:  
  - Line 55: `const OnboardingFlow = React.lazy(() => import("./pages/OnboardingFlow").then(m => ({ default: m.OnboardingFlow })));`  
  - Lines 212–223:  
    - `<Route path="/onboarding" element={<ProtectedRoute><Suspense>...<OnboardingFlow /></Suspense></ProtectedRoute>} />`  
    - `<Route path="/onboarding/*" element={<Navigate to="/onboarding" replace />} />`  
  So the route is registered and the component is lazy-loaded.

### Is `needsOnboarding` set correctly for new users?

- **Web:** Yes, in FirebaseAuthContext when creating the user doc in `signIn()` and in `loadUserData()`.
- **Backend (extension):** No. `create_user_data()` in `backend/app/models/users.py` does not set `needsOnboarding`. `auth_extension.py` uses that to create the doc, so new extension users never get `needsOnboarding: true`.

---

## 5. File Map

| File | One-line summary | Status |
|------|------------------|--------|
| **connect-grow-hire/src/App.tsx** | Registers `/onboarding` route, lazy-loads OnboardingFlow, ProtectedRoute/PublicRoute use `user.needsOnboarding` to redirect. | OK |
| **connect-grow-hire/src/pages/OnboardingFlow.tsx** | Orchestrates 4 steps, resume upload, `completeOnboarding()`, redirect after completion. | OK |
| **connect-grow-hire/src/pages/OnboardingWelcome.tsx** | Step 1 welcome; no data. | OK |
| **connect-grow-hire/src/pages/OnboardingProfile.tsx** | Step 2 profile + resume. | OK |
| **connect-grow-hire/src/pages/OnboardingAcademics.tsx** | Step 3 academics. | OK |
| **connect-grow-hire/src/pages/OnboardingLocationPreferences.tsx** | Step 4 location + job types + interests. | OK |
| **connect-grow-hire/src/contexts/FirebaseAuthContext.tsx** | Sets `needsOnboarding` for new users (web), provides `completeOnboarding()`, `loadUserData` reads `needsOnboarding`. | OK for web |
| **connect-grow-hire/src/pages/SignIn.tsx** | After `signIn()` uses `next` and Gmail status to navigate to `/onboarding` or `/home`; after Gmail return uses `user?.needsOnboarding` for redirect. | OK |
| **connect-grow-hire/src/services/firebaseApi.ts** | `UserData.needsOnboarding` type; `saveProfessionalInfo` sets `needsOnboarding: false`. | OK |
| **backend/app/routes/auth_extension.py** | Creates Firestore user for extension sign-in using `create_user_data()`; does not set `needsOnboarding`. | **Broken** - new extension users never get onboarding flag |
| **backend/app/models/users.py** | `create_user_data()` builds user payload; no `needsOnboarding` field. | **Broken** - used by extension auth |
| **chrome-extension/popup.js** | Extension auth via `/api/auth/google-extension`; no onboarding check, no redirect to web app. | **Gap** - never sends new users to onboarding |

---

## 6. Critical code snippets

### Where “needs onboarding” is set for new users (web)

```155:174:connect-grow-hire/src/contexts/FirebaseAuthContext.tsx
        const userData = {
          ...
          needsOnboarding: d.needsOnboarding ?? false,
        };
        setUser(userData);
        ...
      } else {
        const newUser: User = {
          ...
          needsOnboarding: true,
        };
        await setDoc(userDocRef, { ...newUser, createdAt: new Date().toISOString() });
        setUser(newUser);
```

```203:218:connect-grow-hire/src/contexts/FirebaseAuthContext.tsx
    if (!snap.exists()) {
      await setDoc(ref, {
        ...
        needsOnboarding: true,
        ...
      });
      return "onboarding";
    }
```

### Where extension creates user without onboarding flag

```116:132:backend/app/routes/auth_extension.py
        if not user_doc.exists:
            ...
            user_data = create_user_data(
                uid=user_id,
                email=email,
                tier=tier,
                name=name,
                credits=tier_config.get('credits', 150),
                max_credits=tier_config.get('credits', 150)
            )
            user_ref.set(user_data)
```

```36:56:backend/app/models/users.py
    user_data = {
        'uid': uid,
        'email': email,
        'subscriptionTier': tier,
        'tier': tier,
        'credits': ...,
        'maxCredits': ...,
        ...
        # no 'needsOnboarding'
    }
```

### Route guard redirect to onboarding

```125:137:connect-grow-hire/src/App.tsx
  if (user.needsOnboarding) {
    if (loc.pathname === "/onboarding") {
      ...
      return (<>...{children}</>);
    }
    ...
    return <Navigate to={`/onboarding?returnTo=${returnTo}`} replace />;
  }
```

### SignIn redirect after Gmail OAuth

```259:269:connect-grow-hire/src/pages/SignIn.tsx
      if (justConnectedGmail) {
        ...
        const dest = user?.needsOnboarding ? "/onboarding" : "/home";
        ...
        forceNavigate(dest);
        return;
      }
```

---

## 7. Recommended fixes

1. **Backend - extension-created users**  
   - In **auth_extension.py**, when creating the Firestore user doc, set **`needsOnboarding: True`** in the payload (e.g. add it to the dict passed to `user_ref.set()` after calling `create_user_data()`, or add a parameter to `create_user_data()` and use it in the model).  
   - This ensures that when an extension-only user later visits the website and signs in, they will be redirected to onboarding.

2. **Extension - optional**  
   - Have `/api/auth/google-extension` return **`needsOnboarding`** in the response (from the created/updated user doc).  
   - In the extension, after first-time sign-in, if `needsOnboarding === true`, open a tab to `https://www.offerloop.ai/onboarding` (or `/signin` so the web app can redirect based on the flag).  
   - This makes extension-first users see onboarding without having to open the site manually.

3. **Web - optional**  
   - If you still see new web users missing onboarding, add a short delay or an explicit “wait for user” before running the post–Gmail OAuth redirect in SignIn, or ensure the redirect runs after a second render when `user` is guaranteed to be set.

Implementing (1) is the minimum to fix “extension users skip onboarding” when they later use the web; (2) improves first-time experience for extension-only users.
