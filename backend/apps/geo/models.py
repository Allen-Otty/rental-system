from django.contrib.gis.db import models


class County(models.Model):
    code = models.CharField(max_length=10, blank=True, db_index=True)
    name = models.CharField(max_length=80, unique=True)
    geom = models.MultiPolygonField(srid=4326, null=True, blank=True)

    class Meta:
        ordering = ["name"]
        verbose_name_plural = "counties"

    def __str__(self):
        return self.name


class Constituency(models.Model):
    """Used as the 'sub-county' level in the product (the open ward dataset has constituencies)."""

    county = models.ForeignKey(County, on_delete=models.CASCADE, related_name="constituencies")
    code = models.CharField(max_length=10, blank=True, db_index=True)
    name = models.CharField(max_length=100)
    geom = models.MultiPolygonField(srid=4326, null=True, blank=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["county", "name"], name="uniq_constituency_per_county")]
        verbose_name_plural = "constituencies"

    def __str__(self):
        return f"{self.name}, {self.county.name}"


class Ward(models.Model):
    constituency = models.ForeignKey(Constituency, on_delete=models.CASCADE, related_name="wards")
    county = models.ForeignKey(County, on_delete=models.CASCADE, related_name="wards")  # denormalised for fast filters
    code = models.CharField(max_length=10, blank=True, db_index=True)
    name = models.CharField(max_length=100)
    geom = models.MultiPolygonField(srid=4326)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["constituency", "name"], name="uniq_ward_per_constituency")]

    def __str__(self):
        return f"{self.name}, {self.constituency.name}"


def locate(point):
    """Return the Ward containing `point` (or None). Ties on shared edges resolve to the lowest id."""
    return (
        Ward.objects.filter(geom__intersects=point)
        .select_related("constituency", "county")
        .order_by("id")
        .first()
    )
