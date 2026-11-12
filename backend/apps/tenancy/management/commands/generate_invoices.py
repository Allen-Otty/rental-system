from datetime import date

from django.core.management.base import BaseCommand

from apps.tenancy.models import Lease
from apps.tenancy.services import generate_invoices


class Command(BaseCommand):
    help = "Create this month's rent invoices for every active lease (run daily from a scheduler; safe to repeat)."

    def add_arguments(self, parser):
        parser.add_argument("--month", help="YYYY-MM (default: current month)")

    def handle(self, *args, **opts):
        d = date.today() if not opts["month"] else date.fromisoformat(opts["month"] + "-01")
        n = generate_invoices(Lease.objects.all(), d)
        self.stdout.write(f"Created {n} invoice(s) for {d:%Y-%m}.")
