from rest_framework import serializers

from .models import Call, CallAgent, CallEvent, Callback, Queue, Ticket, TicketNote


class QueueSerializer(serializers.ModelSerializer):
    class Meta:
        model = Queue
        fields = ["id", "name", "ivr_digit", "sla_answer_seconds"]


class AgentSerializer(serializers.ModelSerializer):
    name = serializers.CharField(source="user.full_name", read_only=True)

    class Meta:
        model = CallAgent
        fields = ["id", "name", "status", "status_changed_at", "is_supervisor"]
        read_only_fields = ["id", "name", "status_changed_at", "is_supervisor"]


class CallEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = CallEvent
        fields = ["event", "data", "at"]


class CallSerializer(serializers.ModelSerializer):
    customer_name = serializers.CharField(source="customer.full_name", read_only=True, default=None)
    agent_name = serializers.CharField(source="agent.user.full_name", read_only=True, default=None)
    events = CallEventSerializer(many=True, read_only=True)

    class Meta:
        model = Call
        fields = ["id", "direction", "from_number", "to_number", "customer", "customer_name", "queue", "agent", "agent_name",
                  "status", "started_at", "answered_at", "ended_at", "duration_seconds", "recording_url", "disposition", "summary", "events"]
        read_only_fields = fields


class TicketNoteSerializer(serializers.ModelSerializer):
    author_name = serializers.CharField(source="author.full_name", read_only=True, default=None)

    class Meta:
        model = TicketNote
        fields = ["id", "author_name", "body", "created_at"]
        read_only_fields = ["id", "author_name", "created_at"]


class TicketSerializer(serializers.ModelSerializer):
    notes = TicketNoteSerializer(many=True, read_only=True)

    class Meta:
        model = Ticket
        fields = ["id", "call", "customer", "subject", "category", "priority", "status", "assigned_to", "created_at", "resolved_at", "notes"]
        read_only_fields = ["id", "created_at", "resolved_at", "notes"]


class CallbackSerializer(serializers.ModelSerializer):
    class Meta:
        model = Callback
        fields = ["id", "ticket", "call", "phone", "due_at", "assigned_to", "done"]
        read_only_fields = ["id"]
