import re

from django.core.exceptions import ValidationError

_KE_LOCAL = re.compile(r"^0([17]\d{8})$")  # 07xx / 01xx xxxxxx
_KE_INTL = re.compile(r"^\+?254([17]\d{8})$")
_E164 = re.compile(r"^\+[1-9]\d{7,14}$")


def normalise_phone(raw):
    """Return an E.164 phone number. Kenyan formats are accepted without a country code."""
    if raw is None:
        raise ValidationError("Phone number is required.")
    value = re.sub(r"[\s\-().]", "", str(raw))
    m = _KE_LOCAL.match(value) or _KE_INTL.match(value)
    if m:
        return "+254" + m.group(1)
    if _E164.match(value):
        return value
    raise ValidationError("Enter a valid phone number, e.g. 0712345678 or +254712345678.")
