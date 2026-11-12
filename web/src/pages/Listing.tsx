import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { kes } from "../lib/format";
import { useT } from "../lib/i18n";
import type { Amenities, Unit } from "../lib/types";
import { Async } from "../components/data";
import { AreaField, FormError, Icon, PhotoSlot, Skeleton, TextField } from "../components/ui";

function Booking({ unit }: { unit: Unit }) {
  const t = useT();
  const { user } = useAuth();
  const [when, setWhen] = useState("");
  const [msg, setMsg] = useState("");
  const m = useMutation({ mutationFn: () => api("/viewings/", { method: "POST", body: { unit: unit.id, preferred_at: new Date(when).toISOString(), message: msg } }) });
  if (!user) return <Link className="btn btn-block" to="/login" state={{ from: `/listing/${unit.id}` }}>{t("listing.signin")}</Link>;
  if (m.isSuccess) return <p className="notice" role="status"><Icon name="check" />{t("listing.booked")}</p>;
  const err = m.error instanceof ApiError ? m.error : undefined;
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <form onSubmit={submit} className="stack" noValidate>
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
  const q = useQuery({ queryKey: ["unit", id], queryFn: () => api<Unit>(`/units/${id}/`) });
  const am = useQuery({ queryKey: ["amenities"], queryFn: () => api<Amenities>("/amenities/"), staleTime: 3600_000 });
  const label = (k: string) => am.data?.rental.find((a) => a.key === k)?.label ?? k;
  return (
    <div className="wrap page">
      <Async q={q} skeleton={<div role="status" aria-busy="true"><span className="sr-only">{t("common.loading")}</span><Skeleton h={360} r={20} /><div style={{ height: 20 }} /><Skeleton w="50%" h={36} /><div style={{ height: 12 }} /><Skeleton w="30%" h={22} /></div>}>
        {(u) => (
          <div className="detail">
            <div>
              <PhotoSlot src={(u.media.find((m) => m.is_cover) ?? u.media[0])?.url} alt={`${u.property_name}, ${u.unit_type}`} ratio="16 / 10" />
              {u.media.length > 1 && <ul className="thumbs" aria-label="Photos">{u.media.slice(0, 6).map((m) => <li key={m.id}><PhotoSlot src={m.url} alt="" ratio="1 / 1" /></li>)}</ul>}
            </div>
            <div className="stack" style={{ ["--gap" as string]: "18px" }}>
              <h1 className="page-title">{u.bedrooms === 0 ? "Studio" : `${u.bedrooms} bedroom`}, {u.estate || u.property_name}</h1>
              <p className="muted row" style={{ gap: 6 }}><Icon name="pin" size={18} />{[u.ward_name, u.county_name].filter(Boolean).join(", ")}</p>
              <p className="price big">{kes(u.rent_amount)}<span className="muted">{t("common.perMonth")}</span></p>
              {u.deposit_amount && <p className="muted">{t("listing.deposit")}: {kes(u.deposit_amount)}</p>}
              {u.amenities.length > 0 && <section aria-labelledby="am"><h2 id="am" className="h3">{t("listing.amenities")}</h2><ul className="chips">{u.amenities.map((a) => <li key={a} className="chip">{label(a)}</li>)}</ul></section>}
              {u.description && <p>{u.description}</p>}
              <section className="card" aria-labelledby="bk"><h2 id="bk" className="h3" style={{ marginBottom: 14 }}>{t("listing.book")}</h2><Booking unit={u} /></section>
            </div>
          </div>
        )}
      </Async>
    </div>
  );
}
