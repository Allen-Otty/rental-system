from django.urls import path
from rest_framework.routers import DefaultRouter

from . import views

router = DefaultRouter()
router.register("callcenter/queues", views.QueueViewSet, basename="cc-queue")
router.register("callcenter/calls", views.CallViewSet, basename="cc-call")
router.register("callcenter/tickets", views.TicketViewSet, basename="cc-ticket")
router.register("callcenter/callbacks", views.CallbackViewSet, basename="cc-callback")

urlpatterns = router.urls + [
    path("callcenter/agent/me/", views.MyAgentView.as_view()),
    path("callcenter/agents/", views.AgentListView.as_view()),
    path("callcenter/wallboard/", views.WallboardView.as_view()),
    path("callcenter/webhook/<str:secret>/voice/", views.VoiceWebhookView.as_view()),
]
