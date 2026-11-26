from datetime import date, timedelta

import pytest
from django.utils import timezone

from apps.accounts.models import Role
from apps.audit.models import AuditLog
from apps.callcenter import telephony
from apps.callcenter.models import AgentStatus, Call, CallAgent, CallStatus, Callback, Queue, Ticket
from apps.tenancy.models import Lease, RentInvoice

from .conftest import authed, make_user

pytestmark = pytest.mark.django_db
HOOK = "/api/v1/callcenter/webhook/s3cret/voice/"


@pytest.fixture(autouse=True)
def _telephony(settings):
    settings.TELEPHONY_BACKEND = "mock"
    settings.TELEPHONY_WEBHOOK_SECRET = "s3cret"
    telephony.outbox.clear()


@pytest.fixture
def queues():
    return {"pay": Queue.objects.create(name="Payments", ivr_digit="1"), "svc": Queue.objects.create(name="Services", ivr_digit="2")}


def make_agent(phone, queues_, status=AgentStatus.AVAILABLE, supervisor=False, role=Role.STAFF):
    u = make_user(phone, role, full_name=f"Agent {phone[-2:]}")
    a = CallAgent.objects.create(user=u, status=status, is_supervisor=supervisor)
    a.queues.set(queues_)
    return u, a


def test_only_staff_can_use_the_call_center(tenant, landlord):
    for u in (tenant, landlord):
        assert authed(u).get("/api/v1/callcenter/calls/").status_code == 403
        assert authed(u).get("/api/v1/callcenter/wallboard/").status_code == 403


def test_agent_sets_own_status_but_cannot_fake_on_call(queues):
    u, a = make_agent("0744000001", [queues["pay"]], status=AgentStatus.OFFLINE)
    c = authed(u)
    assert c.patch("/api/v1/callcenter/agent/me/", {"status": "available"}, format="json").data["status"] == "available"
    assert c.patch("/api/v1/callcenter/agent/me/", {"status": "on_call"}, format="json").status_code == 400
    assert c.patch("/api/v1/callcenter/agent/me/", {"status": "nonsense"}, format="json").status_code == 400


def test_webhook_rejects_wrong_or_missing_secret(client, settings):
    assert client.post("/api/v1/callcenter/webhook/wrong/voice/", {"sessionId": "x"}).status_code == 404
    settings.TELEPHONY_WEBHOOK_SECRET = ""
    assert client.post("/api/v1/callcenter/webhook/s3cret/voice/", {"sessionId": "x"}).status_code == 404
    assert client.post("/api/v1/callcenter/webhook/s3cret/voice/", {"sessionId": "x"}).status_code == 404


def test_inbound_call_plays_menu_and_matches_customer(client, tenant, queues):
    r = client.post(HOOK, {"sessionId": "S1", "isActive": "1", "direction": "inbound", "callerNumber": "+254733000001", "destinationNumber": "+254700"})
    assert r.status_code == 200 and b"GetDigits" in r.content and b"may be recorded" in r.content
    call = Call.objects.get(provider_call_id="S1")
    assert call.customer == tenant and call.status == CallStatus.QUEUED


def test_digit_routes_to_longest_idle_agent_and_dials_them(client, queues):
    older_u, older = make_agent("0744000001", [queues["pay"]])
    newer_u, newer = make_agent("0744000002", [queues["pay"]])
    CallAgent.objects.filter(pk=older.pk).update(status_changed_at=timezone.now() - timedelta(minutes=10))
    client.post(HOOK, {"sessionId": "S2", "isActive": "1", "callerNumber": "+254799000000"})
    r = client.post(HOOK, {"sessionId": "S2", "isActive": "1", "callerNumber": "+254799000000", "dtmfDigits": "1"})
    assert b"<Dial" in r.content and older_u.phone.encode() in r.content
    call = Call.objects.get(provider_call_id="S2")
    older.refresh_from_db()
    assert call.agent == older and call.queue == queues["pay"] and older.status == AgentStatus.ON_CALL


def test_no_agent_available_records_missed_call_and_callback(client, queues):
    make_agent("0744000001", [queues["pay"]], status=AgentStatus.BREAK)
    client.post(HOOK, {"sessionId": "S3", "isActive": "1", "callerNumber": "+254799000009"})
    r = client.post(HOOK, {"sessionId": "S3", "isActive": "1", "callerNumber": "+254799000009", "dtmfDigits": "1"})
    assert b"call you back" in r.content and b"<Dial" not in r.content
    assert Call.objects.get(provider_call_id="S3").status == CallStatus.MISSED
    assert Callback.objects.filter(phone="+254799000009", done=False).count() == 1


def test_invalid_digit_repeats_menu(client, queues):
    client.post(HOOK, {"sessionId": "S4", "isActive": "1", "callerNumber": "+254799000001"})
    r = client.post(HOOK, {"sessionId": "S4", "isActive": "1", "callerNumber": "+254799000001", "dtmfDigits": "9"})
    assert b"not available" in r.content and b"GetDigits" in r.content


def test_hangup_webhook_completes_bridged_call(client, queues):
    make_agent("0744000001", [queues["pay"]])
    client.post(HOOK, {"sessionId": "S5", "isActive": "1", "callerNumber": "+254799000002"})
    client.post(HOOK, {"sessionId": "S5", "isActive": "1", "callerNumber": "+254799000002", "dtmfDigits": "1"})
    r = client.post(HOOK, {"sessionId": "S5", "isActive": "0", "recordingUrl": "https://example.com/r.mp3"})
    assert r.status_code == 200
    call = Call.objects.get(provider_call_id="S5")
    assert call.status == CallStatus.COMPLETED and call.recording_url and call.agent.status == AgentStatus.WRAP_UP


def test_accept_and_end_call_with_disposition(queues):
    u, a = make_agent("0744000001", [queues["pay"]])
    call = Call.objects.create(direction="inbound", from_number="+254799000003", to_number="+254700", queue=queues["pay"])
    c = authed(u)
    assert c.post(f"/api/v1/callcenter/calls/{call.pk}/accept/").status_code == 200
    a.refresh_from_db()
    assert a.status == AgentStatus.ON_CALL
    assert c.post(f"/api/v1/callcenter/calls/{call.pk}/accept/").status_code == 400  # already taken
    r = c.post(f"/api/v1/callcenter/calls/{call.pk}/end/", {"disposition": "callback", "summary": "Wants rent receipt"}, format="json")
    assert r.status_code == 200 and r.data["status"] == "completed" and r.data["duration_seconds"] is not None
    a.refresh_from_db()
    assert a.status == AgentStatus.WRAP_UP and Callback.objects.filter(call=call).exists()
    assert c.post(f"/api/v1/callcenter/calls/{call.pk}/end/").status_code == 400


def test_agent_cannot_see_or_end_someone_elses_call(queues):
    u1, a1 = make_agent("0744000001", [queues["pay"]])
    u2, a2 = make_agent("0744000002", [queues["pay"]])
    call = Call.objects.create(direction="inbound", from_number="+254799", to_number="+254700", agent=a1, status=CallStatus.ANSWERED, answered_at=timezone.now())
    assert authed(u2).post(f"/api/v1/callcenter/calls/{call.pk}/end/").status_code == 404  # hidden by queryset scoping


def test_outbound_call_uses_telephony_backend(tenant, queues):
    u, a = make_agent("0744000001", [queues["pay"]])
    r = authed(u).post("/api/v1/callcenter/calls/outbound/", {"to": "0733000001"}, format="json")
    assert r.status_code == 201 and r.data["customer"] == tenant.pk
    assert telephony.outbox[0]["to"] == "+254733000001"
    a.refresh_from_db()
    assert a.status == AgentStatus.ON_CALL
    assert authed(u).post("/api/v1/callcenter/calls/outbound/", {"to": "0733000001"}, format="json").status_code == 400  # already on a call
    assert authed(make_user("0755000009", Role.STAFF)).post("/api/v1/callcenter/calls/outbound/", {"to": "0733000001"}, format="json").status_code == 403  # not an agent


def test_screen_pop_shows_balance_and_is_audited(tenant, landlord, make_property, make_unit, queues):
    unit = make_unit(make_property(landlord))
    lease = Lease.objects.create(unit=unit, tenant=tenant, tenant_name="Tom", tenant_phone=tenant.phone, start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), rent_amount=15000)
    RentInvoice.objects.create(lease=lease, period=date(2026, 9, 1), amount=15000, due_date=date(2026, 9, 5))
    u, a = make_agent("0744000001", [queues["pay"]])
    call = Call.objects.create(direction="inbound", from_number=tenant.phone, to_number="+254700", customer=tenant, agent=a, status=CallStatus.ANSWERED)
    r = authed(u).get(f"/api/v1/callcenter/calls/{call.pk}/screen-pop/")
    assert r.data["customer"]["name"] == "Tom Tenant" and r.data["customer"]["overdue_invoices"] == 1 and r.data["customer"]["overdue_balance"] == "15000.00"
    assert "id_number" not in str(r.data)
    assert AuditLog.objects.filter(action="callcenter.view_customer", actor=u).exists()


def test_ticket_lifecycle_with_notes(tenant, queues):
    u, a = make_agent("0744000001", [queues["pay"]])
    c = authed(u)
    t = c.post("/api/v1/callcenter/tickets/", {"subject": "Double charge", "customer": tenant.pk, "priority": "high"}, format="json")
    assert t.status_code == 201
    tid = t.data["id"]
    assert c.post(f"/api/v1/callcenter/tickets/{tid}/notes/", {"body": "Checked M-Pesa statement"}, format="json").status_code == 201
    r = c.patch(f"/api/v1/callcenter/tickets/{tid}/", {"status": "resolved"}, format="json")
    assert r.data["resolved_at"] is not None and len(r.data["notes"]) == 1
    assert c.patch(f"/api/v1/callcenter/tickets/{tid}/", {"status": "open"}, format="json").data["resolved_at"] is None
    assert Ticket.objects.get(pk=tid).assigned_to == a


def test_wallboard_is_supervisor_only_and_counts(queues):
    agent_u, _ = make_agent("0744000001", [queues["pay"]])
    sup_u, _ = make_agent("0744000002", [queues["pay"]], supervisor=True, status=AgentStatus.OFFLINE)
    now = timezone.now()
    Call.objects.create(direction="inbound", from_number="+254711", to_number="+254700", status=CallStatus.QUEUED)
    Call.objects.create(direction="inbound", from_number="+254712", to_number="+254700", status=CallStatus.MISSED)
    Call.objects.create(direction="inbound", from_number="+254713", to_number="+254700", status=CallStatus.COMPLETED, answered_at=now, duration_seconds=120)
    assert authed(agent_u).get("/api/v1/callcenter/wallboard/").status_code == 403
    d = authed(sup_u).get("/api/v1/callcenter/wallboard/").data
    assert d["calls_today"] == 3 and d["waiting"] == 1 and d["missed"] == 1 and d["answered"] == 1
    assert d["agents"]["available"] == 1 and d["agents"]["offline"] == 1 and d["avg_handle_seconds"] == 120.0


def test_agents_only_see_their_calls_and_the_waiting_queue(queues):
    u1, a1 = make_agent("0744000001", [queues["pay"]])
    u2, a2 = make_agent("0744000002", [queues["pay"]])
    mine = Call.objects.create(direction="inbound", from_number="+254711", to_number="+254700", agent=a1, status=CallStatus.ANSWERED)
    theirs = Call.objects.create(direction="inbound", from_number="+254712", to_number="+254700", agent=a2, status=CallStatus.ANSWERED)
    waiting = Call.objects.create(direction="inbound", from_number="+254713", to_number="+254700", status=CallStatus.QUEUED)
    ids = {c["id"] for c in authed(u1).get("/api/v1/callcenter/calls/").data["results"]}
    assert ids == {str(mine.pk), str(waiting.pk)}
