from django.contrib import admin

from .models import Call, CallAgent, Callback, Queue, Ticket

for m in (Queue, CallAgent, Call, Ticket, Callback):
    admin.site.register(m)
