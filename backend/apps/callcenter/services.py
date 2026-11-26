from datetime import timedelta

from django.core.exceptions import ValidationError
from django.db import transaction
from django.db.models import Avg, Count, F, Q
from django.utils import timezone

from apps.accounts.models import User
from apps.accounts.phone import normalise_phone

from .models import AgentStatus, Call, CallAgent, CallEvent, CallStatus, Callback


def find_customer(phone):
    try:
        return User.objects.filter(phone=normalise_phone(phone)).first()
    except ValidationError:
        return None


def log_event(call, event, **data):
    CallEvent.objects.create(call=call, event=event, data=data)


def set_agent_status(agent, status):
    if agent.status != status:
        agent.status = status
        agent.status_changed_at = timezone.now()
        agent.save(update_fields=["status", "status_changed_at"])


@transaction.atomic
def pick_agent(queue):
    """The available agent in this queue who has been idle longest, or None."""
    agent = (CallAgent.objects.select_for_update(skip_locked=True)
             .filter(status=AgentStatus.AVAILABLE, queues=queue).order_by("status_changed_at").first())
    return agent


def customer_context(user):
    """What an agent sees when a known customer calls. Deliberately limited: no ID numbers or documents."""
    if user is None:
        return None
    from apps.tenancy.models import Lease, LeaseStatus

    leases = Lease.objects.filter(Q(tenant=user) | Q(tenant_phone=user.phone), status=LeaseStatus.ACTIVE).select_related("unit__property")
    overdue_total, overdue_count = 0, 0
    for lease in leases:
        for inv in lease.invoices.all():
            if inv.state() == "overdue":
                overdue_count += 1
                overdue_total += inv.balance()
    return {
        "id": user.pk, "name": user.full_name, "role": user.role, "phone": user.phone,
        "active_leases": [{"unit": l.unit.label, "property": l.unit.property.name, "rent": str(l.rent_amount)} for l in leases],
        "overdue_invoices": overdue_count, "overdue_balance": str(overdue_total),
    }


def finish_call(call, disposition="", summary="", now=None):
    now = now or timezone.now()
    call.ended_at = now
    if call.answered_at:
        call.duration_seconds = max(0, int((now - call.answered_at).total_seconds()))
        call.status = CallStatus.COMPLETED
    elif call.status in (CallStatus.QUEUED, CallStatus.RINGING):
        call.status = CallStatus.MISSED
    if disposition:
        call.disposition = disposition
    if summary:
        call.summary = summary
    call.save()
    if call.agent_id:
        set_agent_status(call.agent, AgentStatus.WRAP_UP)
    log_event(call, "ended", disposition=disposition)


def schedule_callback(call, minutes=30):
    return Callback.objects.create(call=call, phone=call.from_number, due_at=timezone.now() + timedelta(minutes=minutes))


def wallboard():
    now = timezone.now()
    today = now.replace(hour=0, minute=0, second=0, microsecond=0)
    calls = Call.objects.filter(started_at__gte=today, direction="inbound")
    total = calls.count()
    answered = calls.filter(answered_at__isnull=False)
    waiting = Call.objects.filter(status=CallStatus.QUEUED)
    oldest = waiting.order_by("started_at").first()
    agent_counts = {r["status"]: r["n"] for r in CallAgent.objects.values("status").annotate(n=Count("id"))}
    wait = answered.aggregate(a=Avg(F("answered_at") - F("started_at")))["a"]
    handle = answered.aggregate(a=Avg("duration_seconds"))["a"]
    return {
        "calls_today": total,
        "answered": answered.count(),
        "missed": calls.filter(status=CallStatus.MISSED).count(),
        "answer_rate": round(100 * answered.count() / total, 1) if total else None,
        "waiting": waiting.count(),
        "longest_wait_seconds": int((now - oldest.started_at).total_seconds()) if oldest else 0,
        "avg_answer_seconds": round(wait.total_seconds(), 1) if wait else None,
        "avg_handle_seconds": round(handle, 1) if handle else None,
        "agents": {s: agent_counts.get(s, 0) for s in AgentStatus.values},
        "open_callbacks": Callback.objects.filter(done=False).count(),
    }
