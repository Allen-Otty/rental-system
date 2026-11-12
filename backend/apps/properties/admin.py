from django.contrib.gis import admin

from .models import AgentInvite, Property, PropertyAgent, SavedSearch, Unit, UnitMedia

admin.site.register(Property, admin.GISModelAdmin)
admin.site.register(Unit)
admin.site.register(UnitMedia)
admin.site.register(PropertyAgent)
admin.site.register(AgentInvite)
admin.site.register(SavedSearch, admin.GISModelAdmin)
