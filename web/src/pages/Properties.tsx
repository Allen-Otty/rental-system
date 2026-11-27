import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Page } from "../lib/api";
import { kes } from "../lib/format";
import { useI18n, type Key } from "../lib/i18n";
import type { Unit } from "../lib/types";
import { Async } from "../components/data";
import { AreaField, CheckGroup, FormError, Icon, ListSkeleton, PhotoSlot, SelectField, StatusTag, TextField } from "../components/ui";


const P: Record<string, [string, string]> = {
  "pr.title": ["Your properties", "Mali zako"], "pr.add": ["Add property", "Ongeza mali"], "pr.empty": ["No properties yet. Add your first house or building.", "Hujaongeza mali bado. Ongeza nyumba au jengo lako la kwanza."],
  "pr.markOccupied": ["Mark occupied", "Weka imejaa"], "pr.markAvailable": ["Mark available", "Weka inapatikana"], "pr.view": ["View listing", "Tazama tangazo"],
  "pr.newTitle": ["Add a property", "Ongeza mali"], "pr.details": ["Property details", "Maelezo ya mali"], "pr.name": ["Property name", "Jina la mali"], "pr.type": ["Type", "Aina"],
  "pr.building": ["Building with several units", "Jengo lenye nyumba kadhaa"], "pr.house": ["Standalone house", "Nyumba moja"], "pr.estate": ["Estate or area", "Mtaa au eneo"],
  "pr.landmark": ["Landmark (optional)", "Alama ya karibu (si lazima)"], "pr.desc": ["Description", "Maelezo"], "pr.location": ["Pin location", "Weka eneo kwenye ramani"],
  "pr.locHint": ["Tenants see the exact pin on the map.", "Wapangaji wataona eneo kamili kwenye ramani."], "pr.useLocation": ["Use my current location", "Tumia eneo nilipo"],
  "pr.locFail": ["Could not get your location. Type the latitude and longitude instead.", "Imeshindwa kupata eneo lako. Andika latitudo na longitudo."], "pr.lat": ["Latitude", "Latitudo"], "pr.lng": ["Longitude", "Longitudo"],
  "pr.unitN": ["Unit {n}", "Nyumba {n}"], "pr.removeUnit": ["Remove unit", "Ondoa nyumba"], "pr.label": ["Unit name or number", "Jina au namba ya nyumba"], "pr.unitType": ["Unit type", "Aina ya nyumba"],
  "pr.beds": ["Bedrooms", "Vyumba vya kulala"], "pr.baths": ["Bathrooms", "Bafu"], "pr.rent": ["Monthly rent (KES)", "Kodi ya mwezi (KES)"], "pr.deposit": ["Deposit (KES, optional)", "Amana (KES, si lazima)"],
  "pr.status": ["Availability", "Upatikanaji"], "pr.addUnit": ["Add another unit", "Ongeza nyumba nyingine"], "pr.amenities": ["Amenities", "Huduma na vifaa"],
  "pr.photos": ["Photos", "Picha"], "pr.photosHint": ["Add up to 10 photos. The first one is the cover.", "Weka hadi picha 10. Ya kwanza ndiyo ya jalada."], "pr.addPhotos": ["Add photos", "Weka picha"],
  "pr.cover": ["cover", "jalada"], "pr.removePhoto": ["Remove photo", "Ondoa picha"], "pr.publish": ["Publish listing", "Chapisha tangazo"], "pr.saved": ["Property saved. It is now on Explore.", "Mali imehifadhiwa. Sasa inaonekana kwenye Gundua."],
  "pr.photoWarn": ["The listing was saved, but the photos could not be uploaded yet.", "Tangazo limehifadhiwa, lakini picha hazikuweza kupakiwa bado."], "pr.viewList": ["Back to properties", "Rudi kwa mali"],
  "ut.bedsitter": ["Bedsitter", "Bedsitter"], "ut.studio": ["Studio", "Studio"], "ut.1br": ["1 bedroom", "Chumba 1"], "ut.2br": ["2 bedrooms", "Vyumba 2"], "ut.3br": ["3 bedrooms", "Vyumba 3"],
  "ut.4br_plus": ["4+ bedrooms", "Vyumba 4+"], "ut.maisonette": ["Maisonette", "Maisonette"], "ut.bungalow": ["Bungalow", "Bungalow"],
};
function useP() {
  const { t, lang } = useI18n();
  return (k: string, v?: Record<string, string | number>): string => {
    const e = P[k];
    if (!e) return t(k as Key, v as never);
    return Object.entries(v ?? {}).reduce((a, [x, y]) => a.replace(`{${x}}`, String(y)), e[lang === "sw" ? 1 : 0]);
  };
}

const isDemo = () => import.meta.env.VITE_DEMO === "1";
const UNIT_TYPES = ["bedsitter", "studio", "1br", "2br", "3br", "4br_plus", "maisonette", "bungalow"] as const;

/* ---------- The landlord's list of houses ---------- */
export function Properties() {
  const t = useP();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["my-units"], queryFn: () => api<Page<Unit>>("/units/", { query: { scope: "mine" } }) });
  const flip = useMutation({
    mutationFn: (u: Unit) => api(`/units/${u.id}/`, { method: "PATCH", body: { status: u.status === "available" ? "occupied" : "available" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-units"] }),
  });
  return (
    <div className="wrap page">
      <div className="row between wrapx"><h1 className="page-title">{t("pr.title")}</h1><Link className="btn btn-mango" to="/manage/properties/new"><Icon name="plus" />{t("pr.add")}</Link></div>
      <Async q={q} skeleton={<ListSkeleton n={4} />} isEmpty={(d) => d.results.length === 0} empty={<p className="card" style={{ marginTop: 20 }}>{t("pr.empty")}</p>}>{(d) => (
        <ul className="grid grid-auto" style={{ listStyle: "none", padding: 0, marginTop: 20 }}>{d.results.map((u) => (
          <li key={u.id} className="card stack" style={{ ["--gap" as string]: "10px" }}>
            <PhotoSlot src={u.media.find((m) => m.is_cover)?.url ?? u.media[0]?.url} alt={`${u.property_name} ${u.label}`} />
            <div className="row between wrapx"><div><p><strong>{u.property_name}</strong> · {u.label}</p><p className="muted">{u.estate}{u.county_name ? `, ${u.county_name}` : ""}</p></div><StatusTag status={u.status} /></div>
            <p><strong className="price">{kes(u.rent_amount)}</strong><span className="muted">{t("common.perMonth")}</span></p>
            <div className="row wrapx">
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => flip.mutate(u)} disabled={flip.isPending}>{u.status === "available" ? t("pr.markOccupied") : t("pr.markAvailable")}</button>
              <Link className="btn btn-ghost btn-sm" to={`/listing/${u.id}`}>{t("pr.view")}</Link>
            </div>
          </li>))}</ul>)}</Async>
    </div>
  );
}

/* ---------- Add a property (house or building) with its units, amenities and photos ---------- */
interface UnitForm { label: string; unit_type: string; bedrooms: string; bathrooms: string; rent_amount: string; deposit_amount: string; status: string; description: string }
const blankUnit = (): UnitForm => ({ label: "", unit_type: "2br", bedrooms: "2", bathrooms: "1", rent_amount: "", deposit_amount: "", status: "available", description: "" });
interface Photo { file: File; preview: string }

async function uploadToCloudinary(files: File[]) {
  const sig = await api<{ cloud_name: string; api_key: string; timestamp: number; folder: string; signature: string }>("/media/cloudinary-signature/", { method: "POST" });
  const out = [];
  for (const file of files) {
    const fd = new FormData();
    fd.append("file", file); fd.append("api_key", sig.api_key); fd.append("timestamp", String(sig.timestamp)); fd.append("folder", sig.folder); fd.append("signature", sig.signature);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/image/upload`, { method: "POST", body: fd });
    if (!res.ok) throw new Error("upload failed");
    const j = await res.json();
    out.push({ public_id: j.public_id, url: j.secure_url, width: j.width, height: j.height, bytes: j.bytes });
  }
  return out;
}

export function AddProperty() {
  const t = useP();
  const qc = useQueryClient();
  const amen = useQuery({ queryKey: ["amenities"], queryFn: () => api<{ rental: { key: string; label: string }[] }>("/amenities/"), staleTime: 3600_000 });
  const [p, setP] = useState({ name: "", property_type: "building", estate: "", landmark: "", description: "", latitude: "", longitude: "" });
  const [units, setUnits] = useState<UnitForm[]>([blankUnit()]);
  const [amenities, setAmenities] = useState<string[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [locMsg, setLocMsg] = useState("");
  const [warn, setWarn] = useState("");
  const isHouse = p.property_type === "house";

  const setUnit = (i: number, k: keyof UnitForm, v: string) => setUnits((us) => us.map((u, j) => (j === i ? { ...u, [k]: v } : u)));
  const addPhotos = (list: FileList | null) => {
    if (!list) return;
    const next = [...list].filter((f) => f.type.startsWith("image/")).slice(0, 10 - photos.length).map((file) => ({ file, preview: URL.createObjectURL(file) }));
    setPhotos((ph) => [...ph, ...next]);
  };
  const useMyLocation = () => {
    if (!navigator.geolocation) { setLocMsg(t("pr.locFail")); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setP((x) => ({ ...x, latitude: pos.coords.latitude.toFixed(6), longitude: pos.coords.longitude.toFixed(6) })); setLocMsg(""); },
      () => setLocMsg(t("pr.locFail")),
    );
  };
  const lat = Number(p.latitude), lng = Number(p.longitude);
  const valid = p.name.trim() && p.estate.trim() && p.latitude !== "" && p.longitude !== "" && Number.isFinite(lat) && Number.isFinite(lng) && units.every((u) => u.label.trim() && Number(u.rent_amount) > 0);

  const save = useMutation({
    mutationFn: async () => {
      const prop = await api<{ id: number }>("/properties/", { method: "POST", body: { name: p.name.trim(), property_type: p.property_type, description: p.description, estate: p.estate.trim(), landmark: p.landmark.trim(), latitude: lat, longitude: lng } });
      const made: { id: number }[] = [];
      for (const u of units) {
        const body: Record<string, unknown> = { property: prop.id, label: u.label.trim(), unit_type: u.unit_type, bedrooms: Number(u.bedrooms) || 0, bathrooms: Number(u.bathrooms) || 0, rent_amount: u.rent_amount, status: u.status, amenities, description: u.description };
        if (u.deposit_amount) body.deposit_amount = u.deposit_amount;
        if (isDemo()) body._photos = photos.map((x) => x.preview);
        made.push(await api<{ id: number }>("/units/", { method: "POST", body }));
      }
      if (!isDemo() && photos.length) {
        try {
          const ups = await uploadToCloudinary(photos.map((x) => x.file));
          for (const unit of made) for (const [i, m] of ups.entries()) await api(`/units/${unit.id}/media/`, { method: "POST", body: { ...m, kind: "photo", position: i, is_cover: i === 0 } });
        } catch { setWarn(t("pr.photoWarn")); }
      }
      return made;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["my-units"] }); qc.invalidateQueries({ queryKey: ["units"] }); },
  });
  const err = save.error instanceof ApiError ? save.error : undefined;
  const flat = err ? Object.values(err.fields).flat().join(" ") : "";

  if (save.isSuccess) return (
    <div className="wrap narrow page"><h1 className="page-title">{t("pr.saved")}</h1>
      <div className="card stack" style={{ marginTop: 20 }}>
        {warn && <p className="notice" role="status"><Icon name="alert" />{warn}</p>}
        <Link className="btn" to="/manage/properties">{t("pr.viewList")}</Link>
        <Link className="btn btn-ghost" to="/explore">{t("nav.explore")}</Link>
      </div></div>
  );

  const submit = (e: FormEvent) => { e.preventDefault(); if (valid) save.mutate(); };
  const on = (k: keyof typeof p) => (e: { target: { value: string } }) => setP({ ...p, [k]: e.target.value });
  return (
    <div className="wrap narrow page">
      <h1 className="page-title">{t("pr.newTitle")}</h1>
      <form onSubmit={submit} className="stack" noValidate style={{ marginTop: 20 }}>
        <section className="card stack" aria-labelledby="pr-details">
          <h2 id="pr-details" className="section-title">{t("pr.details")}</h2>
          <TextField label={t("pr.name")} required value={p.name} onChange={on("name")} error={err?.fields.name} />
          <SelectField label={t("pr.type")} value={p.property_type} onChange={(e) => { on("property_type")(e); if (e.target.value === "house") setUnits((us) => us.slice(0, 1)); }}>
            <option value="building">{t("pr.building")}</option><option value="house">{t("pr.house")}</option>
          </SelectField>
          <div className="two">
            <TextField label={t("pr.estate")} required value={p.estate} onChange={on("estate")} error={err?.fields.estate} />
            <TextField label={t("pr.landmark")} value={p.landmark} onChange={on("landmark")} />
          </div>
          <AreaField label={t("pr.desc")} value={p.description} onChange={on("description")} />
        </section>

        <section className="card stack" aria-labelledby="pr-loc">
          <h2 id="pr-loc" className="section-title">{t("pr.location")}</h2>
          <p className="muted">{t("pr.locHint")}</p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={useMyLocation}><Icon name="pin" />{t("pr.useLocation")}</button>
          {locMsg && <p role="status" className="form-error">{locMsg}</p>}
          <div className="two">
            <TextField label={t("pr.lat")} required inputMode="decimal" value={p.latitude} onChange={on("latitude")} error={err?.fields.latitude} placeholder="-1.2921" />
            <TextField label={t("pr.lng")} required inputMode="decimal" value={p.longitude} onChange={on("longitude")} error={err?.fields.longitude} placeholder="36.8219" />
          </div>
        </section>

        {units.map((u, i) => (
          <section key={i} className="card stack" aria-labelledby={`pr-u${i}`}>
            <div className="row between"><h2 id={`pr-u${i}`} className="section-title">{t("pr.unitN", { n: i + 1 })}</h2>
              {units.length > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setUnits((us) => us.filter((_, j) => j !== i))}>{t("pr.removeUnit")}</button>}</div>
            <div className="two">
              <TextField label={t("pr.label")} required value={u.label} onChange={(e) => setUnit(i, "label", e.target.value)} placeholder="A1" />
              <SelectField label={t("pr.unitType")} value={u.unit_type} onChange={(e) => setUnit(i, "unit_type", e.target.value)}>
                {UNIT_TYPES.map((k) => <option key={k} value={k}>{t(`ut.${k}`)}</option>)}
              </SelectField>
              <TextField label={t("pr.beds")} type="number" min={0} inputMode="numeric" value={u.bedrooms} onChange={(e) => setUnit(i, "bedrooms", e.target.value)} />
              <TextField label={t("pr.baths")} type="number" min={0} inputMode="numeric" value={u.bathrooms} onChange={(e) => setUnit(i, "bathrooms", e.target.value)} />
              <TextField label={t("pr.rent")} required type="number" min={1} inputMode="numeric" value={u.rent_amount} onChange={(e) => setUnit(i, "rent_amount", e.target.value)} />
              <TextField label={t("pr.deposit")} type="number" min={0} inputMode="numeric" value={u.deposit_amount} onChange={(e) => setUnit(i, "deposit_amount", e.target.value)} />
            </div>
            <SelectField label={t("pr.status")} value={u.status} onChange={(e) => setUnit(i, "status", e.target.value)}>
              <option value="available">{t("status.available")}</option><option value="occupied">{t("status.occupied")}</option>
            </SelectField>
            <AreaField label={t("pr.desc")} value={u.description} onChange={(e) => setUnit(i, "description", e.target.value)} />
          </section>
        ))}
        {!isHouse && <button type="button" className="btn btn-ghost" onClick={() => setUnits((us) => [...us, blankUnit()])}><Icon name="plus" />{t("pr.addUnit")}</button>}

        <section className="card stack">
          <CheckGroup legend={t("pr.amenities")} options={amen.data?.rental ?? []} value={amenities} onChange={setAmenities} />
        </section>

        <section className="card stack" aria-labelledby="pr-photos">
          <h2 id="pr-photos" className="section-title">{t("pr.photos")}</h2>
          <p className="muted">{t("pr.photosHint")}</p>
          <label className="btn btn-ghost btn-sm file-pick"><Icon name="plus" />{t("pr.addPhotos")}
            <input type="file" accept="image/*" multiple onChange={(e) => { addPhotos(e.target.files); e.target.value = ""; }} disabled={photos.length >= 10} />
          </label>
          {photos.length > 0 && <ul className="thumbs" aria-label={t("pr.photos")}>{photos.map((x, i) => (
            <li key={x.preview}><img src={x.preview} alt={`${t("pr.photos")} ${i + 1}${i === 0 ? ` (${t("pr.cover")})` : ""}`} />
              <button type="button" className="thumb-x" aria-label={`${t("pr.removePhoto")} ${i + 1}`} onClick={() => setPhotos((ph) => ph.filter((_, j) => j !== i))}>×</button></li>))}</ul>}
        </section>

        <FormError message={err ? (flat || err.message) : undefined} />
        <button className="btn btn-block" type="submit" disabled={!valid || save.isPending}>{t("pr.publish")}</button>
      </form>
    </div>
  );
}
