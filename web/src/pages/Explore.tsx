import { lazy, Suspense, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Page } from "../lib/api";
import { kes } from "../lib/format";
import { useT } from "../lib/i18n";
import type { County, Unit } from "../lib/types";
import { Async } from "../components/data";
import { Icon, ListSkeleton, PhotoSlot, SelectField, Skeleton, TextField } from "../components/ui";

const MapView = lazy(() => import("../components/MapView"));

export function UnitCard({ u }: { u: Unit }) {
  const t = useT();
  const cover = u.media.find((m) => m.is_cover) ?? u.media[0];
  const title = `${u.bedrooms === 0 ? "Studio" : `${u.bedrooms} bedroom`}, ${u.estate || u.property_name}`;
  return (
    <article className="card listing">
      <Link to={`/listing/${u.id}`} className="listing-link" aria-label={`${title}, ${kes(u.rent_amount)} ${t("common.perMonth")}`}>
        <PhotoSlot src={cover?.url} alt="" ratio="4 / 3" />
        <div className="listing-body">
          <h2>{title}</h2>
          <p className="price">{kes(u.rent_amount)}<span className="muted">{t("common.perMonth")}</span></p>
          <p className="muted row" style={{ gap: 6 }}><Icon name="pin" size={16} />{[u.ward_name, u.county_name].filter(Boolean).join(", ")}</p>
          <p className="muted row" style={{ gap: 14 }}><span className="row" style={{ gap: 4 }}><Icon name="bed" size={16} />{t("listing.beds", { n: u.bedrooms })}</span><span className="row" style={{ gap: 4 }}><Icon name="bath" size={16} />{t("listing.baths", { n: u.bathrooms })}</span></p>
        </div>
      </Link>
    </article>
  );
}

export default function Explore() {
  const t = useT();
  const [sp, setSp] = useSearchParams();
  const [view, setView] = useState<"list" | "map">("list");
  const f = { q: sp.get("q") ?? "", county: sp.get("county") ?? "", max_rent: sp.get("max_rent") ?? "", min_bedrooms: sp.get("min_bedrooms") ?? "" };
  const set = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); setSp(n, { replace: true }); };
  const counties = useQuery({ queryKey: ["counties"], queryFn: () => api<County[] | Page<County>>("/geo/counties/"), staleTime: 3600_000 });
  const list = counties.data ? (Array.isArray(counties.data) ? counties.data : counties.data.results) : [];
  const units = useQuery({ queryKey: ["units", f], queryFn: () => api<Page<Unit>>("/units/", { query: f }) });
  return (
    <div className="wrap page">
      <h1 className="page-title">{t("explore.title")}</h1>
      <form className="filters card" role="search" aria-label={t("common.filters")} onSubmit={(e) => e.preventDefault()}>
        <TextField label={t("common.search")} type="search" value={f.q} onChange={(e) => set("q", e.target.value)} placeholder={t("landing.search")} />
        <SelectField label={t("explore.county")} value={f.county} onChange={(e) => set("county", e.target.value)}>
          <option value="">{t("explore.anyCounty")}</option>
          {list.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </SelectField>
        <TextField label={t("explore.maxRent")} type="number" inputMode="numeric" min={0} step={500} value={f.max_rent} onChange={(e) => set("max_rent", e.target.value)} />
        <SelectField label={t("explore.beds")} value={f.min_bedrooms} onChange={(e) => set("min_bedrooms", e.target.value)}>
          <option value="">{t("explore.any")}</option>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}+</option>)}
        </SelectField>
      </form>
      <div className="row between" style={{ margin: "20px 0 14px" }}>
        <p aria-live="polite" role="status" className="muted">{units.data ? t("explore.results", { n: units.data.count }) : <Skeleton w={140} h={18} />}</p>
        <div role="group" aria-label={t("explore.title")} className="row" style={{ gap: 8 }}>
          {(["list", "map"] as const).map((v) => <button key={v} type="button" className="chip" aria-pressed={view === v} onClick={() => setView(v)}>{t(v === "list" ? "explore.list" : "explore.map")}</button>)}
        </div>
      </div>
      <Async q={units} skeleton={<ListSkeleton />} isEmpty={(d) => d.results.length === 0} empty={<div className="card"><p>{t("explore.empty")}</p></div>}>
        {(d) => view === "list" ? <div className="grid grid-auto">{d.results.map((u) => <UnitCard key={u.id} u={u} />)}</div> : (
          <>
            <p className="muted" style={{ marginBottom: 10 }}>{t("explore.mapNote")}</p>
            <Suspense fallback={<Skeleton h={420} r={16} />}><MapView units={d.results} /></Suspense>
          </>
        )}
      </Async>
    </div>
  );
}
