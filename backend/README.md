# Rental platform backend (Django + PostGIS)

Backend foundation for the Kenya rental platform: phone-OTP auth, roles, landlord verification,
properties/units with GPS, automatic county/constituency/ward assignment, spatial search, saved
search areas (with consent), media metadata, agent invitations and audit logging.

The existing static frontend in the repo root is untouched. Wiring it to this API is the next milestone.

## Run it

```bash
cd backend
docker compose up --build          # PostGIS + API on http://localhost:8000
docker compose exec web python manage.py createsuperuser   # asks for a phone number
docker compose exec web pytest
```

Without Docker you need PostgreSQL with PostGIS plus GDAL/GEOS/PROJ installed
(Windows is painful; prefer Docker or WSL). Then `cp .env.example .env`, `pip install -r requirements.txt`,
`python manage.py migrate`, `python manage.py runserver`.

## Load Kenya boundaries

```bash
python manage.py import_boundaries wards.geojson \
    --county-field COUNTY_NAM --constituency-field CONSTITUEN --ward-field WARD
```

One ward-level GeoJSON is enough: constituencies and counties are dissolved from the wards.
Check your file's property names and pass them with the `--*-field` options.
**Before production, verify the dataset's provenance, boundary accuracy and licence, and add the
required attribution.** Constituencies are used as the "sub-county" level.

## API (all under `/api/v1/`)

| Area | Endpoints |
|---|---|
| Auth | `POST auth/otp/request/`, `POST auth/otp/verify/` (creates account for new phones), `POST auth/login/` (email or phone + password), `POST auth/refresh/`, `POST auth/password/`, `GET/PATCH me/` |
| Landlord verification | `GET/POST landlord/verification/` (upload ID docs), `GET admin/verifications/`, `POST admin/verifications/{id}/approve\|reject/`, `GET verification-documents/{id}/file/` (owner or staff only) |
| Boundaries | `GET geo/counties/`, `geo/constituencies/?county=`, `geo/wards/?constituency=&q=`, `geo/wards/{id}/` (add `?geometry=1&simplify=0.002` for map polygons) |
| Counts for the map | `GET geo/counts/?level=county\|constituency\|ward&county=\|constituency=` returns available-unit counts only, no listings or geometry |
| Search | `GET units/nearby/?lat=&lng=&radius_km=`, `units/in-area/?ward=\|constituency=\|county=\|polygon=<GeoJSON>\|bbox=`, `units/markers/?bbox=` (one pin per property), plus filters `min_rent max_rent bedrooms min_bedrooms unit_type=a,b property_type q` |
| Listings | `properties/`, `units/` (CRUD, scoped by role), `units/{id}/media/` (metadata), `media/cloudinary-signature/` |
| Agents | `properties/{id}/agents/` (owner invites), `agent-invites/mine/`, `agent-invites/{token}/accept/` |
| Saved areas | `saved-searches/` (radius, area or drawn polygon; alert channels need explicit consent) |

## Rules enforced (and tested)

- Only tenant/landlord/agent can self-register; admin/staff are created by an admin. A role can't be changed through the API.
- A listing is public only if the unit is active and `available` **and** the landlord is verified by an admin.
- Landlords see only their properties; agents only properties they accepted an invite for; admins everything. Agents can't create properties or invite others.
- Unit status can be set manually only to `available`/`occupied`; the other states belong to the booking workflow.
- Coordinates outside Kenya (including swapped lat/lng) are rejected. Search areas are size-limited.
- ID documents live in private storage and are served only through an authenticated view (`Cache-Control: no-store`), each view logged.
- Media URLs must be https on your Cloudinary account. Signing uses the API secret server-side only.
- OTPs are HMAC-hashed, expire in 5 min, lock after 5 wrong tries, max 3 requests per phone per 10 min.

## Decisions to revisit

- **Exact pins are public** (as requested). Only available units are public, so occupied homes disappear
  from the map, but an available listing's exact location is visible to everyone. Consider an
  "approximate until viewing confirmed" option if landlords or tenants raise privacy or scam concerns.
- Private documents use local disk; on Render attach a persistent disk (see `render.yaml`) or move to a private S3/R2 bucket.
- The Africa's Talking SMS integration is written but untested against the live API.
- `SavedSearch.matching_unit()` is correct but loops over radius searches in Python; replace with a pure-SQL
  match when alert volume grows.
- Email addresses aren't verified yet.

## Not built yet (next milestones)

Bookings (viewings, applications, reservations, tenancies) with the status workflow, commissions
(percent of first month's rent, per-landlord override already stored on the user), notification delivery
(WhatsApp, push, email, SMS, Telegram) with duplicate-event protection, WhatsApp bot, and pointing the
frontend at this API.

## Call center (`apps/callcenter`)

Support staff (existing `staff`/`admin` users with a `CallAgent` profile) take and make calls, look up the caller, log tickets and callbacks; supervisors get a live wallboard. All endpoints are under `/api/v1/callcenter/`.

| Area | Endpoints |
|---|---|
| Agent | `GET/PATCH agent/me/` (status: offline, available, break, wrap_up), `GET agents/` (supervisors) |
| Calls | `GET calls/` (agents see their own and the waiting queue; supervisors see all), `POST calls/{id}/accept/`, `POST calls/{id}/end/` (`disposition`, `summary`), `POST calls/outbound/` (`to`), `GET calls/{id}/screen-pop/` |
| Tickets | `tickets/` (list/create/update; `status=resolved` stamps `resolved_at`), `POST tickets/{id}/notes/` |
| Callbacks | `callbacks/` (missed calls create one automatically) |
| Supervisors | `GET wallboard/` (calls today, answer rate, waiting, longest wait, agents by status) |
| Provider | `POST webhook/<TELEPHONY_WEBHOOK_SECRET>/voice/` |

Setup: create a `Queue` per phone-menu option (`ivr_digit` 1, 2, 3), a `CallAgent` for each support user (assign queues), and set `TELEPHONY_WEBHOOK_SECRET` to a long random string. `TELEPHONY_BACKEND=mock` (default) records calls without dialling. The `africastalking` backend and the XML replies in `VoiceWebhookView` are **untested against a live account**: try them in Africa's Talking's sandbox before going live. Agents answer on their registered phone numbers (the caller is bridged with `<Dial>`); a browser softphone is a later step.

Privacy: the screen pop shows only name, role, active leases and overdue balance (never ID numbers or documents) and every lookup is written to the audit log. The menu tells callers the call may be recorded; confirm your recording and retention rules with a lawyer (Kenya Data Protection Act).
