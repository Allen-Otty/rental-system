from django.contrib.gis import admin

from .models import Constituency, County, Ward

for model in (County, Constituency, Ward):
    admin.site.register(model, admin.GISModelAdmin)
