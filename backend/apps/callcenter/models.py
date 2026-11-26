import uuid

from django.conf import settings
from django.db import models


class AgentStatus(models.TextChoices):
    OFFLINE = "offline", "Offline"
    AVAILABLE = "available", "Available"
    ON_CALL = "on_call", "On a call"
    BREAK = "break", "On break"
    WRAP_UP = "wrap_up", "Wrapping up"


class CallDirection(models.TextChoices):
    INBOUND = "inbound", "Inbound"
    OUTBOUND = "outbound", "Outbound"


class CallStatus(models.TextChoices):
    QUEUED = "queued", "Queued"
    RINGING = "ringing", "Ringing"
    ANSWERED = "answered", "Answered"
    COMPLETED = "completed", "Completed"
    MISSED = "missed", "Missed"
    FAILED = "failed", "Failed"


class Disposition(models.TextChoices):
    RESOLVED = "resolved", "Resolved"
    CALLBACK = "callback", "Callback needed"
    ESCALATED = "escalated", "Escalated"
    SPAM = "spam", "Spam / wrong number"
    NO_ANSWER = "no_answer", "No answer"


class TicketStatus(models.TextChoices):
    OPEN = "open", "Open"
    IN_PROGRESS = "in_progress", "In progress"
    WAITING = "waiting", "Waiting on customer"
    RESOLVED = "resolved", "Resolved"


class TicketPriority(models.TextChoices):
    LOW = "low", "Low"
    NORMAL = "normal", "Normal"
    HIGH = "high", "High"
    URGENT = "urgent", "Urgent"


class Queue(models.Model):
    name = models.CharField(max_length=60, unique=True)
    ivr_digit = models.CharField(max_length=1, unique=True, null=True, blank=True, help_text="Key the caller presses in the phone menu")
    sla_answer_seconds = models.PositiveIntegerField(default=30)

    def __str__(self):
        return self.name


class CallAgent(models.Model):
    """Support staff who take calls. Uses an existing staff/admin user; no new role is introduced."""

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="call_agent")
    status = models.CharField(max_length=10, choices=AgentStatus.choices, default=AgentStatus.OFFLINE, db_index=True)
    status_changed_at = models.DateTimeField(auto_now_add=True)
    is_supervisor = models.BooleanField(default=False)
    queues = models.ManyToManyField(Queue, blank=True, related_name="agents")

    def __str__(self):
        return f"{self.user} ({self.status})"


class Call(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    provider_call_id = models.CharField(max_length=80, unique=True, null=True, blank=True)
    direction = models.CharField(max_length=8, choices=CallDirection.choices)
    from_number = models.CharField(max_length=20)
    to_number = models.CharField(max_length=20)
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    queue = models.ForeignKey(Queue, null=True, blank=True, on_delete=models.SET_NULL, related_name="calls")
    agent = models.ForeignKey(CallAgent, null=True, blank=True, on_delete=models.SET_NULL, related_name="calls")
    status = models.CharField(max_length=10, choices=CallStatus.choices, default=CallStatus.QUEUED, db_index=True)
    started_at = models.DateTimeField(auto_now_add=True, db_index=True)
    answered_at = models.DateTimeField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    duration_seconds = models.PositiveIntegerField(null=True, blank=True)
    recording_url = models.URLField(blank=True)
    disposition = models.CharField(max_length=10, choices=Disposition.choices, blank=True)
    summary = models.TextField(blank=True)

    class Meta:
        ordering = ["-started_at"]


class CallEvent(models.Model):
    call = models.ForeignKey(Call, on_delete=models.CASCADE, related_name="events")
    event = models.CharField(max_length=30)
    data = models.JSONField(default=dict, blank=True)
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["at", "id"]


class Ticket(models.Model):
    call = models.ForeignKey(Call, null=True, blank=True, on_delete=models.SET_NULL, related_name="tickets")
    customer = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    subject = models.CharField(max_length=160)
    category = models.CharField(max_length=40, default="general")
    priority = models.CharField(max_length=8, choices=TicketPriority.choices, default=TicketPriority.NORMAL)
    status = models.CharField(max_length=12, choices=TicketStatus.choices, default=TicketStatus.OPEN, db_index=True)
    assigned_to = models.ForeignKey(CallAgent, null=True, blank=True, on_delete=models.SET_NULL, related_name="tickets")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]


class TicketNote(models.Model):
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="notes")
    author = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL, related_name="+")
    body = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["created_at", "id"]


class Callback(models.Model):
    ticket = models.ForeignKey(Ticket, null=True, blank=True, on_delete=models.SET_NULL, related_name="callbacks")
    call = models.ForeignKey(Call, null=True, blank=True, on_delete=models.SET_NULL, related_name="callbacks")
    phone = models.CharField(max_length=20)
    due_at = models.DateTimeField()
    assigned_to = models.ForeignKey(CallAgent, null=True, blank=True, on_delete=models.SET_NULL, related_name="callbacks")
    done = models.BooleanField(default=False, db_index=True)

    class Meta:
        ordering = ["due_at"]
