"""
Lifecycle email routes — cron tick, anonymous pricing-page capture, unsubscribe.

All three are public-with-validation rather than auth-gated:
  - /api/lifecycle/tick           secret-guarded (LIFECYCLE_CRON_SECRET)
  - /api/lifecycle/pricing-capture rate-limited by IP + email
  - /api/lifecycle/unsubscribe    HMAC-verified token

See `backend/app/services/lifecycle_emails.py` for the campaign logic itself.
"""
import os
import logging
from flask import Blueprint, request, jsonify, render_template_string

from app.services.lifecycle_emails import (
    process_all_pending_emails,
    capture_pricing_lead,
    verify_unsubscribe_token,
    is_unsubscribed,
    record_unsubscribe,
)

logger = logging.getLogger(__name__)

lifecycle_bp = Blueprint('lifecycle', __name__, url_prefix='/api/lifecycle')


@lifecycle_bp.route('/tick', methods=['POST', 'GET'])
def tick():
    """Cron entrypoint. Runs every sequence's time-based scan.

    Auth: shared secret in `X-Cron-Secret` header (or `?secret=` query string
    for dev). The Render cron job sets the same secret in its config.
    """
    expected = os.getenv('LIFECYCLE_CRON_SECRET', '')
    provided = request.headers.get('X-Cron-Secret') or request.args.get('secret', '')
    if not expected or not provided or provided != expected:
        return jsonify({'error': 'unauthorized'}), 401

    try:
        results = process_all_pending_emails()
    except Exception as e:
        logger.exception("lifecycle tick failed")
        return jsonify({'error': str(e)}), 500

    return jsonify({'ok': True, 'results': results}), 200


@lifecycle_bp.route('/pricing-capture', methods=['POST'])
def pricing_capture():
    """Email capture from the /pricing exit-intent popup.

    Body: { email: string, utm_source?: string }
    Returns: { ok, lead_id, returning }
    """
    data = request.get_json(silent=True) or {}
    email = (data.get('email') or '').strip().lower()
    if not email or '@' not in email or len(email) > 254:
        return jsonify({'error': 'invalid_email'}), 400

    utm_source = data.get('utm_source')
    result = capture_pricing_lead(email, utm_source=utm_source)
    if not result.get('ok'):
        return jsonify(result), 500

    return jsonify(result), 200


@lifecycle_bp.route('/unsubscribe', methods=['GET'])
def unsubscribe():
    """Token-authed unsubscribe. Called from List-Unsubscribe header + email
    footer links. Idempotent — confirms even if already unsubscribed."""
    email = (request.args.get('email') or '').strip().lower()
    token = request.args.get('token') or ''

    if not email or '@' not in email or not token:
        return _unsubscribe_page(success=False, message='Invalid unsubscribe link.'), 400

    if not verify_unsubscribe_token(email, token):
        return _unsubscribe_page(success=False, message='That link is invalid or has expired.'), 400

    if is_unsubscribed(email):
        return _unsubscribe_page(success=True, message='You\'re already unsubscribed. We won\'t email you again.'), 200

    record_unsubscribe(email)
    return _unsubscribe_page(success=True, message='You\'re unsubscribed. We won\'t email you again.'), 200


_UNSUB_HTML = """
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Offerloop — Unsubscribe</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="margin:0; padding:0; background:#FAFBFF; font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;">
  <div style="max-width:480px; margin:80px auto; padding:32px 28px; background:#fff; border:1px solid #E2E8F0; border-radius:14px; box-shadow:0 4px 12px rgba(15,37,69,0.06);">
    <div style="font-size:11px; font-weight:800; letter-spacing:0.18em; color:#6478B4; text-transform:uppercase; margin-bottom:14px;">Offerloop</div>
    <h1 style="font-family:'Libre Baskerville', Georgia, serif; font-size:28px; line-height:1.2; font-weight:400; color:#003262; margin:0 0 14px;">{{ headline }}</h1>
    <p style="font-size:14px; line-height:1.6; color:#475569;">{{ message }}</p>
    <p style="margin-top:24px;"><a href="https://offerloop.ai" style="color:#2563EB; text-decoration:none; font-weight:600;">← Back to offerloop.ai</a></p>
  </div>
</body>
</html>
"""


def _unsubscribe_page(success: bool, message: str):
    headline = 'You\'re unsubscribed' if success else 'Something went wrong'
    return render_template_string(_UNSUB_HTML, headline=headline, message=message)
