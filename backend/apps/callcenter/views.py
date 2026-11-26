import hmac
from datetime import timedelta
from xml.sax.saxutils import escape, quoteattr

from django.conf import settings
from django.http import Http404, HttpResponse
from django.utils import timezone
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.phone import normalise_phone
from apps.audit.utils import log_action

from . import services, telephony
from .models import (AgentStatus, Call, CallAgent, CallDirection, CallStatus, Callback, Queue, Ticket, TicketNote, TicketStatus)
from .permissions import IsCallCenterStaff, IsSupervisor, agent_of
from .serializers import (AgentSerializer, CallbackSerializer, CallSerializer, QueueSerializer, TicketNoteSerializer, TicketSerializer)

AGENT_SETTABLE = {AgentStatus.OFFLINE, AgentStatus.AVAILABLE, AgentStatus.BREAK, AgentStatus.WRAP_UP}


def require_agent(request):
    a = agent_of(request.user)
    if a is None:
        raise PermissionDenied("You are not set up as a call center agent.")
    return a


class QueueViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Queue.objects.all()
    serializer_class = QueueSerializer
    permission_classes = [permissions.IsAuthenticated, IsCallCenterStaff]
    pagination_class = None


class MyAgentView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsCallCenterStaff]

    def get(self, request):
        return Response(AgentSerializer(require_agent(request)).data)

    def patch(self, request):
        agent = require_agent(request)
        new = request.data.get("status")
        if new not in AGENT_SETTABLE:
            raise ValidationError({"status": f"Choose one of: {', '.join(sorted(AGENT_SETTABLE))}. 'on_call' is set by calls."})
        if agent.status == AgentStatus.ON_CALL:
            raise ValidationError({"status": "End your current call first."})
        services.set_agent_status(agent, new)
        return Response(AgentSerializer(agent).data)


class AgentListView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get(self, request):
        return Response(AgentSerializer(CallAgent.objects.select_related("user"), many=True).data)


class CallViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CallSerializer
    permission_classes = [permissions.IsAuthenticated, IsCallCenterStaff]

    def get_queryset(self):
        from django.db.models import Q

        qs = Call.objects.select_related("customer", "agent__user").prefetch_related("events")
        a = agent_of(self.request.user)
        if not (self.request.user.is_superuser or self.request.user.role == "admin" or (a and a.is_supervisor)):
            qs = qs.filter(Q(agent=a) | Q(status=CallStatus.QUEUED)) if a else qs.none()
        for f in ("status", "direction"):
            if self.request.query_params.get(f):
                qs = qs.filter(**{f: self.request.query_params[f]})
        return qs

    @action(detail=True, methods=["post"])
    def accept(self, request, pk=None):
        agent = require_agent(request)
        call = self.get_object()
        if call.status != CallStatus.QUEUED:
            raise ValidationError("This call is no longer waiting.")
        if agent.status == AgentStatus.ON_CALL:
            raise ValidationError("You are already on a call.")
        call.agent, call.status, call.answered_at = agent, CallStatus.ANSWERED, timezone.now()
        call.save()
        services.set_agent_status(agent, AgentStatus.ON_CALL)
        services.log_event(call, "answered", agent=agent.pk)
        return Response(CallSerializer(call).data)

    @action(detail=True, methods=["post"])
    def end(self, request, pk=None):
        call = self.get_object()
        if call.agent_id and call.agent.user_id != request.user.pk and not IsSupervisor().has_permission(request, self):
            raise PermissionDenied("Only the agent on this call can end it.")
        if call.ended_at:
            raise ValidationError("This call has already ended.")
        services.finish_call(call, request.data.get("disposition", ""), request.data.get("summary", ""))
        if call.disposition == "callback":
            services.schedule_callback(call)
        return Response(CallSerializer(call).data)

    @action(detail=False, methods=["post"])
    def outbound(self, request):
        agent = require_agent(request)
        try:
            to = normalise_phone(request.data.get("to"))
        except Exception:
            raise ValidationError({"to": "Enter a valid phone number."})
        if agent.status == AgentStatus.ON_CALL:
            raise ValidationError("You are already on a call.")
        call = Call.objects.create(direction=CallDirection.OUTBOUND, from_number=settings.AT_VOICE_NUMBER or "mock",
                                   to_number=to, customer=services.find_customer(to), agent=agent, status=CallStatus.RINGING)
        session = telephony.place_call(call.from_number, to)
        if not session:
            call.status = CallStatus.FAILED
            call.save()
            raise ValidationError("The call could not be placed. Try again.")
        call.provider_call_id = session
        call.save()
        services.set_agent_status(agent, AgentStatus.ON_CALL)
        services.log_event(call, "outbound_placed")
        return Response(CallSerializer(call).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["get"], url_path="screen-pop")
    def screen_pop(self, request, pk=None):
        call = self.get_object()
        ctx = services.customer_context(call.customer)
        if ctx:
            log_action(request.user, "callcenter.view_customer", call.customer, call=str(call.pk))
        return Response({"call": str(call.pk), "number": call.from_number if call.direction == "inbound" else call.to_number, "customer": ctx})


class TicketViewSet(mixins.CreateModelMixin, mixins.RetrieveModelMixin, mixins.UpdateModelMixin, mixins.ListModelMixin, viewsets.GenericViewSet):
    serializer_class = TicketSerializer
    permission_classes = [permissions.IsAuthenticated, IsCallCenterStaff]

    def get_queryset(self):
        qs = Ticket.objects.prefetch_related("notes__author")
        for f in ("status", "priority", "category"):
            if self.request.query_params.get(f):
                qs = qs.filter(**{f: self.request.query_params[f]})
        return qs

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user, assigned_to=agent_of(self.request.user))

    def perform_update(self, serializer):
        t = serializer.save()
        if t.status == TicketStatus.RESOLVED and not t.resolved_at:
            t.resolved_at = timezone.now()
            t.save(update_fields=["resolved_at"])
        elif t.status != TicketStatus.RESOLVED and t.resolved_at:
            t.resolved_at = None
            t.save(update_fields=["resolved_at"])

    @action(detail=True, methods=["post"])
    def notes(self, request, pk=None):
        s = TicketNoteSerializer(data=request.data)
        s.is_valid(raise_exception=True)
        s.save(ticket=self.get_object(), author=request.user)
        return Response(s.data, status=status.HTTP_201_CREATED)


class CallbackViewSet(mixins.CreateModelMixin, mixins.ListModelMixin, mixins.UpdateModelMixin, viewsets.GenericViewSet):
    serializer_class = CallbackSerializer
    permission_classes = [permissions.IsAuthenticated, IsCallCenterStaff]

    def get_queryset(self):
        qs = Callback.objects.all()
        return qs if self.request.query_params.get("all") else qs.filter(done=False)


class WallboardView(APIView):
    permission_classes = [permissions.IsAuthenticated, IsSupervisor]

    def get(self, request):
        return Response(services.wallboard())


# ---------------- Voice provider webhook (Africa's Talking style) ----------------

MENU = ("Welcome. This call may be recorded. Press 1 for payments, 2 for home services, 3 for landlords.")


def xml(body):
    return HttpResponse(f"<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response>{body}</Response>", content_type="application/xml")


def say(text):
    return f"<Say>{escape(text)}</Say>"


def dial(phone):
    return f"<Dial phoneNumbers={quoteattr(phone)} record=\"true\" />"


class VoiceWebhookView(APIView):
    """Called by the telephony provider. The secret in the URL is the only authentication, so keep it private.

    The XML actions and parameter names follow Africa's Talking's voice API as best known; verify in their sandbox.
    """

    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = []

    def post(self, request, secret):
        expected = settings.TELEPHONY_WEBHOOK_SECRET
        if not expected or not hmac.compare_digest(str(secret), expected):
            raise Http404
        d = request.data
        session = d.get("sessionId", "")
        if not session:
            raise ValidationError("sessionId is required.")
        active = str(d.get("isActive", "1")) == "1"
        direction = "outbound" if str(d.get("direction", "inbound")).lower() == "outbound" else "inbound"
        caller, dest = d.get("callerNumber", ""), d.get("destinationNumber", "")

        call = Call.objects.filter(provider_call_id=session).first()
        if not active:
            if call and not call.ended_at:
                if d.get("recordingUrl"):
                    call.recording_url = d["recordingUrl"]
                if call.agent_id and call.status == CallStatus.RINGING:  # bridged call that was answered
                    call.answered_at = call.answered_at or timezone.now()
                services.finish_call(call)
                if call.status == CallStatus.MISSED and direction == "inbound":
                    services.schedule_callback(call)
            return HttpResponse(status=200)

        if call is None:
            if direction == "outbound":
                return xml(say("Sorry, this call is not recognised."))
            call = Call.objects.create(provider_call_id=session, direction=CallDirection.INBOUND, from_number=caller, to_number=dest,
                                       customer=services.find_customer(caller))
            services.log_event(call, "inbound_started")

        if call.direction == CallDirection.OUTBOUND:
            return xml(dial(call.agent.user.phone)) if call.agent_id else xml(say("No agent is available."))

        digit = str(d.get("dtmfDigits", "")).strip()
        if not digit:
            return xml(f"<GetDigits timeout=\"10\" numDigits=\"1\">{say(MENU)}</GetDigits>")
        queue = Queue.objects.filter(ivr_digit=digit).first()
        if queue is None:
            return xml(say("Sorry, that option is not available.") + f"<GetDigits timeout=\"10\" numDigits=\"1\">{say(MENU)}</GetDigits>")
        call.queue = queue
        agent = services.pick_agent(queue)
        if agent is None:
            call.status = CallStatus.MISSED
            call.ended_at = timezone.now()
            call.save()
            services.schedule_callback(call)
            services.log_event(call, "no_agent", queue=queue.name)
            return xml(say("All our agents are busy. We will call you back shortly. Goodbye."))
        call.agent, call.status = agent, CallStatus.RINGING
        call.save()
        services.set_agent_status(agent, AgentStatus.ON_CALL)
        services.log_event(call, "routed", agent=agent.pk, queue=queue.name)
        return xml(say("Connecting you to an agent.") + dial(agent.user.phone))
