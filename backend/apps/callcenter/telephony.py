"""Voice provider. `mock` (dev/tests) records calls; `africastalking` places them.

The Africa's Talking branch has NOT been run against a live account. Test it in their sandbox first.
"""
import logging
import uuid

from django.conf import settings

logger = logging.getLogger(__name__)
outbox = []  # calls "placed" by the mock backend


def place_call(from_number, to_number):
    """Start an outbound call and return the provider's session id (or None on failure)."""
    backend = settings.TELEPHONY_BACKEND
    if backend == "mock":
        session = f"mock-{uuid.uuid4().hex[:12]}"
        outbox.append({"session": session, "from": from_number, "to": to_number})
        return session
    if backend == "africastalking":
        import requests

        resp = requests.post(
            "https://voice.africastalking.com/call",
            headers={"apiKey": settings.AT_API_KEY, "Accept": "application/json"},
            data={"username": settings.AT_USERNAME, "from": from_number, "to": to_number},
            timeout=10,
        )
        if resp.status_code not in (200, 201):
            logger.error("Voice call failed: %s %s", resp.status_code, resp.text[:200])
            return None
        entries = (resp.json() or {}).get("entries") or [{}]
        return entries[0].get("sessionId")
    raise ValueError(f"Unknown TELEPHONY_BACKEND {backend!r}")
