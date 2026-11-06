import hashlib
import hmac
import secrets
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from .models import OTPCode
from .sms import send_sms


class OTPError(Exception):
    pass


def _hash(phone, code):
    key = settings.SECRET_KEY.encode()
    return hmac.new(key, f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def request_otp(phone):
    now = timezone.now()
    window_start = now - timedelta(seconds=settings.OTP_REQUEST_WINDOW_SECONDS)
    if OTPCode.objects.filter(phone=phone, created_at__gte=window_start).count() >= settings.OTP_MAX_REQUESTS:
        raise OTPError("Too many codes requested. Please wait a few minutes and try again.")
    code = "".join(secrets.choice("0123456789") for _ in range(settings.OTP_LENGTH))
    OTPCode.objects.create(
        phone=phone,
        code_hash=_hash(phone, code),
        expires_at=now + timedelta(seconds=settings.OTP_TTL_SECONDS),
    )
    minutes = settings.OTP_TTL_SECONDS // 60
    if not send_sms(phone, f"Your verification code is {code}. It expires in {minutes} minutes. Do not share it."):
        raise OTPError("We could not send the SMS. Please try again.")


def verify_otp(phone, code):
    """Check the latest unused code. Wrong guesses burn attempts on that code."""
    otp = OTPCode.objects.filter(phone=phone, consumed_at__isnull=True).order_by("-created_at").first()
    if not otp or otp.expires_at < timezone.now():
        raise OTPError("Code expired or not found. Request a new one.")
    if otp.attempts >= settings.OTP_MAX_ATTEMPTS:
        raise OTPError("Too many wrong attempts. Request a new code.")
    otp.attempts += 1
    if not hmac.compare_digest(otp.code_hash, _hash(phone, str(code))):
        otp.save(update_fields=["attempts"])
        raise OTPError("Incorrect code.")
    otp.consumed_at = timezone.now()
    otp.save(update_fields=["attempts", "consumed_at"])
