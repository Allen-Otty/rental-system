import { useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError, type Page } from "../lib/api";
import { useAuth } from "../lib/auth";
import { kes } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { Category, Provider } from "../lib/types";
import { Async } from "../components/data";
import { AreaField, FormError, Icon, ListSkeleton, TextField } from "../components/ui";
import { Hero, Pill, useL } from "../components/kit";
import { OrderTracker } from "./Tenant";

export default function Services() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const cats = useQuery({ queryKey: ["cats"], queryFn: () => api<Category[]>("/service-categories/"), staleTime: 3600_000 });
  const L = useL();
  const [sp] = useSearchParams();
  const [slug, setSlug] = useState(sp.get("c") ?? "movers");
  const ICON: Record<string, string> = { movers: "truck", cleaning: "broom", gas: "flame", plumbing: "wrench", electrical: "bolt", laundry: "shirt", water: "drop" };
  const provs = useQuery({ queryKey: ["providers", slug], queryFn: () => api<Page<Provider>>("/providers/", { query: { category: slug } }) });
  const [f, setF] = useState({ from_place: "", to_place: "", description: "", preferred_date: "" });
  const m = useMutation({ mutationFn: () => api("/quote-requests/", { method: "POST", body: { category: slug, ...f, preferred_date: f.preferred_date || null } }) });
  const err = m.error instanceof ApiError ? m.error : undefined;
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="wrap page">
      <h1 className="page-title">{t("svc.title")}</h1>
      <p className="muted" style={{ margin: "8px 0 16px" }}>{t("svc.sub")}</p>
      <div className="stack" style={{ marginBottom: 18 }}>
        <OrderTracker dark />
        <Hero><Pill tone="mango">{L("Rainy season offer", "Ofa ya msimu wa mvua")}</Pill><h2 className="h3" style={{ margin: "8px 0" }}>{L("Home inspection bundle", "Kifurushi cha ukaguzi wa nyumba")}</h2><p className="muted">{L("Solar check, gutter clearing and roof leak fix in one visit.", "Ukaguzi wa sola, usafi wa mifereji na kuziba uvujaji wa paa kwa ziara moja.")}</p><p className="big-n" style={{ margin: "12px 0" }}><small>KES</small>2,400</p><button type="button" className="btn btn-mango" onClick={() => setSlug("plumbing")}>{L("Book bundle", "Weka kifurushi")}</button></Hero>
      </div>
      <Async q={cats} skeleton={<ListSkeleton n={4} card={false} />}>
        {(list) => <div role="group" aria-label={t("svc.title")} className="chips">{list.map((c) => <button key={c.slug} type="button" className="chip" aria-pressed={slug === c.slug} onClick={() => setSlug(c.slug)}><Icon name={ICON[c.slug] ?? "briefcase"} size={16} /> {lang === "sw" ? c.name_sw : c.name_en}</button>)}</div>}
      </Async>
      <div className="two-col">
        <section aria-labelledby="prov"><h2 id="prov" className="h3" style={{ marginBottom: 14 }}>{t("svc.providers")}</h2>
          <Async q={provs} skeleton={<ListSkeleton n={3} card={false} />} isEmpty={(d) => d.results.length === 0}>
            {(d) => <ul className="stack" style={{ listStyle: "none", padding: 0 }}>{d.results.map((p) => (
              <li key={p.id} className="card"><h3 className="h4">{p.business_name}</h3><p className="muted">{p.bio}</p>
                {p.price_from && <p className="price" style={{ marginTop: 8 }}>{t("common.from")} {kes(p.price_from)}</p>}
                <p className="row" style={{ gap: 6, marginTop: 8 }}><Icon name="phone" size={16} /><a href={`tel:${p.phone}`}>{p.phone}</a></p></li>
            ))}</ul>}
          </Async>
        </section>
        <section className="card" aria-labelledby="rq"><h2 id="rq" className="h3" style={{ marginBottom: 14 }}>{t("svc.request")}</h2>
          {m.isSuccess ? <p className="notice" role="status"><Icon name="check" />{t("svc.sent")}</p> : !user ? <Link className="btn btn-block" to="/login" state={{ from: "/services" }}>{t("nav.signin")}</Link> : (
            <form onSubmit={submit} className="stack" noValidate>
              {slug === "movers" && <><TextField label={t("svc.from")} required value={f.from_place} onChange={set("from_place")} error={err?.fields.non_field_errors} /><TextField label={t("svc.to")} required value={f.to_place} onChange={set("to_place")} /></>}
              <AreaField label={t("svc.details")} required value={f.description} onChange={set("description")} maxLength={600} error={err?.fields.description} />
              <TextField label={t("svc.date")} type="date" value={f.preferred_date} onChange={set("preferred_date")} error={err?.fields.preferred_date} />
              <FormError message={err && !err.fields.description && !err.fields.preferred_date ? err.message : undefined} />
              <button className="btn btn-block" type="submit" disabled={m.isPending}>{t("svc.request")}</button>
            </form>)}
        </section>
      </div>
    </div>
  );
}
