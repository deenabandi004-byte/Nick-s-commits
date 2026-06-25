# Contact Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user select records in My Network and share them by email to another Offerloop user, who accepts via a popup on next login; accepted records land in their spreadsheet with a green "imported" highlight.

**Architecture:** A new Flask blueprint `shares_bp` exposes create/list/accept/decline endpoints backed by a top-level Firestore collection `pendingShares`. Records are shared as client-side snapshots (uniform across contacts / companies / hiring managers). Accept is gated to Pro/Elite; free users get the upgrade modal and the share stays pending. Frontend changes touch the My Network action bar (cleanup + Share button + email dialog), add a green highlight for `sharedImport` records, and add an on-login pending-share popup with post-accept Draft/Inbox actions.

**Tech Stack:** Flask 3.0 (backend, pytest), React 18 + TypeScript + Vite (frontend, no test framework), Firestore.

## Global Constraints

- Backend routes live under `backend/app/routes/`, are thin, and call `get_db()` from `..extensions`.
- Auth: `@require_firebase_auth` sets `request.firebase_user['uid']`. `@require_tier(['pro','elite'])` must be written ABOVE `@require_firebase_auth` (executes inside-out) and sets `request.user_tier`.
- New blueprints MUST be imported and registered in `backend/wsgi.py`.
- User email is stored lowercased on the user doc field `email`; resolve recipient via `db.collection('users').where('email','==',email.strip().lower()).limit(1)`.
- Recipient subcollections by kind: `contacts` → `users/{uid}/contacts`, `companies` → `users/{uid}/manual_firms`, `hiringManagers` → `users/{uid}/recruiters`.
- `kind` is exactly one of: `contacts` | `companies` | `hiringManagers`.
- Frontend has NO test framework — frontend tasks verify manually via the running app (`cd connect-grow-hire && npm run dev`, http://localhost:8080).
- Error copy for unknown recipient is exactly: `Not an Offerloop account.`
- Imported records carry `sharedImport: true`; the green highlight color is `rgba(34,197,94,0.10)` (vs the existing blue `rgba(59,130,246,0.08)`).
- Backend tests: `cd backend && FLASK_ENV=testing pytest tests/<file> -v`. Fixtures `mock_firebase_user`, `mock_db`, `client` live in `backend/tests/conftest.py`.

---

### Task 1: `shares_bp` blueprint — create share endpoint

**Files:**
- Create: `backend/app/routes/shares.py`
- Modify: `backend/wsgi.py` (imports near line 15; registration near line 213, after `contacts_bp`)
- Test: `backend/tests/test_shares.py`

**Interfaces:**
- Produces:
  - Blueprint `shares_bp` with prefix `/api/shares`.
  - `POST /api/shares` — body `{ "toEmail": str, "kind": "contacts"|"companies"|"hiringManagers", "items": [ {..} ] }`. Returns `201 {"shareId": str, "toName": str}` on success; `404 {"error":"Not an Offerloop account."}` if no user; `400` on bad input.
  - Helper `_resolve_recipient(db, email) -> (uid, name) | (None, None)`.
  - `pendingShares` doc shape: `fromUid, fromName, toUid, toEmail, kind, items (list), status ("pending"), createdAt (ISO Z)`.

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_shares.py
import json
import pytest


def _auth_headers():
    return {"Authorization": "Bearer test-token"}


def test_create_share_unknown_recipient_returns_404(client, mock_firebase_user, mock_db):
    # No user matches the recipient email -> query returns empty
    mock_db.collection.return_value.where.return_value.limit.return_value.stream.return_value = iter([])

    resp = client.post(
        "/api/shares",
        data=json.dumps({"toEmail": "nobody@example.com", "kind": "contacts",
                         "items": [{"name": "A", "email": "a@x.com"}]}),
        content_type="application/json",
        headers=_auth_headers(),
    )

    assert resp.status_code == 404
    assert resp.get_json()["error"] == "Not an Offerloop account."
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_shares.py -v`
Expected: FAIL — 404 route not found (blueprint not registered yet).

- [ ] **Step 3: Write the blueprint**

```python
# backend/app/routes/shares.py
"""Contact / company / hiring-manager sharing between users."""
from datetime import datetime
from flask import Blueprint, request, jsonify

from ..extensions import require_firebase_auth, require_tier, get_db

shares_bp = Blueprint("shares", __name__, url_prefix="/api/shares")

VALID_KINDS = ("contacts", "companies", "hiringManagers")
_SUBCOLLECTION = {
    "contacts": "contacts",
    "companies": "manual_firms",
    "hiringManagers": "recruiters",
}


def _now_z():
    return datetime.utcnow().isoformat() + "Z"


def _resolve_recipient(db, email):
    """Return (uid, display_name) for a user with this email, else (None, None)."""
    email = (email or "").strip().lower()
    if not email:
        return None, None
    docs = list(
        db.collection("users").where("email", "==", email).limit(1).stream()
    )
    if not docs:
        return None, None
    data = docs[0].to_dict() or {}
    return docs[0].id, (data.get("name") or data.get("email") or "Someone")


@shares_bp.route("", methods=["POST"])
@require_firebase_auth
def create_share():
    db = get_db()
    from_uid = request.firebase_user["uid"]
    data = request.get_json(silent=True) or {}

    to_email = (data.get("toEmail") or "").strip().lower()
    kind = data.get("kind")
    items = data.get("items")

    if kind not in VALID_KINDS:
        return jsonify({"error": "Invalid kind."}), 400
    if not isinstance(items, list) or not items:
        return jsonify({"error": "No items to share."}), 400
    if not to_email:
        return jsonify({"error": "Recipient email required."}), 400

    # Sender's own profile (for fromName)
    me = db.collection("users").document(from_uid).get()
    me_data = me.to_dict() if me and me.exists else {}
    from_name = me_data.get("name") or me_data.get("email") or "Someone"

    if to_email == (me_data.get("email") or "").strip().lower():
        return jsonify({"error": "You can't share to yourself."}), 400

    to_uid, to_name = _resolve_recipient(db, to_email)
    if not to_uid:
        return jsonify({"error": "Not an Offerloop account."}), 404

    share = {
        "fromUid": from_uid,
        "fromName": from_name,
        "toUid": to_uid,
        "toEmail": to_email,
        "kind": kind,
        "items": items,
        "status": "pending",
        "createdAt": _now_z(),
    }
    ref = db.collection("pendingShares").add(share)
    share_id = ref[1].id
    return jsonify({"shareId": share_id, "toName": to_name}), 201
```

- [ ] **Step 4: Register the blueprint in wsgi.py**

In `backend/wsgi.py`, add the import near the other route imports (~line 15):

```python
from .app.routes.shares import shares_bp
```

And register it right after `contacts_bp` (~line 213):

```python
app.register_blueprint(contacts_bp)
app.register_blueprint(shares_bp)
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_shares.py -v`
Expected: PASS.

- [ ] **Step 6: Add a success-path test and run it**

```python
# append to backend/tests/test_shares.py
def test_create_share_success_writes_pending_doc(client, mock_firebase_user, mock_db):
    # Recipient lookup returns one user
    recip = type("Doc", (), {"id": "recip-uid", "to_dict": lambda self: {"email": "friend@x.com", "name": "Friend"}})()
    mock_db.collection.return_value.where.return_value.limit.return_value.stream.return_value = iter([recip])
    # add() returns (timestamp, ref) where ref.id is the new id
    fake_ref = type("Ref", (), {"id": "share-123"})()
    mock_db.collection.return_value.add.return_value = (None, fake_ref)

    resp = client.post(
        "/api/shares",
        data=json.dumps({"toEmail": "friend@x.com", "kind": "contacts",
                         "items": [{"name": "A", "email": "a@x.com"}]}),
        content_type="application/json",
        headers=_auth_headers(),
    )

    assert resp.status_code == 201
    body = resp.get_json()
    assert body["shareId"] == "share-123"
```

Run: `cd backend && FLASK_ENV=testing pytest tests/test_shares.py -v`
Expected: PASS (both tests). If `mock_db` chaining differs from these expectations, adjust the test stubs to match `conftest.py`'s mock style — do not change the route.

- [ ] **Step 7: Commit**

```bash
git add backend/app/routes/shares.py backend/wsgi.py backend/tests/test_shares.py
git commit -m "feat(shares): create-share endpoint + pendingShares model"
```

---

### Task 2: List pending shares endpoint

**Files:**
- Modify: `backend/app/routes/shares.py`
- Test: `backend/tests/test_shares.py`

**Interfaces:**
- Produces: `GET /api/shares/pending` → `200 {"shares": [ {id, fromName, kind, count, createdAt} ]}` for shares where `toUid == me AND status == "pending"`. `count` is `len(items)`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_shares.py
def test_list_pending_returns_only_my_pending(client, mock_firebase_user, mock_db):
    share_doc = type("Doc", (), {
        "id": "s1",
        "to_dict": lambda self: {"fromName": "Pat", "kind": "contacts",
                                  "items": [{}, {}, {}], "status": "pending",
                                  "createdAt": "2026-06-18T00:00:00Z"},
    })()
    (mock_db.collection.return_value.where.return_value
        .where.return_value.stream.return_value) = iter([share_doc])

    resp = client.get("/api/shares/pending", headers=_auth_headers())
    assert resp.status_code == 200
    shares = resp.get_json()["shares"]
    assert len(shares) == 1
    assert shares[0]["count"] == 3
    assert shares[0]["fromName"] == "Pat"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_shares.py::test_list_pending_returns_only_my_pending -v`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Add the endpoint**

```python
# add to backend/app/routes/shares.py
@shares_bp.route("/pending", methods=["GET"])
@require_firebase_auth
def list_pending():
    db = get_db()
    uid = request.firebase_user["uid"]
    docs = (
        db.collection("pendingShares")
        .where("toUid", "==", uid)
        .where("status", "==", "pending")
        .stream()
    )
    out = []
    for d in docs:
        data = d.to_dict() or {}
        out.append({
            "id": d.id,
            "fromName": data.get("fromName", "Someone"),
            "kind": data.get("kind", "contacts"),
            "count": len(data.get("items") or []),
            "createdAt": data.get("createdAt"),
        })
    return jsonify({"shares": out}), 200
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_shares.py -v`
Expected: PASS (all tests).

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/shares.py backend/tests/test_shares.py
git commit -m "feat(shares): list pending shares endpoint"
```

---

### Task 3: Accept + decline endpoints (tier-gated import)

**Files:**
- Modify: `backend/app/routes/shares.py`
- Test: `backend/tests/test_shares.py`

**Interfaces:**
- Consumes: `_SUBCOLLECTION`, `_now_z`, `VALID_KINDS` from Task 1.
- Produces:
  - `POST /api/shares/<share_id>/accept` — Pro/Elite only. On success copies `items` into the recipient's subcollection (per `kind`), stamps each with `createdAt=_now_z()`, `sharedImport=True`, `status` default, marks the share `accepted`, returns `200 {"imported": int, "kind": str}`. Free tier is rejected by `@require_tier` with `403 {"error":"Upgrade required", ...}` — the frontend treats 403 as "show upgrade modal, keep pending".
  - `POST /api/shares/<share_id>/decline` — any tier; sets `status="declined"`, returns `200 {"ok": true}`.

- [ ] **Step 1: Write the failing test**

```python
# append to backend/tests/test_shares.py
def test_decline_marks_status(client, mock_firebase_user, mock_db):
    share = type("Doc", (), {
        "exists": True,
        "id": "s1",
        "to_dict": lambda self: {"toUid": "test-uid", "status": "pending",
                                  "kind": "contacts", "items": []},
    })()
    mock_db.collection.return_value.document.return_value.get.return_value = share

    resp = client.post("/api/shares/s1/decline", headers=_auth_headers())
    assert resp.status_code == 200
    assert resp.get_json()["ok"] is True
```

(Note: `mock_firebase_user` fixture sets uid `test-uid`; confirm the value in `conftest.py` and align the `toUid` above to match it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_shares.py::test_decline_marks_status -v`
Expected: FAIL — 404 (route missing).

- [ ] **Step 3: Add both endpoints**

```python
# add to backend/app/routes/shares.py

def _load_owned_pending(db, uid, share_id):
    """Return (ref, data) for a pending share owned by uid, else (None, None)."""
    ref = db.collection("pendingShares").document(share_id)
    snap = ref.get()
    if not snap or not snap.exists:
        return None, None
    data = snap.to_dict() or {}
    if data.get("toUid") != uid or data.get("status") != "pending":
        return None, None
    return ref, data


@shares_bp.route("/<share_id>/accept", methods=["POST"])
@require_tier(["pro", "elite"])
@require_firebase_auth
def accept_share(share_id):
    db = get_db()
    uid = request.firebase_user["uid"]
    ref, data = _load_owned_pending(db, uid, share_id)
    if not ref:
        return jsonify({"error": "Share not found."}), 404

    kind = data.get("kind")
    items = data.get("items") or []
    sub = _SUBCOLLECTION.get(kind)
    if not sub:
        return jsonify({"error": "Invalid share."}), 400

    dest = db.collection("users").document(uid).collection(sub)
    batch = db.batch()
    for item in items:
        doc = dict(item)
        doc["sharedImport"] = True
        doc["createdAt"] = _now_z()
        doc.setdefault("status", "Not Contacted")
        batch.set(dest.document(), doc)
    batch.set(ref, {"status": "accepted"}, merge=True)
    batch.commit()

    return jsonify({"imported": len(items), "kind": kind}), 200


@shares_bp.route("/<share_id>/decline", methods=["POST"])
@require_firebase_auth
def decline_share(share_id):
    db = get_db()
    uid = request.firebase_user["uid"]
    ref, data = _load_owned_pending(db, uid, share_id)
    if not ref:
        return jsonify({"error": "Share not found."}), 404
    ref.set({"status": "declined"}, merge=True)
    return jsonify({"ok": True}), 200
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && FLASK_ENV=testing pytest tests/test_shares.py -v`
Expected: PASS. (If `mock_db.batch()` is unstubbed, the accept path isn't exercised by the decline test — that's fine; the decline test must pass. Add a batch stub only if you also write an accept test.)

- [ ] **Step 5: Commit**

```bash
git add backend/app/routes/shares.py backend/tests/test_shares.py
git commit -m "feat(shares): tier-gated accept + decline endpoints"
```

---

### Task 4: Frontend API service methods

**Files:**
- Modify: `connect-grow-hire/src/services/api.ts`

**Interfaces:**
- Consumes: backend endpoints from Tasks 1–3; existing `getAuthHeaders()` and `makeRequest()` on the api service class.
- Produces (methods on the api service singleton):
  - `shareRecords(payload: { toEmail: string; kind: ShareKind; items: any[] }): Promise<{ shareId: string; toName: string } | { error: string }>`
  - `getPendingShares(): Promise<{ shares: PendingShare[] } | { error: string }>`
  - `acceptShare(id: string): Promise<{ imported: number; kind: ShareKind } | { error: string; current_tier?: string }>`
  - `declineShare(id: string): Promise<{ ok: true } | { error: string }>`
  - Exported types `ShareKind` and `PendingShare`.

- [ ] **Step 1: Add the types and methods**

Add near the top-level type exports in `api.ts`:

```typescript
export type ShareKind = "contacts" | "companies" | "hiringManagers";

export interface PendingShare {
  id: string;
  fromName: string;
  kind: ShareKind;
  count: number;
  createdAt?: string;
}
```

Add these methods inside the api service class (mirror the `generateAndDraftEmails` pattern — `getAuthHeaders()` then `makeRequest`):

```typescript
async shareRecords(payload: { toEmail: string; kind: ShareKind; items: any[] }) {
  const headers = await this.getAuthHeaders();
  return this.makeRequest('/shares', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
}

async getPendingShares(): Promise<{ shares: PendingShare[] } | { error: string }> {
  const headers = await this.getAuthHeaders();
  return this.makeRequest('/shares/pending', { method: 'GET', headers });
}

async acceptShare(id: string) {
  const headers = await this.getAuthHeaders();
  return this.makeRequest(`/shares/${id}/accept`, { method: 'POST', headers });
}

async declineShare(id: string) {
  const headers = await this.getAuthHeaders();
  return this.makeRequest(`/shares/${id}/decline`, { method: 'POST', headers });
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `cd connect-grow-hire && npx tsc --noEmit`
Expected: no new errors referencing `api.ts`. (Pre-existing errors elsewhere are out of scope.)

- [ ] **Step 3: Commit**

```bash
git add connect-grow-hire/src/services/api.ts
git commit -m "feat(shares): frontend api methods for share/accept/decline"
```

---

### Task 5: My Network action bar cleanup + Share dialog

**Files:**
- Modify: `connect-grow-hire/src/pages/MyNetworkPage.tsx`

**Context (current code):**
- Refresh buttons rendered at lines ~3083, ~3121, ~3153: `{renderToolButton(<RefreshCw className={FB_ICON} />, "Refresh", handleRefresh, false)}` — remove all three.
- `BulkDeleteButton` (lines ~2976–2986) currently renders `<Trash2 .../> Delete selected ({activeSelection.size})` — change to icon-only.
- `activeSelection` (Set<string>), `clearActiveSelection()`, and per-tab data arrays `people`, `companies`, `managers` already exist.

**Interfaces:**
- Consumes: `apiService.shareRecords` (Task 4), `activeSelection`, `activeTab`, `people`/`companies`/`managers`.
- Produces: a Share dialog gated on `shareOpen` state; a `Share selected` button + a top share icon; selected rows mapped to `items` by `activeTab`.

- [ ] **Step 1: Remove the three Refresh buttons**

Delete each of these lines (one near 3083, 3121, 3153):

```typescript
{renderToolButton(<RefreshCw className={FB_ICON} />, "Refresh", handleRefresh, false)}
```

Then delete the now-unused `handleRefresh` (lines ~2864–2867) and the `refreshNonce` state if nothing else references it (search `refreshNonce` first; if a data-load effect depends on it, keep the state but remove the button only). Remove the `RefreshCw` import if no longer used.

- [ ] **Step 2: Make the delete button icon-only**

Replace the `BulkDeleteButton` JSX (lines ~2976–2986) with:

```typescript
const BulkDeleteButton = activeSelection.size > 0 ? (
  <Button
    variant="outline"
    size="sm"
    onClick={() => setConfirmOpen(true)}
    title="Delete selected"
    aria-label="Delete selected"
    className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 px-2"
  >
    <Trash2 className="h-4 w-4" />
  </Button>
) : null;
```

- [ ] **Step 3: Add share state + handler + item mapping**

Near the other selection state (lines ~2716–2720), add:

```typescript
const [shareOpen, setShareOpen] = useState(false);
const [shareEmail, setShareEmail] = useState("");
const [shareError, setShareError] = useState<string | null>(null);
const [sharing, setSharing] = useState(false);
```

Add a mapper that snapshots the currently-selected rows for the active tab (place near `handleExportCsv`, ~line 2872):

```typescript
const shareKind = (): ShareKind =>
  activeTab === "companies" ? "companies" : activeTab === "managers" ? "hiringManagers" : "contacts";

const selectedItems = (): any[] => {
  const ids = activeSelection;
  if (activeTab === "companies") {
    return companies.filter((c) => ids.has(c.id)).map((c) => ({
      name: c.name, industry: c.industry, hq: c.hq, alumni: c.alumni ?? 0,
    }));
  }
  if (activeTab === "managers") {
    return managers.filter((m) => ids.has(m.id)).map((m) => ({
      firstName: (m.name || "").split(" ")[0] || "", lastName: (m.name || "").split(" ").slice(1).join(" "),
      name: m.name, email: m.email, linkedinUrl: m.linkedinUrl, jobTitle: m.title,
      company: m.company, roleHiringFor: m.roleHiringFor, location: m.location,
    }));
  }
  return people.filter((p) => ids.has(p.id)).map((p) => ({
    firstName: (p.name || "").split(" ")[0] || "", lastName: (p.name || "").split(" ").slice(1).join(" "),
    name: p.name, email: p.email, linkedinUrl: p.linkedinUrl, jobTitle: p.role,
    company: p.company, college: p.school, location: p.location,
  }));
};

const handleShareSubmit = async () => {
  setShareError(null);
  const email = shareEmail.trim().toLowerCase();
  if (!email) { setShareError("Enter an email."); return; }
  setSharing(true);
  try {
    const res: any = await apiService.shareRecords({ toEmail: email, kind: shareKind(), items: selectedItems() });
    if (res?.error) { setShareError(res.error); return; }
    setShareOpen(false);
    setShareEmail("");
    clearActiveSelection();
    toast({ title: `Shared with ${res.toName || email}` });
  } catch (e: any) {
    setShareError(e?.message || "Something went wrong.");
  } finally {
    setSharing(false);
  }
};
```

Add the `ShareKind` import to the `api` import line, and `Share2` to the lucide-react import.

- [ ] **Step 4: Add the Share Selected button + top share icon**

Next to `BulkDeleteButton` usage in the action bar, add a Share button that appears when rows are selected:

```typescript
{activeSelection.size > 0 && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => setShareOpen(true)}
    className="gap-1.5"
  >
    <Share2 className="h-3.5 w-3.5" />
    Share selected
  </Button>
)}
```

And the grey top-row share icon (in the top actions row, alongside Export). It opens the same dialog but only when something is selected:

```typescript
{renderToolButton(
  <Share2 className={`${FB_ICON} text-muted-foreground`} />,
  "Share",
  () => { if (activeSelection.size > 0) setShareOpen(true); },
  false,
)}
```

- [ ] **Step 5: Add the Share dialog**

Next to the bulk-delete `AlertDialog` (line ~3263), add:

```typescript
<AlertDialog open={shareOpen} onOpenChange={(o) => !sharing && setShareOpen(o)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Share {activeSelection.size} {bulkSubject}</AlertDialogTitle>
      <AlertDialogDescription>
        Enter the Offerloop account email to share with. They'll get a popup to accept.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <div className="py-2">
      <input
        type="email"
        autoFocus
        value={shareEmail}
        onChange={(e) => { setShareEmail(e.target.value); setShareError(null); }}
        placeholder="name@example.com"
        className="w-full rounded-md border px-3 py-2 text-sm"
      />
      {shareError && <p className="mt-2 text-sm text-red-600">{shareError}</p>}
    </div>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={sharing}>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={(e) => { e.preventDefault(); handleShareSubmit(); }}
        disabled={sharing}
      >
        {sharing ? "Sharing…" : "Share"}
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 6: Verify in the running app**

Run: `cd connect-grow-hire && npm run dev` and open http://localhost:8080/my-network/people.
Expected: no Refresh button on any tab; delete is a red trash icon only; selecting rows shows "Share selected"; clicking it opens the email dialog; submitting an unknown email shows `Not an Offerloop account.` inline; a valid Offerloop email shows the "Shared with …" toast and clears selection. Repeat on Companies and Hiring Managers tabs.

- [ ] **Step 7: Commit**

```bash
git add connect-grow-hire/src/pages/MyNetworkPage.tsx
git commit -m "feat(shares): My Network action bar cleanup + share dialog"
```

---

### Task 6: Green highlight for imported (sharedImport) records

**Files:**
- Modify: `connect-grow-hire/src/pages/MyNetworkPage.tsx`

**Context:** Row background is computed per tab:
- People `rowBaseBg` (~lines 694–699), Companies inline bg (~lines 1282–1284), Managers `rowBaseBg` (~lines 1885–1889). All return the blue `rgba(59,130,246,0.08)` for recent rows.

The data mappers must also carry the `sharedImport` flag from Firestore. People mapping is at ~line 2473 (`firebaseApi.getContacts`), companies at `getManualFirms` (~2544), managers at `getRecruiters` (~2551).

**Interfaces:**
- Consumes: `sharedImport: boolean` field written by Task 3.
- Produces: rows where `sharedImport === true` render with green `rgba(34,197,94,0.10)`, taking precedence over the blue recency highlight.

- [ ] **Step 1: Carry the flag in the row mappers**

In the contacts mapper (~2473) add to the mapped object: `sharedImport: !!c.sharedImport,`. Do the same in the managers mapper (`sharedImport: !!r.sharedImport,`) and the manual-firms mapping that feeds `companies` (`sharedImport: !!f.sharedImport,`). Add `sharedImport?: boolean` to the `PersonRow`, `ManagerRow`, and company row TypeScript types.

- [ ] **Step 2: Apply green in People `rowBaseBg`**

```typescript
const rowBaseBg = (row: PersonRow, idx: number): string => {
  if (row.sharedImport) return "rgba(34,197,94,0.10)";
  if (focusId && row.id === focusId) return "rgba(59,130,246,0.14)";
  const ts = row.createdAt ? Date.parse(row.createdAt) : 0;
  if (highlightSince && ts > highlightSince) return "rgba(59,130,246,0.08)";
  return idx % 2 === 1 ? "var(--paper-2, #FAFBFF)" : "white";
};
```

- [ ] **Step 3: Apply green in Companies inline bg**

```typescript
background: row.sharedImport
  ? "rgba(34,197,94,0.10)"
  : (highlightSince && (row.recencyTs || 0) > highlightSince)
    ? "rgba(59,130,246,0.08)"
    : (i % 2 === 1 ? "var(--paper-2, #FAFBFF)" : "white"),
```

- [ ] **Step 4: Apply green in Managers `rowBaseBg`**

```typescript
const rowBaseBg = (row: ManagerRow, i: number): string => {
  if (row.sharedImport) return "rgba(34,197,94,0.10)";
  const ts = row.dateAdded ? Date.parse(row.dateAdded) : 0;
  if (highlightSince && ts > highlightSince) return "rgba(59,130,246,0.08)";
  return i % 2 === 1 ? "var(--paper-2, #FAFBFF)" : "white";
};
```

- [ ] **Step 5: Verify in the running app**

After accepting a share (Task 7) as a Pro/Elite account, the imported rows in My Network render with a faint green background instead of blue. (Can also be verified by manually setting `sharedImport: true` on a contact doc in Firestore.)

- [ ] **Step 6: Commit**

```bash
git add connect-grow-hire/src/pages/MyNetworkPage.tsx
git commit -m "feat(shares): green highlight for imported records"
```

---

### Task 7: On-login pending-share popup + accept flow

**Files:**
- Create: `connect-grow-hire/src/components/shares/PendingShareModal.tsx`
- Modify: `connect-grow-hire/src/App.tsx` (mount a check component in the auth provider tree, near `DashboardPrefetch` ~line 579)

**Interfaces:**
- Consumes: `apiService.getPendingShares`, `acceptShare`, `declineShare` (Task 4); `useFirebaseAuth()` (for `user`, `user.tier`, `user.needsOnboarding`); existing `UpgradeModal` (`@/components/gates/UpgradeModal`); `useNavigate`, `useToast`.
- Produces: a self-contained `<PendingShareModal />` that, when mounted for an authed onboarded user, fetches pending shares and renders one at a time.

- [ ] **Step 1: Create the modal component**

```tsx
// connect-grow-hire/src/components/shares/PendingShareModal.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useFirebaseAuth } from "@/contexts/FirebaseAuthContext";
import { UpgradeModal } from "@/components/gates/UpgradeModal";
import { apiService, type PendingShare } from "@/services/api";

const kindNoun = (k: PendingShare["kind"], n: number) =>
  (k === "companies" ? "company" : k === "hiringManagers" ? "hiring manager" : "contact") + (n === 1 ? "" : "s");

export default function PendingShareModal() {
  const { user, isLoading } = useFirebaseAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [queue, setQueue] = useState<PendingShare[]>([]);
  const [busy, setBusy] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [imported, setImported] = useState<{ count: number } | null>(null);

  const isPro = user?.tier === "pro" || user?.tier === "elite";

  useEffect(() => {
    if (isLoading || !user || user.needsOnboarding) return;
    let cancelled = false;
    apiService.getPendingShares().then((res: any) => {
      if (cancelled || !res?.shares?.length) return;
      setQueue(res.shares);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [isLoading, user?.uid, user?.needsOnboarding]);

  const current = queue[0];
  const dismissCurrent = () => setQueue((q) => q.slice(1));

  const onAccept = async () => {
    if (!current) return;
    if (!isPro) { setShowUpgrade(true); return; } // keep pending, push upgrade
    setBusy(true);
    try {
      const res: any = await apiService.acceptShare(current.id);
      if (res?.error) {
        if (res.current_tier === "free") { setShowUpgrade(true); return; }
        toast({ title: res.error, variant: "destructive" });
        return;
      }
      setImported({ count: res.imported ?? current.count });
      dismissCurrent();
    } finally { setBusy(false); }
  };

  const onDecline = async () => {
    if (!current) return;
    setBusy(true);
    try { await apiService.declineShare(current.id); } finally { setBusy(false); dismissCurrent(); }
  };

  return (
    <>
      <AlertDialog open={!!current && !showUpgrade} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {current?.fromName} shared {current?.count} {current && kindNoun(current.kind, current.count)} with you
            </AlertDialogTitle>
            <AlertDialogDescription>
              Accept to add them to your network. {isPro ? "" : "Receiving shared contacts is a Pro feature."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={onDecline}>Decline</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); onAccept(); }}>
              {busy ? "…" : "Accept"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpgradeModal
        open={showUpgrade}
        onOpenChange={setShowUpgrade}
        feature="Shared contacts"
        reason="Upgrade to Pro to accept contacts shared with you."
        currentTier={user?.tier || "free"}
      />

      {/* Post-accept banner */}
      <AlertDialog open={!!imported} onOpenChange={() => setImported(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{imported?.count} added to your network</AlertDialogTitle>
            <AlertDialogDescription>Draft emails to them, or open them in your inbox.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="outline" onClick={() => { setImported(null); navigate("/my-network/people"); }}>
              View in network
            </Button>
            <Button onClick={() => { setImported(null); navigate("/outbox"); }}>View in inbox</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
```

(Confirm `UpgradeModal`'s exact prop names against `connect-grow-hire/src/components/gates/UpgradeModal.tsx` and adjust if they differ — the explore reported `open`, `onOpenChange`, `feature`, `reason`, `currentTier`.)

- [ ] **Step 2: Mount it in App.tsx**

Import at the top of `App.tsx`:

```typescript
import PendingShareModal from "@/components/shares/PendingShareModal";
```

Mount it as a sibling of `DashboardPrefetch` inside the authed provider tree (must be inside `<FirebaseAuthProvider>` and inside the Router so `useNavigate` works):

```tsx
<DashboardPrefetch />
<PendingShareModal />
```

- [ ] **Step 3: Verify typecheck**

Run: `cd connect-grow-hire && npx tsc --noEmit`
Expected: no new errors in the new file or `App.tsx`.

- [ ] **Step 4: Verify end-to-end in the running app**

Two accounts (A = sender, B = recipient). With backend + frontend running:
1. As A, share contacts to B's email → "Shared with …" toast.
2. Reload as B (Pro/Elite): popup "A shared N contacts with you". Accept → "N added" banner with View in network / View in inbox. Imported rows show green in My Network.
3. As a free B: Accept opens the UpgradeModal and the share stays pending (still appears on next reload).
4. Decline removes the popup and the share does not reappear.

- [ ] **Step 5: Commit**

```bash
git add connect-grow-hire/src/components/shares/PendingShareModal.tsx connect-grow-hire/src/App.tsx
git commit -m "feat(shares): on-login pending-share popup + accept flow"
```

---

## Self-Review Notes

- **Spec coverage:** Part A → Task 5; Part B → Tasks 1, 4, 5; Part C → Task 1; Part D → Tasks 2, 3, 7; Part E → Tasks 6, 7. All covered.
- **Free-tier path:** `@require_tier` returns 403; frontend `PendingShareModal` intercepts both the pre-check (`!isPro`) and the 403 (`current_tier === "free"`) to show `UpgradeModal` while leaving the share `pending` — matches decision A.
- **Unknown recipient:** Task 1 returns exactly `Not an Offerloop account.`; surfaced inline by Task 5.
- **Open verification points (flagged inline, not placeholders):** exact `mock_db` chaining in `conftest.py`; `UpgradeModal` prop names; `manual_firms` field names from `getManualFirms`. Each has a concrete default in the code and a one-line note to confirm against the real file during implementation.
