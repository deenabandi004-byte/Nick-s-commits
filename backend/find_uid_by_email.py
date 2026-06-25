#!/usr/bin/env python3
"""
Look up a Firebase user's UID (and tier/credits) by email.
Usage: python find_uid_by_email.py <email>
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from flask import Flask
from app.extensions import init_firebase, get_db


def find_uid_by_email(email: str) -> bool:
    app = Flask(__name__)
    init_firebase(app)

    db = get_db()
    if not db:
        print("❌ Failed to initialize Firestore")
        return False

    hits = list(
        db.collection('users').where('email', '==', email).limit(1).stream()
    )

    if hits:
        doc = hits[0]
        d = doc.to_dict()
        print(f"✅ Found Firestore user:")
        print(f"   UID:        {doc.id}")
        print(f"   Email:      {d.get('email')}")
        print(f"   Tier:       {d.get('subscriptionTier') or d.get('tier') or 'unknown'}")
        print(f"   Credits:    {d.get('credits')}")
        print(f"   MaxCredits: {d.get('maxCredits')}")
        return True

    # Fall back to Firebase Auth (user may exist in Auth but not in Firestore)
    from firebase_admin import auth as fb_auth
    try:
        user = fb_auth.get_user_by_email(email)
    except Exception as e:
        print(f"❌ No user found in Firestore or Firebase Auth: {e}")
        return False

    print(f"⚠️  Found in Firebase Auth only (no Firestore doc):")
    print(f"   UID:   {user.uid}")
    print(f"   Email: {user.email}")
    return True


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python find_uid_by_email.py <email>")
        sys.exit(1)

    email = sys.argv[1].strip()
    success = find_uid_by_email(email)
    sys.exit(0 if success else 1)
