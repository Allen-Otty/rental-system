import django_filters as df
from django.db.models import Q

from .models import Property, PropertyType, Unit, UnitType


class CharInFilter(df.BaseInFilter, df.CharFilter):
    pass


class UnitFilter(df.FilterSet):
    min_rent = df.NumberFilter(field_name="rent_amount", lookup_expr="gte")
    max_rent = df.NumberFilter(field_name="rent_amount", lookup_expr="lte")
    min_bedrooms = df.NumberFilter(field_name="bedrooms", lookup_expr="gte")
    bedrooms = df.NumberFilter(field_name="bedrooms")
    unit_type = CharInFilter(field_name="unit_type", lookup_expr="in")
    property_type = df.ChoiceFilter(field_name="property__property_type", choices=PropertyType.choices)
    county = df.NumberFilter(field_name="property__county_id")
    constituency = df.NumberFilter(field_name="property__constituency_id")
    ward = df.NumberFilter(field_name="property__ward_id")
    q = df.CharFilter(method="search")

    class Meta:
        model = Unit
        fields = []

    def search(self, qs, name, value):
        return qs.filter(
            Q(property__name__icontains=value)
            | Q(property__estate__icontains=value)
            | Q(property__landmark__icontains=value)
            | Q(property__ward__name__icontains=value)
        )
