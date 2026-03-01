import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if getattr(sys, "frozen", False):
    APP_HOME = Path(sys.executable).resolve().parent
    BUNDLE_HOME = Path(getattr(sys, "_MEIPASS", APP_HOME))
else:
    APP_HOME = BASE_DIR
    BUNDLE_HOME = BASE_DIR

SECRET_KEY = "dev-secret-key"
DEBUG = True
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.staticfiles",
    "corsheaders",
    "app",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.common.CommonMiddleware",
]

ROOT_URLCONF = "config.urls"
TEMPLATES = []
WSGI_APPLICATION = "config.wsgi.application"
ASGI_APPLICATION = "config.asgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "data" / "django.sqlite3",
    }
}

LANGUAGE_CODE = "vi"
TIME_ZONE = "Asia/Ho_Chi_Minh"
USE_I18N = True
USE_TZ = False

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

CORS_ALLOW_ALL_ORIGINS = True

MEDIA_URL = "/media/"
MEDIA_ROOT = Path(os.environ.get("MP_CRM_MEDIA_ROOT", str(APP_HOME / "media")))

APP_DB_PATH = Path(os.environ.get("MP_CRM_DB_PATH", str(APP_HOME / "data" / "app.db")))
FRONTEND_DIST_DIR = Path(os.environ.get("MP_CRM_FRONTEND_DIST", str(BUNDLE_HOME / "web")))
