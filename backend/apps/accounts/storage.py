from django.conf import settings
from django.core.files.storage import FileSystemStorage


def get_private_storage():
    """Storage for sensitive uploads (landlord ID documents).

    Files live outside any publicly served path and are only returned through an
    authenticated view. On Render, mount a persistent disk at PRIVATE_MEDIA_ROOT, or
    swap this for a private S3/R2 bucket via django-storages.
    """
    return FileSystemStorage(location=settings.PRIVATE_MEDIA_ROOT, base_url=None)
