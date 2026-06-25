"""Set or clear a per-uid feature flag override.

Wraps the `feature_flags/{flag_name}.overrides.{uid}` Firestore path used by
backend/app/services/feature_flags.py. Writes propagate within ~60s (the
in-memory cache TTL on the backend workers).

Usage:
    # Turn pdlInterestExpansion ON for one user (by email)
    python backend/scripts/set_feature_flag.py pdlInterestExpansion on --email=you@example.com

    # Turn it ON by UID
    python backend/scripts/set_feature_flag.py pdlInterestExpansion on <uid>

    # Turn OFF
    python backend/scripts/set_feature_flag.py pdlInterestExpansion off --email=you@example.com

    # Clear the override (let global/rollout decide)
    python backend/scripts/set_feature_flag.py pdlInterestExpansion clear --email=you@example.com

    # Read the current flag doc (no writes)
    python backend/scripts/set_feature_flag.py pdlInterestExpansion show
"""
import os
import sys
import json
from datetime import datetime, timezone

_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, ".."))
sys.path.insert(0, os.path.join(_SCRIPT_DIR, "..", ".."))

import firebase_admin
from firebase_admin import credentials, firestore, auth as fb_auth


VALID_ACTIONS = {"on", "off", "clear", "show"}


def get_db():
    if not firebase_admin._apps:
        cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if cred_path:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
        else:
            firebase_admin.initialize_app()
    return firestore.client()


def _resolve_uid(args: list[str]) -> str | None:
    """Accept --email=... or a positional UID."""
    for arg in args:
        if arg.startswith("--email="):
            email = arg.split("=", 1)[1].strip().lower()
            try:
                return fb_auth.get_user_by_email(email).uid
            except Exception as e:
                print(f"❌ Email lookup failed for {email}: {e}")
                return None
    # First non-flag arg after action.
    for arg in args:
        if not arg.startswith("--"):
            return arg
    return None


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(2)

    flag_name = sys.argv[1]
    action = sys.argv[2].lower()

    if action not in VALID_ACTIONS:
        print(f"❌ Unknown action {action!r}. Valid: {sorted(VALID_ACTIONS)}")
        sys.exit(2)

    db = get_db()
    flag_ref = db.collection("feature_flags").document(flag_name)

    if action == "show":
        doc = flag_ref.get()
        if not doc.exists:
            print(f"No flag doc at feature_flags/{flag_name} — uses code default.")
            sys.exit(0)
        data = doc.to_dict() or {}
        # Pretty-print, redact long override maps
        overrides = data.get("overrides") or {}
        printable = dict(data)
        printable["overrides"] = {
            f"{u[:8]}…": v for u, v in list(overrides.items())[:20]
        }
        if len(overrides) > 20:
            printable["overrides"]["_truncated"] = f"... +{len(overrides) - 20} more"
        print(f"feature_flags/{flag_name}:")
        print(json.dumps(printable, indent=2, default=str))
        return

    # on / off / clear all need a uid.
    uid = _resolve_uid(sys.argv[3:])
    if not uid:
        print("❌ Need a UID — pass as positional arg or --email=...")
        print(__doc__)
        sys.exit(2)

    # Read current doc so we don't clobber other overrides / rollout_pct.
    current = flag_ref.get()
    data = current.to_dict() if current.exists else {}
    overrides = dict(data.get("overrides") or {})

    if action == "on":
        overrides[uid] = True
    elif action == "off":
        overrides[uid] = False
    elif action == "clear":
        if uid not in overrides:
            print(f"No override set for {uid[:12]}… on {flag_name}. Nothing to clear.")
            return
        overrides.pop(uid)

    flag_ref.set(
        {
            "overrides": overrides,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        },
        merge=True,
    )

    # Show what's now in effect.
    print(f"✓ {flag_name}.overrides[{uid[:12]}…] = "
          f"{overrides.get(uid, '<cleared>')}")
    if action in ("on", "off"):
        print(f"  Will take effect on backend workers within ~60s (in-memory cache TTL).")
    print()
    print(f"Current override count for {flag_name}: {len(overrides)}")


if __name__ == "__main__":
    main()
