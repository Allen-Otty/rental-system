from django.contrib import admin

from . import models

for m in (models.Lease, models.RentInvoice, models.RentPayment, models.MaintenanceRequest, models.Vendor, models.ViewingRequest):
    admin.site.register(m)
