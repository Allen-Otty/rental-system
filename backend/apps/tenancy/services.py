import calendar
from datetime import date, timedelta
from decimal import Decimal

from django.db.models import DecimalField, F, Q, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.accounts import sms
from apps.properties.models import Unit

from .models import (Lease, LeaseStatus, MaintenanceRequest, RentInvoice, RentPayment, RentReminder, RepairStatus)

ZERO = Value(Decimal("0"), output_field=DecimalField(max_digits=12, decimal_places=2))


def first_of_month(d):
    return d.replace(day=1)


def generate_invoices(leases, month):
    """Create the rent invoice for `month` (a date in that month) for each active lease. Safe to re-run."""
    period = first_of_month(month)
    created = 0
    last_day = period.replace(day=calendar.monthrange(period.year, period.month)[1])
    for lease in leases.filter(status=LeaseStatus.ACTIVE, start_date__lte=last_day, end_date__gte=period):
        due = period.replace(day=min(lease.rent_due_day, 28))
        _, was_created = RentInvoice.objects.get_or_create(lease=lease, period=period, defaults={"amount": lease.rent_amount, "due_date": due})
        created += was_created
    return created


def with_paid(qs):
    return qs.annotate(paid=Coalesce(Sum("payments__amount"), ZERO))


def overdue_invoices(invoices, today=None):
    today = today or date.today()
    return with_paid(invoices).filter(due_date__lt=today, paid__lt=F("amount"))


def landlord_dashboard(user):
    today = date.today()
    month = first_of_month(today)
    units = Unit.objects.managed_by(user).filter(is_active=True)
    leases = Lease.objects.filter(unit__in=units)
    invoices = RentInvoice.objects.filter(lease__in=leases)
    due = invoices.filter(period=month).aggregate(t=Sum("amount"))["t"] or 0
    collected = RentPayment.objects.filter(invoice__in=invoices, paid_on__year=today.year, paid_on__month=today.month).aggregate(t=Sum("amount"))["t"] or 0
    late = list(overdue_invoices(invoices, today).select_related("lease", "lease__unit", "lease__unit__property").order_by("due_date"))
    arrears = sum((i.amount - i.paid for i in late), Decimal("0"))
    total_units = units.count()
    occupied = leases.filter(status=LeaseStatus.ACTIVE).count()
    open_repairs = MaintenanceRequest.objects.filter(unit__in=units).exclude(status__in=[RepairStatus.DONE, RepairStatus.CLOSED])
    attention = [{"type": "rent_overdue", "lease": i.lease_id, "invoice": i.id, "title": f"Rent overdue, {i.lease.unit.label or i.lease.unit.property.name}",
                  "detail": f"{i.lease.tenant_name}, {(today - i.due_date).days} days late", "amount": str(i.amount - i.paid)} for i in late[:5]]
    for l in leases.filter(status=LeaseStatus.ACTIVE, end_date__lte=today + timedelta(days=30), end_date__gte=today).select_related("unit")[:5]:
        attention.append({"type": "lease_ending", "lease": l.id, "title": f"Lease ends in {(l.end_date - today).days} days", "detail": f"{l.unit.label}, {l.tenant_name}"})
    for r in open_repairs.filter(vendor__isnull=True).select_related("unit")[:5]:
        attention.append({"type": "repair_needs_vendor", "repair": r.id, "title": f"{r.title}, {r.unit.label}", "detail": "Waiting for a vendor"})
    return {"month": month.isoformat(), "rent_due": str(due), "rent_collected": str(collected), "occupancy": {"occupied": occupied, "total": total_units,
            "percent": round(100 * occupied / total_units) if total_units else 0}, "arrears": {"amount": str(arrears), "tenants": len({i.lease_id for i in late})},
            "open_repairs": open_repairs.count(), "repairs_needing_vendor": open_repairs.filter(vendor__isnull=True).count(), "attention": attention}


MSG = {
    "en": "Hello {name}, rent of KES {bal} for {unit} (due {due}) is still unpaid. Please pay and send your M-Pesa code. {landlord}",
    "sw": "Habari {name}, kodi ya KES {bal} ya {unit} (iliyotakiwa {due}) bado haijalipwa. Tafadhali lipa na utume nambari ya M-Pesa. {landlord}",
}


def send_overdue_reminders(invoices, sender):
    """Text each tenant with overdue rent. One reminder per invoice per 24 hours."""
    sent = skipped = 0
    cutoff = timezone.now() - timedelta(hours=24)
    for inv in overdue_invoices(invoices).select_related("lease", "lease__tenant", "lease__unit"):
        if inv.reminders.filter(sent_at__gte=cutoff).exists():
            skipped += 1
            continue
        lang = inv.lease.tenant.language if inv.lease.tenant_id else "en"
        text = MSG.get(lang, MSG["en"]).format(name=inv.lease.tenant_name.split(" ")[0], bal=f"{inv.amount - inv.paid:,.0f}",
                                               unit=inv.lease.unit.label or inv.lease.unit.property.name, due=inv.due_date.strftime("%d %b"), landlord=f"- {sender.full_name}" if sender.full_name else "")
        if sms.send_sms(inv.lease.tenant_phone, text):
            RentReminder.objects.create(invoice=inv, phone=inv.lease.tenant_phone)
            sent += 1
        else:
            skipped += 1
    return sent, skipped
