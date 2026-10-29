from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from . import views

urlpatterns = [
    path("auth/otp/request/", views.OTPRequestView.as_view()),
    path("auth/otp/verify/", views.OTPVerifyView.as_view()),
    path("auth/login/", views.LoginView.as_view()),
    path("auth/refresh/", TokenRefreshView.as_view()),
    path("auth/password/", views.SetPasswordView.as_view()),
    path("me/", views.MeView.as_view()),
    path("landlord/verification/", views.MyVerificationView.as_view()),
    path("admin/verifications/", views.VerificationQueueView.as_view()),
    path("admin/verifications/<int:pk>/<str:decision>/", views.VerificationDecisionView.as_view()),
    path("verification-documents/<int:pk>/file/", views.VerificationDocumentFileView.as_view()),
]
