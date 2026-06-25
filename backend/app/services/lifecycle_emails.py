"""
Lifecycle email service — five sequences via the existing Resend integration.

Voice: founder-direct. These emails are "from" Rylan @ Offerloop. Plain English,
no fake testimonials, no fabricated PDFs, no "5-10x more outreach" stats we
can't back up. Per the standing project rule, no fake numbers or fake social
proof anywhere. Only real things — real product features, real personalization
(saved contact counts pulled from Firestore), real coupon codes that fail
gracefully when the underlying Stripe coupon isn't wired yet.

Sequences:
  1. Pricing visit abandonment (anonymous, popup-driven — currently dormant
     since the PricingExitPopup is removed). Day 0 / Day 2 / Day 5.
  2. Checkout abandonment (signed-in). Hour 1 / Day 1.
  3. Trial ending. 48h / 24h / at-expiry.
  4. Low credits. Fired real-time from auth deduct path.
  5. Win-back. 30 days post-cancel.

Architecture:
  - Idempotency via `lifecycle_email_log` Firestore collection (composite key).
  - Rate limit = 2 lifecycle emails / user / 7 days.
  - HMAC-signed unsubscribe tokens.
  - Cron entry = /api/lifecycle/tick (secret-guarded).
  - Discount codes appear inline only when STRIPE_COUPONS env vars are populated.
"""
import hmac
import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.config import STRIPE_COUPONS
from app.extensions import get_db
from app.services.notification_adapter import send as notify_send, Channel

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

MAX_LIFECYCLE_EMAILS_PER_7_DAYS = 2

PUBLIC_BASE_URL = os.getenv('PUBLIC_BASE_URL', 'https://offerloop.ai')

# Who the emails are signed by. Single-name to keep the voice personal — these
# are coming from a co-founder talking to a student, not a brand.
SIGNATURE_NAME = os.getenv('LIFECYCLE_SIGNATURE_NAME', 'Rylan')


def _unsubscribe_secret() -> str:
    return os.getenv('LIFECYCLE_UNSUBSCRIBE_SECRET') or os.getenv('FLASK_SECRET', 'dev')


# ---------------------------------------------------------------------------
# Idempotency + rate-limit helpers
# ---------------------------------------------------------------------------

def _log_key(user_or_lead_id: str, campaign: str, step: str) -> str:
    return f"{user_or_lead_id}:{campaign}:{step}"


def already_sent(user_or_lead_id: str, campaign: str, step: str) -> bool:
    db = get_db()
    if not db:
        return False
    key = _log_key(user_or_lead_id, campaign, step)
    snap = db.collection('lifecycle_email_log').document(key).get()
    return snap.exists


def _rate_limit_exceeded(user_or_lead_id: str) -> bool:
    db = get_db()
    if not db:
        return False
    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
    q = (db.collection('lifecycle_email_log')
            .where('recipient_id', '==', user_or_lead_id)
            .where('sent_at', '>=', seven_days_ago)
            .limit(MAX_LIFECYCLE_EMAILS_PER_7_DAYS + 1))
    try:
        count = sum(1 for _ in q.stream())
    except Exception as e:
        logger.warning(f"rate-limit query failed for {user_or_lead_id}: {e}")
        return False
    return count >= MAX_LIFECYCLE_EMAILS_PER_7_DAYS


def _record_send(user_or_lead_id: str, campaign: str, step: str, recipient_email: str) -> None:
    db = get_db()
    if not db:
        return
    key = _log_key(user_or_lead_id, campaign, step)
    db.collection('lifecycle_email_log').document(key).set({
        'recipient_id': user_or_lead_id,
        'recipient_email': recipient_email,
        'campaign': campaign,
        'step': step,
        'sent_at': datetime.now(timezone.utc),
    })


# ---------------------------------------------------------------------------
# Unsubscribe tokens
# ---------------------------------------------------------------------------

def make_unsubscribe_token(email: str) -> str:
    secret = _unsubscribe_secret().encode('utf-8')
    msg = email.lower().encode('utf-8')
    return hmac.new(secret, msg, hashlib.sha256).hexdigest()


def verify_unsubscribe_token(email: str, token: str) -> bool:
    return hmac.compare_digest(make_unsubscribe_token(email), token)


def is_unsubscribed(email: str) -> bool:
    db = get_db()
    if not db:
        return False
    snap = db.collection('lifecycle_unsubscribes').document(email.lower()).get()
    return snap.exists


def record_unsubscribe(email: str) -> None:
    db = get_db()
    if not db:
        return
    db.collection('lifecycle_unsubscribes').document(email.lower()).set({
        'email': email.lower(),
        'unsubscribed_at': datetime.now(timezone.utc),
    })


# ---------------------------------------------------------------------------
# Send funnel (idempotency, rate limit, unsubscribe gate, logging)
# ---------------------------------------------------------------------------

def _send_lifecycle_email(
    *,
    user_or_lead_id: str,
    recipient_email: str,
    campaign: str,
    step: str,
    subject: str,
    body_paragraphs: list[str],
    cta_label: Optional[str] = None,
    cta_url: Optional[str] = None,
) -> dict:
    if not recipient_email or '@' not in recipient_email:
        return {'sent': False, 'reason': 'invalid_email'}
    if already_sent(user_or_lead_id, campaign, step):
        return {'sent': False, 'reason': 'already_sent'}
    if is_unsubscribed(recipient_email):
        return {'sent': False, 'reason': 'unsubscribed'}
    if _rate_limit_exceeded(user_or_lead_id):
        return {'sent': False, 'reason': 'rate_limited'}

    token = make_unsubscribe_token(recipient_email)
    unsub_url = f"{PUBLIC_BASE_URL}/api/lifecycle/unsubscribe?email={recipient_email}&token={token}"
    headers = {'List-Unsubscribe': f"<{unsub_url}>"}

    html = _render_html(body_paragraphs, cta_label, cta_url, unsub_url)
    text = _render_text(body_paragraphs, cta_label, cta_url, unsub_url)

    result = notify_send(Channel.EMAIL, recipient_email, subject, html, text, headers)
    if getattr(result, 'success', False):
        _record_send(user_or_lead_id, campaign, step, recipient_email)
        return {'sent': True, 'reason': 'ok'}
    return {'sent': False, 'reason': getattr(result, 'error_code', 'send_failed')}


def _render_html(paragraphs: list[str], cta_label: Optional[str], cta_url: Optional[str], unsub_url: str) -> str:
    """Plain email styling — no eyebrows, no gradient buttons, no serif drama.
    Reads like a normal email someone would actually send."""
    body = ''.join(
        f'<p style="margin:0 0 14px; font-size:15px; line-height:1.6; color:#1F2937;">{p}</p>'
        for p in paragraphs
    )
    cta_html = ''
    if cta_label and cta_url:
        cta_html = (
            f'<p style="margin:18px 0 14px; font-size:15px; line-height:1.6;">'
            f'<a href="{cta_url}" style="color:#2563EB; font-weight:600;">{cta_label}</a>'
            f'</p>'
        )
    signature_html = (
        f'<p style="margin:20px 0 6px; font-size:15px; line-height:1.6; color:#1F2937;">'
        f'— {SIGNATURE_NAME}</p>'
    )
    footer = (
        '<p style="margin-top:28px; padding-top:14px; border-top:1px solid #E5E7EB;'
        ' font-size:11px; color:#9CA3AF; line-height:1.55;">'
        f'<a href="{unsub_url}" style="color:#9CA3AF;">Unsubscribe</a>'
        '</p>'
    )
    return (
        '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',sans-serif;'
        ' max-width:540px; margin:0 auto; padding:24px 22px; color:#1F2937;">'
        + body + cta_html + signature_html + footer +
        '</div>'
    )


def _render_text(paragraphs: list[str], cta_label: Optional[str], cta_url: Optional[str], unsub_url: str) -> str:
    """Plain-text fallback — actual line breaks, no HTML."""
    lines = paragraphs[:]
    if cta_label and cta_url:
        lines.append(f"{cta_label}: {cta_url}")
    lines.append(f"— {SIGNATURE_NAME}")
    lines.append("")
    lines.append(f"Unsubscribe: {unsub_url}")
    return "\n\n".join(lines)


# ---------------------------------------------------------------------------
# Helpers used inside the sequences
# ---------------------------------------------------------------------------

def _count_saved_contacts(uid: str) -> int:
    """Best-effort count for personalization. Caps at 1000 results."""
    db = get_db()
    if not db:
        return 0
    try:
        ref = db.collection('users').document(uid).collection('contacts').limit(1000)
        return sum(1 for _ in ref.stream())
    except Exception:
        return 0


def _real_coupon(key: str) -> Optional[str]:
    """Return the human-facing coupon code only when the underlying Stripe
    coupon ID env var is actually populated. Per the no-fake-numbers rule,
    we never advertise a code that won't work at checkout."""
    coupon_ids = {
        'pricing_recapture': ('STAYHIRED', STRIPE_COUPONS.get('pricing_recapture')),
        'checkout_recovery': ('WARMINTRO', STRIPE_COUPONS.get('checkout_recovery')),
        'winback': ('WELCOMEBACK', STRIPE_COUPONS.get('winback')),
    }
    name, sid = coupon_ids.get(key, (None, None))
    return name if (name and sid) else None


# ---------------------------------------------------------------------------
# Sequence 1 — Pricing visit abandonment (anonymous leads from capture endpoint)
# ---------------------------------------------------------------------------

def process_pricing_leads() -> dict:
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    sent = {'day_0': 0, 'day_2': 0, 'day_5': 0}
    now = datetime.now(timezone.utc)

    for snap in db.collection('lifecycle_leads').where('source', '==', 'pricing_exit').stream():
        lead = snap.to_dict() or {}
        lead_id = snap.id
        email = lead.get('email')
        captured_at = lead.get('captured_at')
        if not email or not captured_at:
            continue
        hours_since = (now - captured_at).total_seconds() / 3600

        # Day 0
        if hours_since < 0.5 and not already_sent(lead_id, 'pricing_abandon', 'day_0'):
            res = _send_lifecycle_email(
                user_or_lead_id=lead_id,
                recipient_email=email,
                campaign='pricing_abandon',
                step='day_0',
                subject="saw you on the pricing page",
                body_paragraphs=[
                    f"Hey — {SIGNATURE_NAME} here, I help run Offerloop.",
                    "Saw you stopped by the pricing page. No script, no PDF — just want to flag what you'd actually get if you tried it.",
                    "Offerloop is built for college students recruiting for internships and full-time roles. You search for alumni / hiring managers / recruiters at companies you want, we pull their verified email and draft a first-touch tied to your background, and the pipeline view tracks who's replied. Pro is $14.99/mo with a .edu and the trial is 14 days, no credit card.",
                    "If anything's confusing or you want to ask whether the product makes sense for your situation, just reply.",
                ],
                cta_label="Start the free trial",
                cta_url=f'{PUBLIC_BASE_URL}/signin?mode=signup&utm_source=lifecycle&utm_campaign=pricing_abandon&utm_content=day_0',
            )
            if res.get('sent'):
                sent['day_0'] += 1

        # Day 2
        elif 36 < hours_since < 60 and not already_sent(lead_id, 'pricing_abandon', 'day_2'):
            res = _send_lifecycle_email(
                user_or_lead_id=lead_id,
                recipient_email=email,
                campaign='pricing_abandon',
                step='day_2',
                subject="fwiw on the trial",
                body_paragraphs=[
                    "One honest thing about the trial:",
                    "Most students don't get a lot out of Offerloop unless they actually send 10–15 emails during the 14-day window. If you sign up but don't end up doing real outreach, you'll think the product's not doing much.",
                    "So if you're not actively recruiting right now, it's fine to wait. If you are, the trial will tell you pretty quickly whether it fits how you work.",
                ],
                cta_label="Try Pro free for 14 days",
                cta_url=f'{PUBLIC_BASE_URL}/signin?mode=signup&utm_source=lifecycle&utm_campaign=pricing_abandon&utm_content=day_2',
            )
            if res.get('sent'):
                sent['day_2'] += 1

        # Day 5 — final note
        elif 108 < hours_since < 156 and not already_sent(lead_id, 'pricing_abandon', 'day_5'):
            promo = _real_coupon('checkout_recovery') or _real_coupon('pricing_recapture')
            paragraphs = [
                "Won't keep emailing you. Last note from me.",
            ]
            if promo:
                paragraphs.append(
                    f"If price is the sticking point: code <strong>{promo}</strong> takes 20% off your first month of Pro. Works for the next 7 days."
                )
            paragraphs.append(
                "Otherwise, if you ever want to chat about whether Offerloop makes sense for what you're recruiting for, just reply with your year and what you're targeting. Good luck either way."
            )
            res = _send_lifecycle_email(
                user_or_lead_id=lead_id,
                recipient_email=email,
                campaign='pricing_abandon',
                step='day_5',
                subject="last note",
                body_paragraphs=paragraphs,
                cta_label=("See Pro" if promo else None),
                cta_url=(f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=pricing_abandon&utm_content=day_5' if promo else None),
            )
            if res.get('sent'):
                sent['day_5'] += 1

    return {'ok': True, 'sent': sent}


# ---------------------------------------------------------------------------
# Sequence 2 — Checkout abandonment
# ---------------------------------------------------------------------------

def process_checkout_abandons() -> dict:
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    sent = {'hour_1': 0, 'day_1': 0}
    now = datetime.now(timezone.utc)

    for snap in db.collection('users').where('checkoutAbandonedAt', '!=', None).stream():
        user = snap.to_dict() or {}
        uid = snap.id
        email = user.get('email')
        abandoned_at = user.get('checkoutAbandonedAt')
        if not email or not abandoned_at:
            continue
        if user.get('subscriptionTier') in ('pro', 'elite'):
            continue  # converted later via a separate flow
        hours_since = (now - abandoned_at).total_seconds() / 3600

        # Hour 1 — quick "did something break?"
        if 0.5 < hours_since < 4 and not already_sent(uid, 'checkout_abandon', 'hour_1'):
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='checkout_abandon',
                step='hour_1',
                subject="did checkout break?",
                body_paragraphs=[
                    f"Hey — {SIGNATURE_NAME} from Offerloop.",
                    "Saw you started checkout for Pro but didn't finish. If something actually went sideways on our end (Stripe weirdness, card got declined, redirect failed), reply and tell me what happened. I can usually sort it out fast.",
                    "If you just second-guessed it, no worries. The trial is 14 days with no credit card required — that's probably the better starting point anyway.",
                ],
                cta_label="Pick up where you left off",
                cta_url=f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=checkout_abandon&utm_content=hour_1',
            )
            if res.get('sent'):
                sent['hour_1'] += 1

        # Day 1 — soft follow-up
        elif 20 < hours_since < 30 and not already_sent(uid, 'checkout_abandon', 'day_1'):
            promo = _real_coupon('checkout_recovery')
            paragraphs = [
                "Following up once on the checkout from yesterday. Then I'll leave you alone.",
                "If you want to actually try Pro before paying, the 14-day trial doesn't ask for a card. That's the right move if you're on the fence — the product either clicks for how you work or it doesn't, and you'll know inside a week.",
            ]
            if promo:
                paragraphs.append(
                    f"If you do want to commit now, code <strong>{promo}</strong> takes 20% off your first month."
                )
            paragraphs.append("Reply if anything about how the product works is unclear.")
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='checkout_abandon',
                step='day_1',
                subject="no rush",
                body_paragraphs=paragraphs,
                cta_label="Start free trial",
                cta_url=f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=checkout_abandon&utm_content=day_1',
            )
            if res.get('sent'):
                sent['day_1'] += 1

    return {'ok': True, 'sent': sent}


# ---------------------------------------------------------------------------
# Sequence 3 — Trial ending
# ---------------------------------------------------------------------------

def process_trial_endings() -> dict:
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    sent = {'h48': 0, 'h24': 0, 'expired': 0}
    now = datetime.now(timezone.utc)

    for snap in db.collection('users').where('trialActive', '==', True).stream():
        user = snap.to_dict() or {}
        uid = snap.id
        email = user.get('email')
        ends_at = user.get('trialEndsAt')
        if not email or not ends_at:
            continue
        if hasattr(ends_at, 'tzinfo') and ends_at.tzinfo is None:
            ends_at = ends_at.replace(tzinfo=timezone.utc)
        hours_left = (ends_at - now).total_seconds() / 3600
        contacts_count = _count_saved_contacts(uid)

        # 48h before
        if 24 < hours_left < 52 and not already_sent(uid, 'trial_ending', 'h48'):
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='trial_ending',
                step='h48',
                subject="2 days left on your Pro trial",
                body_paragraphs=[
                    f"Quick heads up — your Pro trial ends in 2 days.",
                    f"You've saved {contacts_count} {'contact' if contacts_count == 1 else 'contacts'} so far. When the trial ends you drop to Free, so those contacts and their drafts stay visible, but you lose the things that found them — hiring-manager search, firm search, bulk drafting, and unlimited Coffee Chat Prep.",
                    "If Pro's been useful, $14.99/mo with a .edu locks in that student price for life. If it hasn't been useful, no charge — you never gave us a card.",
                ],
                cta_label="Keep Pro",
                cta_url=f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=trial_ending&utm_content=h48',
            )
            if res.get('sent'):
                sent['h48'] += 1

        # 24h before
        elif 0 < hours_left < 28 and not already_sent(uid, 'trial_ending', 'h24'):
            res = _send_lifecycle_email(
                user_or_lead_id=uid,
                recipient_email=email,
                campaign='trial_ending',
                step='h24',
                subject="trial ends tomorrow",
                body_paragraphs=[
                    "Last reminder — Pro trial ends tomorrow.",
                    f"{contacts_count} {'contact' if contacts_count == 1 else 'contacts'} saved. Pick a plan if Pro's been working, or do nothing and you'll drop to Free automatically.",
                ],
                cta_label="Pick a plan",
                cta_url=f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=trial_ending&utm_content=h24',
            )
            if res.get('sent'):
                sent['h24'] += 1

    # Post-expiry note — sweep users whose status flipped to 'expired' recently
    cutoff = now - timedelta(hours=2)
    for snap in db.collection('users').where('subscriptionStatus', '==', 'expired').stream():
        user = snap.to_dict() or {}
        uid = snap.id
        email = user.get('email')
        ends_at = user.get('trialEndsAt')
        if not email or not ends_at:
            continue
        if hasattr(ends_at, 'tzinfo') and ends_at.tzinfo is None:
            ends_at = ends_at.replace(tzinfo=timezone.utc)
        if ends_at < cutoff or ends_at > now:
            continue
        if already_sent(uid, 'trial_ending', 'expired'):
            continue
        res = _send_lifecycle_email(
            user_or_lead_id=uid,
            recipient_email=email,
            campaign='trial_ending',
            step='expired',
            subject="you're on Free now",
            body_paragraphs=[
                "Your Pro trial ended. You're on the Free plan now.",
                "Your saved contacts and drafts are still there. The things that need Pro — hiring-manager search, firm search, bulk drafting, Coffee Chat Prep beyond the 3 lifetime free ones — are locked.",
                "If you change your mind, Pro's in account settings.",
            ],
            cta_label=None,
            cta_url=None,
        )
        if res.get('sent'):
            sent['expired'] += 1

    return {'ok': True, 'sent': sent}


# ---------------------------------------------------------------------------
# Sequence 4 — Low credits (fired real-time from auth.deduct_credits_atomic)
# ---------------------------------------------------------------------------

def notify_low_credits(uid: str, credits_remaining: int, max_credits: int) -> dict:
    db = get_db()
    if not db:
        return {'sent': False, 'reason': 'db_unavailable'}
    snap = db.collection('users').document(uid).get()
    if not snap.exists:
        return {'sent': False, 'reason': 'user_not_found'}
    user = snap.to_dict() or {}
    email = user.get('email')
    if not email:
        return {'sent': False, 'reason': 'no_email'}

    # Reset per calendar month so the same threshold doesn't spam each billing cycle
    month = datetime.now(timezone.utc).strftime('%Y-%m')
    step = f"low_{month}"

    pct_used = round(100 - (credits_remaining / max(max_credits, 1)) * 100)
    rough_emails = credits_remaining // 10  # 10 cr / email at current math

    return _send_lifecycle_email(
        user_or_lead_id=uid,
        recipient_email=email,
        campaign='low_credits',
        step=step,
        subject=f"{credits_remaining} credits left",
        body_paragraphs=[
            f"Quick FYI — you've used about {pct_used}% of your credits this month. {credits_remaining} left, which is roughly {rough_emails} more {'email' if rough_emails == 1 else 'emails'} before your monthly reset.",
            "Two options if you need more before then:",
            "Top up — one-time credit pack, never expires. Or upgrade to Elite if you're going to keep burning at this pace.",
        ],
        cta_label="See options",
        cta_url=f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=low_credits',
    )


# ---------------------------------------------------------------------------
# Sequence 5 — Win-back (30 days post-cancel)
# ---------------------------------------------------------------------------

def process_winbacks() -> dict:
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    sent_count = 0
    now = datetime.now(timezone.utc)
    thirty_two_days_ago = now - timedelta(days=32)
    thirty_days_ago = now - timedelta(days=30)

    q = (db.collection('users')
            .where('canceledAt', '>=', thirty_two_days_ago)
            .where('canceledAt', '<=', thirty_days_ago))
    for snap in q.stream():
        user = snap.to_dict() or {}
        uid = snap.id
        email = user.get('email')
        if not email:
            continue
        if user.get('subscriptionTier') in ('pro', 'elite'):
            continue  # already re-subscribed
        if already_sent(uid, 'winback', 'day_30'):
            continue

        contacts_count = _count_saved_contacts(uid)
        promo = _real_coupon('winback')
        paragraphs = [
            f"Hey — {SIGNATURE_NAME} again.",
            f"Been about a month since you canceled. Just flagging: your {contacts_count} saved {'contact' if contacts_count == 1 else 'contacts'} and the drafts you built are still in your Offerloop account, right where you left them.",
        ]
        if promo:
            paragraphs.append(
                f"If you ever want to pick recruiting back up, code <strong>{promo}</strong> takes 50% off your first month back. Works for the next 14 days."
            )
        paragraphs.append(
            "Also: if something specifically pushed you to cancel that we could actually fix, I'd want to know. Hit reply."
        )

        res = _send_lifecycle_email(
            user_or_lead_id=uid,
            recipient_email=email,
            campaign='winback',
            step='day_30',
            subject="your contacts are still here",
            body_paragraphs=paragraphs,
            cta_label=("Come back" if promo else None),
            cta_url=(f'{PUBLIC_BASE_URL}/pricing?utm_source=lifecycle&utm_campaign=winback&utm_content=day_30' if promo else None),
        )
        if res.get('sent'):
            sent_count += 1

    return {'ok': True, 'sent_count': sent_count}


# ---------------------------------------------------------------------------
# Cron entry — fires all four time-based sequences
# ---------------------------------------------------------------------------

def process_all_pending_emails() -> dict:
    return {
        'pricing_abandon': process_pricing_leads(),
        'checkout_abandon': process_checkout_abandons(),
        'trial_ending': process_trial_endings(),
        'winback': process_winbacks(),
    }


# ---------------------------------------------------------------------------
# Lead capture
# ---------------------------------------------------------------------------

def capture_pricing_lead(email: str, utm_source: Optional[str] = None) -> dict:
    if not email or '@' not in email:
        return {'ok': False, 'error': 'invalid_email'}
    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    docs = list(db.collection('lifecycle_leads').where('email', '==', email.lower()).limit(1).stream())
    if docs:
        lead_id = docs[0].id
        db.collection('lifecycle_leads').document(lead_id).update({
            'captured_at': datetime.now(timezone.utc),
            'utm_source': utm_source or docs[0].to_dict().get('utm_source'),
        })
        return {'ok': True, 'lead_id': lead_id, 'returning': True}

    lead_id = secrets.token_urlsafe(12)
    db.collection('lifecycle_leads').document(lead_id).set({
        'email': email.lower(),
        'source': 'pricing_exit',
        'utm_source': utm_source,
        'captured_at': datetime.now(timezone.utc),
    })
    return {'ok': True, 'lead_id': lead_id, 'returning': False}
