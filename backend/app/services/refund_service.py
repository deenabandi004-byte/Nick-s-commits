"""
Refund request service — eligibility checks + Firestore doc creation + team alert email.

Policy (locked 2026-06-10):
  - Pro / Elite monthly + annual:     7-day window from first charge
  - Season Pass:                       14-day window WITH <50% month-1 credits-used cap
  - Top-up credit packs:               non-refundable (credits never expire)
  - Post-checkout upsell add-on:       falls under standard monthly window
  - Anti-abuse discretionary clause in ToS lets us deny obvious bad-faith requests

Approval flow (manual at this scale; automate later when volume justifies):
  1. User submits request via POST /api/billing/request-refund
  2. Eligibility checks run server-side; ineligible requests marked 'denied'
     with a reason, no team email sent
  3. Eligible requests written as 'pending' to refund_requests/{requestId}
  4. Resend email alert fires to REFUND_ALERT_EMAIL (env-configurable inbox)
  5. Team approves manually in Stripe dashboard → updates Firestore doc to 'completed'

This is a stub — automation lives behind the manual-approval gate by design. The
Firestore audit trail is the source of truth; Stripe refund execution is the
side-effect a human handles.
"""
import os
from datetime import datetime, timezone

import stripe

from app.config import (
    STRIPE_SECRET_KEY,
    STRIPE_PRICE_CATALOG,
    SEASON_PASS,
)
from app.extensions import get_db
from app.services.notification_adapter import send as notify_send, Channel


# Per-product refund window (days). 0 means the product is non-refundable.
REFUND_WINDOWS = {
    'pro_monthly':    7,
    'pro_annual':     7,
    'elite_monthly':  7,
    'elite_annual':   7,
    'season_pass':    14,
    'topup':          0,
    'upsell_addon':   7,    # the $10 Pro→Elite invoice item upsell
    'unknown':        7,    # default permissive when we can't classify the invoice
}

# Season Pass anti-abuse — deny refund if the user has burned more than this
# fraction of their month-1 credit allocation. Tuned to allow real evaluation
# (a student trying it for a week and finding it not for them) while blocking
# the "buy → drain credits → refund" pattern.
SEASON_PASS_CREDITS_USED_CAP_PCT = 0.50

# The $10 post-checkout upsell invoice item has no price reference — it's a raw
# InvoiceItem.create call. We classify it by amount instead.
UPSELL_ADDON_AMOUNT_CENTS = 1000


def infer_product_type(invoice: dict) -> str:
    """Best-effort classification of a Stripe invoice into our product types.

    Walks line items' price IDs against STRIPE_PRICE_CATALOG. Falls back to
    'unknown' when nothing matches — common at v1 since cofounders haven't
    wired every SKU yet.
    """
    lines = (invoice.get('lines') or {}).get('data') or []
    if not lines:
        return 'unknown'

    first_line = lines[0]
    # Stripe SDKs surface `price.id` two ways depending on API version.
    price_id = (
        (first_line.get('price') or {}).get('id')
        or ((first_line.get('pricing') or {}).get('price_details') or {}).get('price')
    )

    if not price_id:
        # No price reference → likely the $10 upsell add-on InvoiceItem.
        amount = first_line.get('amount', 0)
        if amount == UPSELL_ADDON_AMOUNT_CENTS:
            return 'upsell_addon'
        return 'unknown'

    # Walk subscription catalog (Pro + Elite × monthly/annual × student/list × stops)
    for tier in ('pro', 'elite'):
        tier_entry = STRIPE_PRICE_CATALOG.get(tier) or {}
        for cadence in ('monthly', 'annual'):
            cadence_entry = tier_entry.get(cadence) or {}
            for audience in ('student', 'list'):
                stops = cadence_entry.get(audience) or {}
                if isinstance(stops, dict) and price_id in stops.values():
                    return f'{tier}_{cadence}'

    # Season Pass + top-ups
    sp = (STRIPE_PRICE_CATALOG.get('season_pass') or {}).get('one_time') or {}
    if price_id in sp.values():
        return 'season_pass'

    topup = STRIPE_PRICE_CATALOG.get('topup') or {}
    if price_id in topup.values():
        return 'topup'

    return 'unknown'


def _compute_season_pass_credits_used_pct(user_data: dict) -> float:
    """Fraction of month-1 Season Pass credits the user has consumed. Bounded [0, 1]."""
    month1_alloc = SEASON_PASS['credits_per_month']
    if not month1_alloc:
        return 0.0
    current = max(0, user_data.get('credits', 0))
    max_cr = max(month1_alloc, user_data.get('maxCredits', month1_alloc))
    used = max(0, max_cr - current)
    return min(1.0, used / month1_alloc)


def check_refund_eligibility(invoice: dict, product_type: str, user_data: dict) -> dict:
    """Return {eligible, days_since_charge, window_days, reason, message, ...}."""
    window_days = REFUND_WINDOWS.get(product_type, REFUND_WINDOWS['unknown'])

    if window_days == 0:
        return {
            'eligible': False,
            'days_since_charge': None,
            'window_days': 0,
            'reason': 'non_refundable_product',
            'message': (
                'Top-up credit packs are non-refundable because the credits '
                'never expire — you can use them anytime.'
            ),
        }

    # Charge date — Stripe stores it on status_transitions.paid_at; fall back
    # to invoice.created for robustness against older API responses.
    paid_at_ts = (invoice.get('status_transitions') or {}).get('paid_at') or invoice.get('created') or 0
    paid_at = datetime.fromtimestamp(paid_at_ts, tz=timezone.utc)
    now = datetime.now(timezone.utc)
    days_since = (now - paid_at).total_seconds() / 86400

    if days_since > window_days:
        return {
            'eligible': False,
            'days_since_charge': round(days_since, 1),
            'window_days': window_days,
            'reason': 'outside_window',
            'message': (
                f'Refunds are available within {window_days} days of the charge. '
                f'It has been {round(days_since)} days since this one.'
            ),
        }

    # Season Pass anti-abuse cap
    if product_type == 'season_pass':
        used_pct = _compute_season_pass_credits_used_pct(user_data)
        if used_pct > SEASON_PASS_CREDITS_USED_CAP_PCT:
            return {
                'eligible': False,
                'days_since_charge': round(days_since, 1),
                'window_days': window_days,
                'reason': 'season_pass_credits_cap_exceeded',
                'credits_used_pct': round(used_pct * 100),
                'message': (
                    f'Season Pass refunds require that you have used less than '
                    f'{int(SEASON_PASS_CREDITS_USED_CAP_PCT * 100)}% of your month-1 credits. '
                    f'You have used {round(used_pct * 100)}%.'
                ),
            }

    return {
        'eligible': True,
        'days_since_charge': round(days_since, 1),
        'window_days': window_days,
        'reason': 'within_window',
        'message': 'Request received. We typically respond within 24 hours.',
    }


def create_refund_request(user_id: str, user_email: str, invoice_id: str, reason: str) -> dict:
    """Public entry point — validates eligibility, writes Firestore, fires team alert.

    Returns {ok, eligible, request_id, product_type, amount, message} on success
    or {ok: False, error: <code>} on failure.
    """
    if not STRIPE_SECRET_KEY:
        return {'ok': False, 'error': 'stripe_not_configured'}
    stripe.api_key = STRIPE_SECRET_KEY

    db = get_db()
    if not db:
        return {'ok': False, 'error': 'db_unavailable'}

    user_ref = db.collection('users').document(user_id)
    user_snap = user_ref.get()
    if not user_snap.exists:
        return {'ok': False, 'error': 'user_not_found'}
    user_data = user_snap.to_dict() or {}

    try:
        invoice = stripe.Invoice.retrieve(invoice_id)
        invoice_dict = invoice.to_dict() if hasattr(invoice, 'to_dict') else dict(invoice)
    except stripe.error.InvalidRequestError:
        return {'ok': False, 'error': 'invoice_not_found'}
    except stripe.error.StripeError as e:
        return {'ok': False, 'error': f'stripe_error: {e}'}

    # Authorization — invoice's customer must match the user's stored customer ID.
    invoice_customer = invoice_dict.get('customer')
    stored_customer = user_data.get('stripeCustomerId')
    if stored_customer and invoice_customer and invoice_customer != stored_customer:
        return {'ok': False, 'error': 'invoice_not_yours'}

    amount = (invoice_dict.get('amount_paid') or 0) / 100
    product_type = infer_product_type(invoice_dict)
    eligibility = check_refund_eligibility(invoice_dict, product_type, user_data)

    req_doc = {
        'userId': user_id,
        'userEmail': user_email,
        'invoiceId': invoice_id,
        'amount': amount,
        'productType': product_type,
        'reason': (reason or '').strip()[:1000],  # cap arbitrary input length
        'status': 'pending' if eligibility['eligible'] else 'denied',
        'requestedAt': datetime.utcnow(),
        'eligibilityChecks': eligibility,
    }
    if not eligibility['eligible']:
        req_doc['rejectionReason'] = eligibility.get('reason')

    add_result = db.collection('refund_requests').add(req_doc)
    request_id = add_result[1].id if add_result and len(add_result) > 1 else None

    # Team alert — best-effort, don't fail the user-facing request if email fails.
    if eligibility['eligible']:
        try:
            _send_team_alert(
                user_email=user_email,
                invoice_id=invoice_id,
                amount=amount,
                product_type=product_type,
                reason=req_doc['reason'],
                request_id=request_id,
            )
        except Exception as e:
            print(f"⚠️ Refund team alert email failed for request {request_id}: {e}")

    return {
        'ok': True,
        'eligible': eligibility['eligible'],
        'request_id': request_id,
        'product_type': product_type,
        'amount': amount,
        'message': eligibility.get('message'),
    }


def _send_team_alert(user_email: str, invoice_id: str, amount: float,
                     product_type: str, reason: str, request_id: str) -> None:
    """Send a Resend email to the team inbox so a human can approve in Stripe."""
    subject = f"[Refund Request] {user_email} — ${amount:.2f} ({product_type})"
    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; max-width: 560px; margin: 0 auto; padding: 20px; color: #0F172A;">
      <h2 style="margin-top:0;">Refund request received</h2>
      <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
        <tr><td style="padding: 6px 12px 6px 0; color: #64748B;">User</td><td style="padding: 6px 0;"><strong>{user_email}</strong></td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #64748B;">Amount</td><td style="padding: 6px 0;"><strong>${amount:.2f}</strong></td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #64748B;">Product</td><td style="padding: 6px 0;">{product_type}</td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #64748B;">Stripe Invoice</td><td style="padding: 6px 0;"><code>{invoice_id}</code></td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #64748B; vertical-align: top;">Reason</td><td style="padding: 6px 0;">{reason or '<em style="color: #94A3B8;">none provided</em>'}</td></tr>
        <tr><td style="padding: 6px 12px 6px 0; color: #64748B;">Firestore ID</td><td style="padding: 6px 0;"><code>{request_id}</code></td></tr>
      </table>
      <hr style="border: 0; border-top: 1px solid #E2E8F0; margin: 20px 0;">
      <p style="font-size: 13px; color: #475569; line-height: 1.55;">
        <strong>To approve:</strong> open Stripe dashboard → Invoices → find <code>{invoice_id}</code> → Refund.
        Then update the Firestore <code>refund_requests/{request_id}</code> doc status to <code>completed</code>.
      </p>
    </div>
    """
    text = (
        f"Refund request from {user_email} for ${amount:.2f} ({product_type}).\n"
        f"Invoice: {invoice_id}\n"
        f"Reason: {reason or '(none provided)'}\n"
        f"Firestore: refund_requests/{request_id}\n\n"
        f"Approve in Stripe dashboard, then update Firestore status to 'completed'."
    )

    recipient = os.getenv('REFUND_ALERT_EMAIL', 'support@offerloop.ai')
    notify_send(Channel.EMAIL, recipient, subject, html, text)
