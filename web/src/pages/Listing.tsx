import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { kes } from "../lib/format";
import { useT } from "../lib/i18n";
import MapView from "../components/MapView";
import { Accordion, Avatar, Pill, SectionHead, useL } from "../components/kit";
import type { Amenities, Unit } from "../lib/types";
import { Async } from "../components/data";
import { AreaField, FormError, Icon, PhotoSlot, Skeleton, TextField } from "../components/ui";

function Booking({ unit }: { unit: Unit }) {
  const t = useT();
  const { user } = useAuth();
  const L = useL();
  const [when, setWhen] = useState("");
  const [msg, setMsg] = useState("");
  const slots = [[1, 10, 0], [1, 14, 30], [2, 11, 0], [3, 15, 0]].map(([dd, h, mi]) => { const d = new Date(); d.setDate(d.getDate() + dd); d.setHours(h, mi, 0, 0); const p = (n: number) => String(n).padStart(2, "0"); return [`${d.toLocaleDateString("en-KE", { weekday: "short", day: "numeric" })}, ${p(h)}:${p(mi)}`, `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(h)}:${p(mi)}`] as [string, string]; });
  const m = useMutation({ mutationFn: () => api("/viewings/", { method: "POST", body: { unit: unit.id, preferred_at: new Date(when).toISOString(), message: msg } }) });
  if (!user) return <Link className="btn btn-block" to="/login" state={{ from: `/listing/${unit.id}` }}>{t("listing.signin")}</Link>;
  if (m.isSuccess) return <p className="notice" role="status"><Icon name="check" />{t("listing.booked")}</p>;
  const err = m.error instanceof ApiError ? m.error : undefined;
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <form onSubmit={submit} className="stack" noValidate>
      <div className="slots" role="group" aria-label={L("Quick time slots", "Muda wa haraka")}>{slots.map(([label, v]) => <button key={v} type="button" aria-pressed={when === v} onClick={() => setWhen(v)}>{label}</button>)}</div>
      <TextField label={t("listing.when")} type="datetime-local" required value={when} onChange={(e) => setWhen(e.target.value)} error={err?.fields.preferred_at} />
      <AreaField label={t("listing.message")} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={300} />
      <FormError message={err && !err.fields.preferred_at ? err.message : undefined} />
      <button className="btn btn-block" type="submit" disabled={m.isPending || !when}>{t("listing.book")}</button>
    </form>
  );
}

export default function Listing() {
  const { id } = useParams();
  const t = useT();
  const L = useL();
  const q = useQuery({ queryKey: ["unit", id], queryFn: () => api<Unit>(`/units/${id}/`) });
  const am = useQuery({ queryKey: ["amenities"], queryFn: () => api<Amenities>("/amenities/"), staleTime: 3600_000 });
  const label = (k: string) => am.data?.rental.find((a) => a.key === k)?.label ?? k;
  return (
    <div className="wrap page app" style={{ paddingBottom: 140 }}>
      <Async q={q} skeleton={<div role="status" aria-busy="true"><span className="sr-only">{t("common.loading")}</span><Skeleton h={300} r={20} /><div style={{ height: 20 }} /><Skeleton w="50%" h={36} /><div style={{ height: 12 }} /><Skeleton w="30%" h={22} /></div>}>
        {(u) => (
          <div className="stack">
            <div className="rel"><PhotoSlot src={(u.media.find((m) => m.is_cover) ?? u.media[0])?.url} alt={`${u.property_name}, ${u.unit_type}`} ratio="16 / 10" />
              <span style={{ position: "absolute", left: 10, top: 10, display: "flex", gap: 6, flexWrap: "wrap" }}><Pill tone="mint" icon="check">{u.status === "available" ? L("Vacant, ready to move in", "Wazi, tayari kuhamia") : L("Occupied", "Imejaa")}</Pill></span>
              {u.media.length > 1 && <span className="pill pill-ghost" style={{ position: "absolute", right: 10, bottom: 10, background: "var(--bar)" }}><Icon name="camera" size={14} />1 / {u.media.length}</span>}</div>
            {u.media.length > 1 && <ul className="thumbs" aria-label="Photos">{u.media.slice(0, 6).map((m) => <li key={m.id}><PhotoSlot src={m.url} alt="" ratio="1 / 1" /></li>)}</ul>}
            <div><h1 className="page-title">{u.property_name}</h1><p style={{ fontWeight: 700, marginTop: 14 }}>{L("Unit", "Nyumba")} {u.label} · {u.bedrooms === 0 ? L("Studio", "Studio") : `${u.bedrooms} ${L("bedroom", "chumba")}`}</p>
              <p className="muted row" style={{ gap: 6 }}><Icon name="pin" size={18} />{[u.estate, u.ward_name, u.county_name].filter(Boolean).join(", ")}</p></div>
            <section className="card stack" aria-label={L("Price", "Bei")} style={{ ["--gap" as string]: "8px" }}><p className="price big">{kes(u.rent_amount)}<span className="muted">{t("common.perMonth")}</span></p>
              {u.deposit_amount && <p className="muted small row"><Icon name="lock" size={16} />{t("listing.deposit")}: {kes(u.deposit_amount)}</p>}</section>
            <section className="card stack" aria-label={L("Property host", "Mwenye mali")}><p className="small muted">{L("PROPERTY HOST", "MWENYE MALI")}</p>
              <div className="row"><Avatar name="Landlord" size={48} /><div className="grow"><strong>{L("Makao host", "Mwenyeji wa Makao")}</strong><p className="muted small">{L("Usually replies within an hour", "Hujibu ndani ya saa moja")}</p></div></div>
              <Link className="btn btn-ghost btn-sm" to="/chat"><Icon name="chat" size={16} />{L("Message host", "Tuma ujumbe")}</Link></section>
            <section aria-labelledby="sp"><SectionHead id="sp" title={L("Specs and amenities", "Vipimo na huduma")} />
              <div className="specs"><div><small>{L("Bedrooms", "Vyumba vya kulala")}</small><strong>{u.bedrooms || L("Studio", "Studio")}</strong></div><div><small>{L("Bathrooms", "Bafu")}</small><strong>{u.bathrooms}</strong></div>
                {u.amenities.slice(0, 6).map((a) => <div key={a}><small>{L("Included", "Imejumuishwa")}</small><strong>{label(a)}</strong></div>)}</div></section>
            {u.description && <p>{u.description}</p>}
            <section className="card stack" id="bk" aria-labelledby="bk-h"><div className="row between"><h2 id="bk-h" className="h3">{L("Schedule a viewing", "Weka ratiba ya ziara")}</h2><Pill tone="mango">{L("Free", "Bure")}</Pill></div><Booking unit={u} /></section>
            <section aria-labelledby="rq"><SectionHead id="rq" title={L("Tenancy requirements", "Mahitaji ya upangaji")} />
              <Accordion title={L("1. National ID or passport", "1. Kitambulisho au pasipoti")} icon="file">{L("A clear copy of your ID, checked once.", "Nakala safi ya kitambulisho chako, hukaguliwa mara moja.")}</Accordion>
              <Accordion title={L("2. Three-month M-Pesa statement", "2. Taarifa ya M-Pesa ya miezi mitatu")} icon="wallet">{L("Shows you can pay rent on time.", "Inaonyesha unaweza kulipa kodi kwa wakati.")}</Accordion>
              <Accordion title={L("3. Deposit", "3. Amana")} icon="lock">{u.deposit_amount ? kes(u.deposit_amount) : L("Agreed with the landlord.", "Mnakubaliana na mwenye nyumba.")}</Accordion></section>
            {Number.isFinite(u.latitude) && <section aria-labelledby="nb"><SectionHead id="nb" title={L("Neighbourhood", "Mtaa")} /><div className="mapbox"><MapView units={[u]} /></div></section>}
          </div>
        )}
      </Async>
      {q.data && <div className="bottom-bar"><div className="inner"><div className="grow"><p className="small muted">{L("RENT", "KODI")}</p><strong className="h4">{kes(q.data.rent_amount)}</strong><span className="muted small">{t("common.perMonth")}</span></div><a className="btn btn-ghost btn-sm" href="#bk">{L("Book tour", "Weka ziara")}</a><Link className="btn btn-mango btn-sm" to="/chat">{L("Apply", "Omba")}</Link></div></div>}
    </div>
  );
}
