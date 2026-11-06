import os
from pathlib import Path

import dj_database_url
from django.core.exceptions import ImproperlyConfigured
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")


def env_bool(name, default=False):
    return os.environ.get(name, str(int(default))).strip().lower() in ("1", "true", "yes", "on")


def env_list(name, default=""):
    return [v.strip() for v in os.environ.get(name, default).split(",") if v.strip()]


DEBUG = env_bool("DEBUG", False)

SECRET_KEY = os.environ.get("SECRET_KEY", "")
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = "dev-only-insecure-key-do-not-use-in-production-0123456789"
    else:
        raise ImproperlyConfigured("SECRET_KEY must be set when DEBUG is off.")

ALLOWED_HOSTS = env_list("ALLOWED_HOSTS", "localhost,127.0.0.1")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "django.contrib.gis",
    "rest_framework",
    "rest_framework_gis",
    "django_filters",
    "corsheaders",
    "apps.accounts",
    "apps.geo",
    "apps.properties",
    "apps.land",
    "apps.tenant_requests",
    "apps.audit",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ]
        },
    }
]

DATABASES = {
    "default": dj_database_url.config(
        default="postgis://rental:rental@localhost:5432/rental", conn_max_age=60
    )
}

AUTH_USER_MODEL = "accounts.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "en"
LANGUAGES = [("en", "English"), ("sw", "Kiswahili")]
TIME_ZONE = "Africa/Nairobi"
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# --- REST framework -------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework_simplejwt.authentication.JWTAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["rest_framework.permissions.IsAuthenticatedOrReadOnly"],
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 20,
    "DEFAULT_FILTER_BACKENDS": ["django_filters.rest_framework.DjangoFilterBackend"],
    "DEFAULT_THROTTLE_CLASSES": ["rest_framework.throttling.ScopedRateThrottle"],
    "DEFAULT_THROTTLE_RATES": {"otp": "30/hour", "login": "30/hour", "signup": "10/hour",
                              "email_resend": "5/hour", "pay": "10/hour"},
}

from datetime import timedelta  # noqa: E402

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=30),
    "ROTATE_REFRESH_TOKENS": True,
}

CORS_ALLOWED_ORIGINS = env_list("CORS_ALLOWED_ORIGINS", "http://localhost:3000")

# --- OTP / SMS ------------------------------------------------------------
OTP_LENGTH = 6
OTP_TTL_SECONDS = 300
OTP_MAX_ATTEMPTS = 5
OTP_MAX_REQUESTS = 3          # per phone ...
OTP_REQUEST_WINDOW_SECONDS = 600  # ... per this window
SMS_BACKEND = os.environ.get("SMS_BACKEND", "console")
AT_USERNAME = os.environ.get("AT_USERNAME", "")
AT_API_KEY = os.environ.get("AT_API_KEY", "")
AT_SENDER_ID = os.environ.get("AT_SENDER_ID", "")

# --- Email (signup confirmation) -------------------------------------------
# Dev default prints emails to the console. In production set EMAIL_BACKEND to
# django.core.mail.backends.smtp.EmailBackend plus the EMAIL_HOST_* values for your provider.
EMAIL_BACKEND = os.environ.get("EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend")
EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "true").lower() == "true"
DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "Mjakez <no-reply@localhost>")
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000").rstrip("/")
EMAIL_CONFIRM_MAX_AGE_HOURS = int(os.environ.get("EMAIL_CONFIRM_MAX_AGE_HOURS", "48"))
# Phone-OTP can still sign existing users in, but new accounts need the email link.
OTP_SIGNUP_ENABLED = os.environ.get("OTP_SIGNUP_ENABLED", "false").lower() == "true"

# --- Property requests + M-Pesa ---------------------------------------------
REQUEST_FEE_KES = int(os.environ.get("REQUEST_FEE_KES", "200"))  # server-side; clients can't set it
REQUEST_ACTIVE_DAYS = int(os.environ.get("REQUEST_ACTIVE_DAYS", "30"))
MPESA_BACKEND = os.environ.get("MPESA_BACKEND", "mock")  # "mock" (dev/tests) or "daraja"
MPESA_ENV = os.environ.get("MPESA_ENV", "sandbox")        # "sandbox" or "production"
MPESA_CONSUMER_KEY = os.environ.get("MPESA_CONSUMER_KEY", "")
MPESA_CONSUMER_SECRET = os.environ.get("MPESA_CONSUMER_SECRET", "")
MPESA_SHORTCODE = os.environ.get("MPESA_SHORTCODE", "")   # Paybill number or Till (store) number
MPESA_PARTY_B = os.environ.get("MPESA_PARTY_B", "")       # Till number for BuyGoods; defaults to shortcode
MPESA_PASSKEY = os.environ.get("MPESA_PASSKEY", "")
MPESA_TRANSACTION_TYPE = os.environ.get("MPESA_TRANSACTION_TYPE", "CustomerPayBillOnline")  # or CustomerBuyGoodsOnline
MPESA_CALLBACK_BASE_URL = os.environ.get("MPESA_CALLBACK_BASE_URL", "").rstrip("/")  # public https URL of this API
MPESA_CALLBACK_SECRET = os.environ.get("MPESA_CALLBACK_SECRET", "")  # random string, part of the callback URL

# --- Media ----------------------------------------------------------------
CLOUDINARY_CLOUD_NAME = os.environ.get("CLOUDINARY_CLOUD_NAME", "")
CLOUDINARY_API_KEY = os.environ.get("CLOUDINARY_API_KEY", "")
CLOUDINARY_API_SECRET = os.environ.get("CLOUDINARY_API_SECRET", "")
PRIVATE_MEDIA_ROOT = os.environ.get("PRIVATE_MEDIA_ROOT", str(BASE_DIR / "private_media"))
MAX_VERIFICATION_FILE_MB = 5

LAND_MAX_ACTIVE_PER_SELLER = int(os.environ.get("LAND_MAX_ACTIVE_PER_SELLER", "20"))

# --- Business rules -------------------------------------------------------
DEFAULT_COMMISSION_PERCENT = os.environ.get("DEFAULT_COMMISSION_PERCENT", "0")
# Rough bounding box of Kenya; catches swapped lat/lng and far-off pins.
KENYA_BBOX = {"min_lat": -4.8, "max_lat": 5.6, "min_lng": 33.8, "max_lng": 41.95}

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
