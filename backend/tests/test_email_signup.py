import time

import pytest
from django.core import mail
from rest_framework.test import APIClient

from apps.accounts.models import User

SIGNUP = {"email": "Amina@Example.com", "password": "Str0ng-pass-2026!", "phone": "0712345678",
          "full_name": "Amina Otieno", "role": "tenant", "contact_consent": True}


def _token_from_outbox():
    body = mail.outbox[-1].body
    return body.split("token=")[1].split()[0]


def _signup(client, **over):
    return client.post("/api/v1/auth/signup/", {**SIGNUP, **over}, format="json")


def test_signup_creates_inactive_account_and_emails_a_link(client):
    r = _signup(client)
    assert r.status_code == 201 and "access" not in r.data
    u = User.objects.get(email="amina@example.com")
    assert u.is_active is False and u.is_email_verified is False
    assert u.phone == "+254712345678"
    assert u.contact_consent is True and u.contact_consent_at is not None
    assert u.password != SIGNUP["password"] and u.password.startswith(("pbkdf2", "argon2", "bcrypt"))
    assert len(mail.outbox) == 1 and mail.outbox[0].to == ["amina@example.com"]
    assert "/confirm-email?token=" in mail.outbox[0].body


def test_cannot_log_in_until_email_confirmed(client):
    _signup(client)
    ok_pw = client.post("/api/v1/auth/login/", {"identifier": "amina@example.com", "password": SIGNUP["password"]})
    assert ok_pw.status_code == 403 and ok_pw.data["code"] == "email_not_confirmed"
    bad_pw = client.post("/api/v1/auth/login/", {"identifier": "amina@example.com", "password": "nope"})
    assert bad_pw.status_code == 401  # wrong password reveals nothing about confirmation state


def test_confirming_the_link_activates_the_account(client):
    _signup(client)
    token = _token_from_outbox()
    assert client.post("/api/v1/auth/email/confirm/", {"token": token}).status_code == 200
    u = User.objects.get(email="amina@example.com")
    assert u.is_active and u.is_email_verified
    r = client.post("/api/v1/auth/login/", {"identifier": "amina@example.com", "password": SIGNUP["password"]})
    assert r.status_code == 200 and r.data["user"]["is_email_verified"] is True
    # confirming again is harmless
    assert client.post("/api/v1/auth/email/confirm/", {"token": token}).status_code == 200


def test_tampered_or_expired_links_are_rejected(client, monkeypatch):
    _signup(client)
    token = _token_from_outbox()
    assert client.post("/api/v1/auth/email/confirm/", {"token": token[:-3] + "xyz"}).status_code == 400
    real = time.time
    monkeypatch.setattr(time, "time", lambda: real() + 49 * 3600)
    r = client.post("/api/v1/auth/email/confirm/", {"token": token})
    assert r.status_code == 400 and r.data["code"] == "expired"
    assert User.objects.get(email="amina@example.com").is_active is False


def test_consent_is_required(client):
    assert _signup(client, contact_consent=False).status_code == 400
    assert not User.objects.filter(email="amina@example.com").exists()


def test_weak_password_and_bad_role_rejected(client):
    assert _signup(client, password="12345678").status_code == 400
    assert _signup(client, role="admin").status_code == 400
    assert _signup(client, phone="12").status_code == 400


def test_duplicate_email_or_phone_rejected_once_confirmed(client):
    _signup(client)
    client.post("/api/v1/auth/email/confirm/", {"token": _token_from_outbox()})
    dup_email = _signup(client, phone="0799000111")
    assert dup_email.status_code == 400 and "email" in dup_email.data
    dup_phone = _signup(client, email="other@example.com")
    assert dup_phone.status_code == 400 and "phone" in dup_phone.data


def test_signing_up_again_before_confirming_replaces_details_and_kills_old_link(client):
    _signup(client)
    old = _token_from_outbox()
    assert _signup(client, password="An0ther-pass-2026!", full_name="Amina O").status_code == 201
    assert User.objects.filter(email="amina@example.com").count() == 1
    assert client.post("/api/v1/auth/email/confirm/", {"token": old}).status_code == 400
    assert client.post("/api/v1/auth/email/confirm/", {"token": _token_from_outbox()}).status_code == 200
    assert client.post("/api/v1/auth/login/", {"identifier": "amina@example.com", "password": "An0ther-pass-2026!"}).status_code == 200
    assert client.post("/api/v1/auth/login/", {"identifier": "amina@example.com", "password": SIGNUP["password"]}).status_code == 401


def test_resend_is_generic_and_rate_limited(client):
    unknown = client.post("/api/v1/auth/email/resend/", {"email": "ghost@example.com"})
    assert unknown.status_code == 200 and len(mail.outbox) == 0
    _signup(client)
    mail.outbox.clear()
    a = client.post("/api/v1/auth/email/resend/", {"email": "amina@example.com"})
    b = client.post("/api/v1/auth/email/resend/", {"email": "amina@example.com"})
    assert a.status_code == b.status_code == 200 and a.data == b.data == unknown.data
    assert len(mail.outbox) == 1


def test_phone_otp_cannot_create_accounts_any_more(client):
    from apps.accounts import sms

    client.post("/api/v1/auth/otp/request/", {"phone": "0712345678"})
    code = sms.outbox[-1]["message"].split("code is ")[1][:6]
    r = client.post("/api/v1/auth/otp/verify/", {"phone": "0712345678", "code": code})
    assert r.status_code == 400 and not User.objects.filter(phone="+254712345678").exists()


def test_email_cannot_be_changed_without_confirmation(tenant):
    from tests.conftest import authed

    c = authed(tenant)
    c.patch("/api/v1/me/", {"email": "attacker@example.com"}, format="json")
    tenant.refresh_from_db()
    assert tenant.email == "tom@example.com"
    assert c.post("/api/v1/auth/password/", {"password": "S0me-long-pass!", "email": "x@y.com"}).status_code == 200
    tenant.refresh_from_db()
    assert tenant.email == "tom@example.com"
