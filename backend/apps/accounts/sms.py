"""SMS delivery. `console` (dev/tests) records messages; `africastalking` sends them."""
import logging

from django.conf import settings

logger = logging.getLogger(__name__)

# Messages "sent" by the console backend. Tests read OTPs from here.
outbox = []


def send_sms(phone, message):
    backend = settings.SMS_BACKEND
    if backend == "console":
        outbox.append({"to": phone, "message": message})
        logger.warning("SMS to %s: %s", phone, message)
        return True
    if backend == "africastalking":
        import requests

        resp = requests.post(
            "https://api.africastalking.com/version1/messaging",
            headers={"apiKey": settings.AT_API_KEY, "Accept": "application/json"},
            data={
                "username": settings.AT_USERNAME,
                "to": phone,
                "message": message,
                **({"from": settings.AT_SENDER_ID} if settings.AT_SENDER_ID else {}),
            },
            timeout=10,
        )
        ok = resp.status_code in (200, 201)
        if not ok:
            logger.error("Africa's Talking SMS failed: %s %s", resp.status_code, resp.text[:200])
        return ok
    raise ValueError(f"Unknown SMS_BACKEND {backend!r}")
