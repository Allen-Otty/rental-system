import json

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError

from apps.geo.models import Constituency, County, Ward, locate
from django.contrib.gis.geos import Point

pytestmark = pytest.mark.django_db


def _feature(county, cons, ward, box):
    x0, y0, x1, y1 = box
    return {"type": "Feature", "properties": {"COUNTY_NAM": county, "CONSTITUEN": cons, "WARD": ward},
            "geometry": {"type": "Polygon", "coordinates": [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]}}


def test_import_builds_hierarchy_and_dissolves_geometries(tmp_path):
    data = {"type": "FeatureCollection", "features": [
        _feature("NAIROBI", "WESTLANDS", "PARKLANDS", (36.80, -1.28, 36.84, -1.25)),
        _feature("NAIROBI", "WESTLANDS", "KILELESHWA", (36.76, -1.28, 36.80, -1.25)),
        {"type": "Feature", "properties": {"COUNTY_NAM": "BAD"}, "geometry": None},  # skipped, not fatal
    ]}
    f = tmp_path / "wards.geojson"
    f.write_text(json.dumps(data))
    call_command("import_boundaries", str(f), "--county-field", "COUNTY_NAM",
                 "--constituency-field", "CONSTITUEN", "--ward-field", "WARD")
    assert (County.objects.count(), Constituency.objects.count(), Ward.objects.count()) == (1, 1, 2)
    c = Constituency.objects.get()
    assert c.geom is not None and round(c.geom.area, 4) == round(0.04 * 0.03 * 2, 4)  # two wards merged
    assert County.objects.get().name == "Nairobi"  # normalised casing
    assert locate(Point(36.82, -1.265, srid=4326)).name == "Parklands"

    # re-running is idempotent
    call_command("import_boundaries", str(f), "--county-field", "COUNTY_NAM",
                 "--constituency-field", "CONSTITUEN", "--ward-field", "WARD")
    assert Ward.objects.count() == 2


def test_import_errors_are_clear(tmp_path):
    with pytest.raises(CommandError):
        call_command("import_boundaries", str(tmp_path / "missing.geojson"))
    empty = tmp_path / "e.geojson"
    empty.write_text(json.dumps({"type": "FeatureCollection", "features": []}))
    with pytest.raises(CommandError):
        call_command("import_boundaries", str(empty))
