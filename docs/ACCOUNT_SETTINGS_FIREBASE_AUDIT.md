# Account Settings Page - Full Firebase Audit

This document traces the Account Settings page structure, data load/save flow, state management, and potential causes for "changes don't persist."

---

## 1. Account Settings Page Structure

### Sections (from `sections` array in `AccountSettings.tsx`)

| Section ID     | Label                 | Icon         |
|----------------|-----------------------|--------------|
| `personal`     | Personal Information  | User         |
| `academic`     | Academic Information  | GraduationCap|
| `professional`| Professional Profile  | Briefcase    |
| `career`       | Career Interests      | Rocket       |
| `gmail`        | Gmail Integration     | Mail         |
| `account`      | Account Management    | Settings     |
| `danger`       | Danger Zone           | AlertTriangle|

### Fields per section

**Personal Information**
- First Name (editable, `personalInfo.firstName`)
- Last Name (editable, `personalInfo.lastName`)
- Email (read-only, disabled, `personalInfo.email`)
- University (editable, `personalInfo.university`)
- Phone (editable, `personalInfo.phone`)

**Academic Information**
- Graduation Month (Select, `academicInfo.graduationMonth`)
- Graduation Year (text input, `academicInfo.graduationYear`)
- Field of Study (text, `academicInfo.fieldOfStudy`)
- Current Degree (Select, `academicInfo.currentDegree`)

**Professional Profile**
- Resume: upload / view / delete. Uses Firebase Storage + `users/{uid}` fields: `resumeUrl`, `resumeFileName`, `resumeUpdatedAt`, `resumeParsed`. No single "Save" for this section; upload/delete are immediate.

**Career Interests**
- Industries of Interest (multi-select popover, `careerInfo.industriesOfInterest`)
- Preferred Job Role (text, `careerInfo.preferredJobRole`)
- Preferred Locations (multi-select, `careerInfo.preferredLocations`)
- Job Types (checkboxes: Internship, Part-Time, Full-Time, `careerInfo.jobTypes`)

**Gmail Integration**
- Status from API (`apiService.gmailStatus()`), not Firestore. Connect/Disconnect/Reconnect actions call backend APIs.

**Account Management**
- Manage subscription (Stripe portal), Sign out. No profile fields.

**Danger Zone**
- Delete account (if present). No profile fields.

### Save button

- **One global "Save changes" button** for the **profile** (Personal + Academic + Career). It lives at the bottom of the **Career Interests** section (around line 1918).
- Resume and Gmail are saved immediately by their own actions (upload, delete, connect, disconnect).
- No per-section Save buttons for personal/academic/career.

### Full flow when user clicks "Save changes"

1. **UI:** User clicks the button → `onClick={handleSaveOnboardingData}` (line ~1921).
2. **Guard:** If `!user?.uid`, toast "You must be signed in to save changes." and return.
3. **State:** `setIsSaving(true)`.
4. **API call (non-blocking for persistence):**  
   `POST /api/users/update-preferences` with body `{ updates: { location: {...}, academics: {...} } }`.  
   - Success: reads `intentChanged` for toast.  
   - Failure: caught, `console.warn`, **execution continues** (save is not aborted).
5. **Firestore read:** `getDoc(userRef)` for `users/{user.uid}` to get `existingData` and merge into `location` and `academics`.
6. **Firestore write:** `updateDoc(userRef, updates)` with the full payload (see below).
7. **UI feedback:** `setShowSaveToast(true)`, toast "Your profile information has been saved." (or "Preferences Updated" if intent changed).
8. **State:** `setIsSaving(false)` in `finally`.

So: **persistence is done by the client with `updateDoc` on `users/{uid}`.** The backend preference call only affects job intent/cache; it does not gate whether the profile is saved.

---

## 2. Data Flow: Load

### Where data comes from

- **Profile (personal, academic, career):** Firestore only. No profile API; the page reads directly from Firestore in a `useEffect`.
- **Resume:** Firestore `users/{uid}` (`resumeUrl`, `resumeFileName`, `resumeUpdatedAt`, `resumeParsed`) plus optional `localStorage` (`resumeData`, `resumeFile`).
- **Gmail:** Backend API `apiService.gmailStatus()` (e.g. `/api/gmail/status`), not Firestore profile doc.

### Firestore path for profile

- **Collection:** `users`
- **Document ID:** `uid` from `auth.currentUser?.uid` (inside the effect), not from React `user.uid`.
- So path: **`users/{uid}`** (same as save).

### When load runs

- Single `useEffect` dependency: **`[user?.email]`** (line 641).
- On mount: if `user` is still null, `user?.email` is undefined; `loadUserData` still runs and uses `auth.currentUser?.uid`. So the first load may use auth before context has set `user`.
- When `user` is set and `user.email` is defined, the effect can run again and reload (same doc).
- **No loading state** for the profile form (no spinner or "Loading..." for personal/academic/career). Resume has upload state; Gmail has `gmailLoading`.

### Load code (exact)

```ts
// AccountSettings.tsx lines 581-641
useEffect(() => {
  const loadUserData = async () => {
    try {
      const { auth } = await import('../lib/firebase');
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data) {
          const { firstName, lastName } = parseName(data.name);
          setPersonalInfo({
            firstName: firstName || data.firstName || data.profile?.firstName || "",
            lastName: lastName || data.lastName || data.profile?.lastName || "",
            email: data.email || user?.email || "",
            university: data.university || data.academics?.university || data.college || "",
            phone: data.phone || data.profile?.phone || "",
          });
          setAcademicInfo({
            graduationMonth: data.graduationMonth || data.academics?.graduationMonth || "",
            graduationYear: data.graduationYear || data.academics?.graduationYear || "",
            fieldOfStudy: data.fieldOfStudy || data.major || data.academics?.major || "",
            currentDegree: data.currentDegree || data.degree || data.academics?.degree || "",
          });
          setCareerInfo({
            industriesOfInterest: data.industriesOfInterest || data.interests || data.careerInterests || data.location?.interests || [],
            preferredJobRole: data.preferredJobRole || data.preferredJobRolesOrTitles || "",
            preferredLocations: data.preferredLocations || data.preferredLocation || data.location?.preferredLocation || [],
            jobTypes: data.jobTypes || data.jobTypesInterestedIn || data.location?.jobTypes || [],
          });
        }
      }
    } catch (error) {
      console.error("Error loading user data:", error);
    }
  };

  // ... resume from localStorage ...
  loadUserData();
  loadResumeFromFirestore();
}, [user?.email]);
```

So: **one Firestore read on `users/{uid}`**, plus resume from same doc and localStorage. Gmail is separate (API).

---

## 3. Data Flow: Save

### Which function

- **Profile save:** `handleSaveOnboardingData` (lines 446-579).

### Exact write path

1. **Document:** `userRef = doc(db, 'users', user.uid)` → **`users/{user.uid}`** (same as load).
2. **Method:** **`updateDoc(userRef, updates)`** (line 553). No `setDoc`; if the doc doesn’t exist, `updateDoc` will throw and the catch shows "Failed to save changes."
3. **Payload built as:**

```ts
// Lines 503-534 (conceptually)
const updates: any = {
  firstName: personalInfo.firstName,
  lastName: personalInfo.lastName,
  name: `${personalInfo.firstName} ${personalInfo.lastName}`.trim(),
  university: personalInfo.university,
  phone: personalInfo.phone,
  graduationMonth: academicInfo.graduationMonth,
  graduationYear: academicInfo.graduationYear,
  fieldOfStudy: academicInfo.fieldOfStudy,
  major: academicInfo.fieldOfStudy,
  currentDegree: academicInfo.currentDegree,
  degree: academicInfo.currentDegree,
  industriesOfInterest: careerInfo.industriesOfInterest,
  interests: careerInfo.industriesOfInterest,
  careerInterests: careerInfo.industriesOfInterest,
  preferredJobRole: careerInfo.preferredJobRole,
  preferredJobRolesOrTitles: careerInfo.preferredJobRole,
  preferredLocations: careerInfo.preferredLocations,
  preferredLocation: careerInfo.preferredLocations,
  jobTypes: careerInfo.jobTypes,
  jobTypesInterestedIn: careerInfo.jobTypes,
};
// Then merge existing nested objects:
const userDoc = await getDoc(userRef);
const existingData = userDoc.data();
updates.location = {
  ...(existingData?.location || {}),
  preferredLocation: careerInfo.preferredLocations,
  jobTypes: careerInfo.jobTypes,
  interests: careerInfo.industriesOfInterest,
  careerInterests: careerInfo.industriesOfInterest,
};
updates.academics = {
  ...(existingData?.academics || {}),
  graduationYear: academicInfo.graduationYear,
  graduationMonth: academicInfo.graduationMonth,
  degree: academicInfo.currentDegree,
  university: personalInfo.university,
};
// Strip undefined
Object.keys(updates).forEach(key => {
  if (updates[key] === undefined) delete updates[key];
});
await updateDoc(userRef, updates);
```

So: **same document as load** (`users/{uid}`), **only `updateDoc`**, and payload includes both top-level and nested `location` / `academics`.

### Confirmation

- Custom toast: "Changes saved!" / "Your settings have been updated" (`showSaveToast`).
- Plus `toast({ title: "Success", description: "Your profile information has been saved." })` (or "Preferences Updated" when intent changed).
- **No re-read from Firestore after save**; the form stays as the current React state.

### Other sections

- **Resume:** Writes in `handleResumeUpload` / resume delete: same doc `users/{uid}` with `updateDoc` (upload) or backend DELETE + local state clear (delete).
- **Gmail:** Backend only (OAuth, revoke). No profile doc write from Account Settings for Gmail.

---

## 4. State Management

- **Form state:** Plain `useState`: `personalInfo`, `academicInfo`, `careerInfo` (each one object). No React Hook Form or Formik.
- **Mapping from Firestore:** In `loadUserData`, `userSnap.data()` is mapped into the three state objects as in the code block above (with fallbacks like `data.academics?.graduationMonth`, etc.).
- **On typing:** Only local state updates (e.g. `setPersonalInfo({ ...personalInfo, firstName: e.target.value })`). No immediate Firestore write.
- **Field names:** Load reads both flat and nested (e.g. `data.graduationMonth` and `data.academics?.graduationMonth`). Save writes both flat and nested. So there is no strict mismatch, but the doc has redundant keys (flat + nested); that’s intentional for compatibility.

---

## 5. Why Saves Might Not Persist - Bug Hypotheses

### A. Document doesn’t exist

- **Behavior:** `updateDoc` requires the document to exist; otherwise it throws.
- **Effect:** User sees "Failed to save changes. Please try again." in the catch.
- **When:** New users get a doc in FirebaseAuthContext (or sign-in flow) via `setDoc`. If the doc was never created (e.g. different env, or doc deleted), save will fail with an error, not silent non-persistence.

### B. Wrong document path

- **Current:** Always `users/{user.uid}` with `user` from `useFirebaseAuth()`.
- **Risk:** If `user` were stale or from another account, we’d write to the wrong doc. No evidence in code; same `user.uid` is used for the save guard and the ref.

### C. Save not called

- **Button:** Single "Save changes" at bottom of Career section; `onClick={handleSaveOnboardingData}`. No conditional that would prevent the handler from running for profile fields.

### D. Errors swallowed

- **Preference API:** Failure is caught and only logged; save continues and Firestore `updateDoc` still runs.
- **Save path:** The Firestore `updateDoc` is in the same try; if it throws, catch runs and shows the error toast. So Firestore errors are not swallowed.

### E. Load overwriting after save

- **Effect deps:** `[user?.email]`. After a successful save we don’t change `user` or `user.email`, so the effect does not re-run and does not overwrite form state with stale data.
- **Caveat:** If something else (e.g. auth refresh, or parent remount) causes `user?.email` to change or the component to remount, the effect could run again and overwrite the form with whatever is in Firestore at that moment (e.g. if the user had not saved, or if there’s replication delay).

### F. Firestore security rules

- **Rule (abbreviated):** `allow update: if request.auth != null && request.auth.uid == userId && !('tier' in ...) && !('subscriptionTier' in ...) ...`
- **Payload:** Does not include `tier`, `subscriptionTier`, `stripeSubscriptionId`, `stripeCustomerId`, or `maxCredits`. So a normal profile save should be allowed. If a write were denied, the client would get a permission error and the catch would show "Failed to save changes."

### G. Backend overwriting

- **Order:** 1) Frontend calls `POST /api/users/update-preferences` (backend does a **partial** `user_ref.update(firestore_updates)` with `location.*` and `academics.*`). 2) Frontend then `getDoc` and `updateDoc` with the full profile.
- So the last write is always the frontend’s full `updates`. Backend only does a partial update first; it doesn’t overwrite the full doc after.

### H. Race or double-mount (e.g. Strict Mode)

- In dev, effects can run twice. If the user edits, then the effect runs again before they save, `loadUserData` would overwrite form state with current Firestore (old data). That can look like "my changes disappeared" or "didn’t persist" if they thought they had saved.
- After a successful save, a second run of the effect would load the new data from Firestore, which is correct.

### I. Load using wrong uid

- **Load:** Uses `auth.currentUser?.uid` inside the effect.
- **Save:** Uses `user.uid` from context.
- If auth and context ever disagree (e.g. brief moment after sign-out or token refresh), load could read one doc and save could write another. Unlikely but possible in theory; worth ensuring both use the same source (e.g. both `user.uid` when `user` is non-null).

### J. No create path on Account Settings

- If the user doc is missing, the page only calls `updateDoc`; it never calls `setDoc`. So the first save for a user without a doc will always fail with a Firestore error (and the toast). Fix would be: if `getDoc` shows the doc doesn’t exist, use `setDoc` (or create via backend) instead of `updateDoc`.

---

## 6. File Map

| File | Role |
|------|------|
| `connect-grow-hire/src/pages/AccountSettings.tsx` | Main page: sections, form state, load effect, `handleSaveOnboardingData`, resume upload/delete, Gmail UI, single Save button. |
| `connect-grow-hire/src/contexts/FirebaseAuthContext.tsx` | Provides `user` (uid, email, …). Creates `users/{uid}` with `setDoc` when doc doesn’t exist on sign-in / load. |
| `connect-grow-hire/src/lib/firebase.ts` | Exports `db`, `auth`, `storage` (Firestore, Auth, Storage). |
| `connect-grow-hire/src/services/api.ts` | `apiService.gmailStatus()`, `startGmailOAuth`, `revokeGmail`; no profile read/write. |
| `backend/app/routes/users.py` | `POST /api/users/update-preferences`: reads current user doc, does partial Firestore update (`location.*`, `academics.*`), detects intent change, invalidates caches. Does not create the user doc; returns 404 if doc missing. |
| `firestore.rules` | `users/{userId}`: read/update allowed when `request.auth.uid == userId` and update does not touch tier/subscription fields. |

**Suspicious / improvement points**

1. **Load vs save uid:** Load uses `auth.currentUser?.uid`, save uses `user.uid`. Prefer one source (e.g. `user.uid` when available) so load and save always target the same document.
2. **No loading state:** Profile form can show empty until Firestore load completes; users might think data is missing. Adding a short loading state could help.
3. **No setDoc fallback:** If `getDoc` in the save path finds no document, consider creating it with `setDoc` (or a backend create) instead of calling `updateDoc` and failing.
4. **Effect dependency:** `[user?.email]` can re-run when email is set; if you ever need to avoid re-loading on other auth changes, consider a more precise dependency (e.g. `user?.uid`).

---

## Summary

- **Structure:** One global "Save changes" for Personal + Academic + Career; resume and Gmail are separate, immediate actions.
- **Load:** Single Firestore read from `users/{uid}` (uid from `auth.currentUser` in the effect), mapped into `personalInfo`, `academicInfo`, `careerInfo`. Gmail from API.
- **Save:** Same doc `users/{user.uid}` via `updateDoc` with a full profile payload (flat + nested `location` and `academics`). Preference API is called first but does not block or replace this write.
- **Persistence bugs:** Most likely causes are: doc missing (updateDoc fails with error), or effect re-running and overwriting unsaved edits. Unifying uid source for load/save and adding a setDoc fallback (or backend create) when the doc is missing should reduce "changes don’t persist" reports.
