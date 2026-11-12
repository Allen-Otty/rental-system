"""Import Kenya county / constituency / ward boundaries from one ward-level GeoJSON.

Counties and constituencies are built by dissolving their wards, so a single file is enough.

    python manage.py import_boundaries wards.geojson \
        --county-field COUNTY_NAM --constituency-field CONSTITUEN --ward-field WARD

Before production use, verify the dataset's provenance, accuracy and licence.
"""
import json

from django.contrib.gis.db.models import Union
from django.contrib.gis.db.models.functions import MakeValid
from django.contrib.gis.geos import GEOSGeometry, MultiPolygon, Polygon
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from apps.geo.models import Constituency, County, Ward


def as_multipolygon(geom):
    if isinstance(geom, Polygon):
        return MultiPolygon(geom, srid=4326)
    if isinstance(geom, MultiPolygon):
        return geom
    polys = [g for g in getattr(geom, "__iter__", lambda: [])() if isinstance(g, Polygon)]  # GeometryCollection
    if polys:
        return MultiPolygon(*polys, srid=4326)
    raise ValueError(f"Unsupported geometry type {geom.geom_type}")


class Command(BaseCommand):
    help = "Import ward boundaries from GeoJSON and dissolve them into constituencies and counties."

    def add_arguments(self, parser):
        parser.add_argument("path")
        parser.add_argument("--county-field", default="county")
        parser.add_argument("--constituency-field", default="constituency")
        parser.add_argument("--ward-field", default="ward")
        parser.add_argument("--county-code-field", default="")
        parser.add_argument("--constituency-code-field", default="")
        parser.add_argument("--ward-code-field", default="")

    @transaction.atomic
    def handle(self, *args, **o):
        try:
            with open(o["path"], encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, ValueError) as e:
            raise CommandError(f"Cannot read GeoJSON: {e}")
        features = data.get("features") or []
        if not features:
            raise CommandError("No features found.")

        # Property lookups are case-insensitive so real-world files with odd casing still work.
        def prop(props, name):
            if not name:
                return ""
            for k, v in props.items():
                if k.lower() == name.lower():
                    return str(v).strip() if v is not None else ""
            return ""

        imported = skipped = 0
        for f in features:
            props = f.get("properties") or {}
            county_name = prop(props, o["county_field"]).title()
            cons_name = prop(props, o["constituency_field"]).title()
            ward_name = prop(props, o["ward_field"]).title()
            if not (county_name and cons_name and ward_name and f.get("geometry")):
                skipped += 1
                continue
            geom = GEOSGeometry(json.dumps(f["geometry"]), srid=4326)
            if not geom.valid:
                geom = geom.buffer(0)
            try:
                geom = as_multipolygon(geom)
            except ValueError:
                skipped += 1
                continue
            county, _ = County.objects.get_or_create(
                name=county_name, defaults={"code": prop(props, o["county_code_field"])}
            )
            cons, _ = Constituency.objects.get_or_create(
                county=county, name=cons_name, defaults={"code": prop(props, o["constituency_code_field"])}
            )
            Ward.objects.update_or_create(
                constituency=cons,
                name=ward_name,
                defaults={"county": county, "code": prop(props, o["ward_code_field"]), "geom": geom},
            )
            imported += 1

        for model, lookup in ((Constituency, "wards__geom"), (County, "wards__geom")):
            for obj in model.objects.annotate(u=Union(lookup)):
                if obj.u is not None:
                    obj.geom = as_multipolygon(obj.u)
                    obj.save(update_fields=["geom"])

        self.stdout.write(self.style.SUCCESS(
            f"Imported {imported} wards ({skipped} skipped). "
            f"{County.objects.count()} counties, {Constituency.objects.count()} constituencies."
        ))
        if skipped:
            self.stdout.write(self.style.WARNING("Skipped features were missing names or geometry; check --*-field options."))
