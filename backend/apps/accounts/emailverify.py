"""Signed, expiring email-confirmation links.

The token carries the user id, the email it was sent to and a fragment of the current password hash,
so it stops working if the email or password changes (this blocks "pre-registration" of someone
else's address followed by a later confirmation).
"""
import logging

from django.conf import settings
from django.core import signing
from django.core.mail import send_mail

log = logging.getLogger(__name__)
SALT = "mjakez.email-confirm"


def make_token(user):
    return signing.dumps({"uid": user.pk, "email": user.email, "pw": user.password[-12:]}, salt=SALT)


def read_token(token):
    """Return the payload, or raise signing.BadSignature / SignatureExpired."""
    return signing.loads(token, salt=SALT, max_age=settings.EMAIL_CONFIRM_MAX_AGE_HOURS * 3600)


def send_confirmation(user):
    link = f"{settings.FRONTEND_URL}/confirm-email?token={make_token(user)}"
    hours = settings.EMAIL_CONFIRM_MAX_AGE_HOURS
    body = (
        f"Hello {user.full_name or ''},\n\n"
        f"Confirm your email to activate your Mjakez account:\n{link}\n\n"
        f"The link works for {hours} hours. If you did not sign up, ignore this email.\n"
    )
    try:
        send_mail("Confirm your Mjakez account", body, settings.DEFAULT_FROM_EMAIL, [user.email])
        return True
    except Exception:  # never fail signup because the mail server hiccuped; user can resend
        log.exception("Could not send confirmation email to user %s", user.pk)
        return False
