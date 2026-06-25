"""Bounce / Delivery Status Notification detection for Gmail messages.

Kept in a side-effect-free module so it can be imported from both the
gmail_webhook blueprint and one-shot scripts without pulling in the
whole Flask app graph.
"""

_BOUNCE_SENDER_PREFIXES = ("mailer-daemon@", "postmaster@")
_BOUNCE_SUBJECT_PHRASES = (
    "delivery status notification",
    "undelivered mail returned",
    "mail delivery failed",
    "mail delivery subsystem",
    "delivery failure",
    "failure notice",
    "returned mail",
    "could not be delivered",
)
_BOUNCE_SNIPPET_PHRASES = (
    "address not found",
    "wasn't delivered",
    "was not delivered",
    "couldn't be delivered",
    "could not be delivered",
    "user unknown",
    "no such user",
    "mailbox not found",
    "mailbox unavailable",
    "recipient address rejected",
    "550 5.1.1",
    "550 5.1.2",
)


def is_bounce_message(from_email: str, subject: str, snippet: str) -> bool:
    """Return True if this Gmail message looks like a bounce / DSN, not a real reply."""
    from_lower = (from_email or "").lower().strip()
    if any(from_lower.startswith(p) for p in _BOUNCE_SENDER_PREFIXES):
        return True
    subject_lower = (subject or "").lower()
    if any(p in subject_lower for p in _BOUNCE_SUBJECT_PHRASES):
        return True
    snippet_lower = (snippet or "").lower()
    if any(p in snippet_lower for p in _BOUNCE_SNIPPET_PHRASES):
        return True
    return False
