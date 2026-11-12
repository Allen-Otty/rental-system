"""M-Pesa STK push (Safaricom Daraja). MPESA_BACKEND=mock is used in dev and tests."""
import base64
import uuid
from datetime import datetime

import requests
from django.conf import settings

mock_outbox = []  # tests inspect this


class MpesaError(Exception):
    pass


def _base():
    return "https://api.safaricom.co.ke" if settings.MPESA_ENV == "production" else "https://sandbox.safaricom.co.ke"


def _token():
    r = requests.get(f"{_base()}/oauth/v1/generate?grant_type=client_credentials",
                     auth=(settings.MPESA_CONSUMER_KEY, settings.MPESA_CONSUMER_SECRET), timeout=15)
    if r.status_code != 200 or "access_token" not in r.json():
        raise MpesaError("Could not authenticate with M-Pesa.")
    return r.json()["access_token"]


def callback_url():
    return f"{settings.MPESA_CALLBACK_BASE_URL}/api/v1/payments/mpesa/callback/{settings.MPESA_CALLBACK_SECRET}/"


def stk_push(phone_e164, amount, reference, description="Mjakez request"):
    """Send the PIN prompt to the customer's phone. Returns (merchant_request_id, checkout_request_id)."""
    msisdn = phone_e164.lstrip("+")
    if settings.MPESA_BACKEND == "mock":
        ids = ("mock-merchant-" + uuid.uuid4().hex[:10], "ws_CO_mock_" + uuid.uuid4().hex[:16])
        mock_outbox.append({"phone": msisdn, "amount": int(amount), "reference": reference, "ids": ids})
        return ids
    missing = [n for n in ("MPESA_CONSUMER_KEY", "MPESA_CONSUMER_SECRET", "MPESA_SHORTCODE", "MPESA_PASSKEY",
                           "MPESA_CALLBACK_BASE_URL", "MPESA_CALLBACK_SECRET") if not getattr(settings, n)]
    if missing:
        raise MpesaError("Payments are not configured.")
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    password = base64.b64encode(f"{settings.MPESA_SHORTCODE}{settings.MPESA_PASSKEY}{ts}".encode()).decode()
    body = {
        "BusinessShortCode": settings.MPESA_SHORTCODE, "Password": password, "Timestamp": ts,
        "TransactionType": settings.MPESA_TRANSACTION_TYPE, "Amount": int(amount), "PartyA": msisdn,
        "PartyB": settings.MPESA_PARTY_B or settings.MPESA_SHORTCODE, "PhoneNumber": msisdn,
        "CallBackURL": callback_url(), "AccountReference": reference[:12], "TransactionDesc": description[:13],
    }
    r = requests.post(f"{_base()}/mpesa/stkpush/v1/processrequest", json=body,
                      headers={"Authorization": f"Bearer {_token()}"}, timeout=20)
    data = r.json() if r.content else {}
    if r.status_code != 200 or str(data.get("ResponseCode")) != "0":
        raise MpesaError("M-Pesa could not send the payment prompt. Try again.")
    return data["MerchantRequestID"], data["CheckoutRequestID"]
