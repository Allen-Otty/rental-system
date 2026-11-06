"""Fixed option lists, so every client (web, app, bot) shows the same checkboxes."""

RENTAL_AMENITIES = [
    ("parking", "Parking"), ("swimming_pool", "Swimming pool"), ("gated_community", "Gated community"),
    ("water_24_7", "24/7 water"), ("security_cctv", "CCTV and security"), ("backup_generator", "Backup generator"),
    ("balcony", "Balcony"), ("pets_allowed", "Pets allowed"),
]
LAND_FEATURES = [
    ("road_access", "Access road"), ("water_available", "Water available"), ("electricity", "Electricity nearby"),
    ("fenced", "Fenced"), ("title_ready", "Title deed ready"), ("flat_terrain", "Flat terrain"),
    ("near_tarmac", "Near tarmac"), ("gated_estate", "In a gated estate"),
]
RENTAL_KEYS = {k for k, _ in RENTAL_AMENITIES}
LAND_KEYS = {k for k, _ in LAND_FEATURES}


def clean_keys(value, allowed, what="Amenities"):
    """Validate a list of option keys; returns it de-duplicated, order kept. Raises ValueError."""
    if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
        raise ValueError(f"{what} must be a list of option keys.")
    bad = sorted({v for v in value if v not in allowed})
    if bad:
        raise ValueError(f"Unknown {what.lower()}: {', '.join(bad)}.")
    return list(dict.fromkeys(value))
