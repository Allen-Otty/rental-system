import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Page } from "../lib/api";
import { dateShort, kes, monthLabel } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { Invoice, Lease, Quote, QuoteRequest } from "../lib/types";
import { Async } from "../components/data";
import { AreaField, FormError, Icon, ListSkeleton, StatusTag, TextField } from "../components/ui";

export function TenantHome() {
  const { t, lang } = useI18n();
  const leases = useQuery({ queryKey: ["leases"], queryFn: () => api<Page<Lease>>("/leases/") });
  const inv = useQuery({ queryKey: ["invoices"], queryFn: () => api<Page<Invoice>>("/invoices/") });
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const m = useMutation({ mutationFn: (unit: number) => api("/repairs/", { method: "POST", body: { unit, title, description: desc } }) });
  const err = m.error instanceof ApiError ? m.error : undefined;
  return (
    <div className="wrap page"><h1 className="page-title">{t("th.home")}</h1>
      <Async q={leases} skeleton={<ListSkeleton card={false} n={2} />} isEmpty={(d) => d.results.length === 0} empty={<div className="card stack"><p>{t("common.none")}</p><Link className="btn" to="/explore">{t("nav.explore")}</Link></div>}>{(d) => {
        const l = d.results[0];
        return <div className="stack" style={{ marginTop: 20, ["--gap" as string]: "24px" }}>
          <div className="card"><p><strong>{l.property_name} · {l.unit_label}</strong></p><p className="muted">{dateShort(l.start_date, lang)} – {dateShort(l.end_date, lang)} · {kes(l.rent_amount)}</p></div>
          <section aria-labelledby="ri"><h2 id="ri" className="h3" style={{ marginBottom: 12 }}>{t("mg.invoices")}</h2>
            <Async q={inv} skeleton={<ListSkeleton card={false} n={3} />} isEmpty={(x) => x.results.length === 0}>{(x) => <ul className="stack" style={{ listStyle: "none", padding: 0 }}>{x.results.map((i) => <li key={i.id} className="card row between"><div><p><strong>{monthLabel(i.period, lang)}</strong></p><p className="muted">{dateShort(i.due_date, lang)}</p></div><div className="row" style={{ gap: 12 }}><strong>{kes(i.balance)}</strong><StatusTag status={i.status} /></div></li>)}</ul>}</Async></section>
          <section className="card" aria-labelledby="rp"><h2 id="rp" className="h3" style={{ marginBottom: 14 }}>{t("th.report")}</h2>
            {m.isSuccess ? <p className="notice" role="status"><Icon name="check" />{t("th.reported")}</p> : <form className="stack" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(l.unit); }}>
              <TextField label={t("th.problem")} required value={title} onChange={(e) => setTitle(e.target.value)} error={err?.fields.title} /><AreaField label="Details" value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={1500} />
              <FormError message={err && !err.fields.title ? err.message : undefined} /><button className="btn" type="submit" disabled={m.isPending || !title}>{t("common.send")}</button></form>}</section>
        </div>; }}</Async></div>
  );
}

export function ProInbox() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["inbox"], queryFn: () => api<Page<QuoteRequest>>("/quote-requests/", { query: { inbox: 1 } }) });
  const [price, setPrice] = useState<Record<number, string>>({});
  const [note, setNote] = useState<Record<number, string>>({});
  const send = useMutation({ mutationFn: (id: number) => api<Quote>(`/quote-requests/${id}/quotes/`, { method: "POST", body: { price: price[id], message: note[id] ?? "" } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["inbox"] }) });
  const err = send.error instanceof ApiError ? send.error : undefined;
  return (
    <div className="wrap page"><h1 className="page-title">{t("pro.title")}</h1>
      <Async q={q} skeleton={<ListSkeleton card={false} n={3} />} isEmpty={(d) => d.results.length === 0}>{(d) => (
        <ul className="stack" style={{ listStyle: "none", padding: 0, marginTop: 20 }}>{d.results.map((r) => (
          <li key={r.id} className="card stack" style={{ ["--gap" as string]: "10px" }}><p><strong>{r.category}</strong>{r.from_place && <> · {r.from_place} → {r.to_place}</>}</p><p>{r.description}</p>
            <form className="two" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); send.mutate(r.id); }}>
              <TextField label={t("pro.price")} type="number" required inputMode="numeric" value={price[r.id] ?? ""} onChange={(e) => setPrice({ ...price, [r.id]: e.target.value })} error={send.variables === r.id ? err?.fields.price : undefined} />
              <TextField label={t("pro.note")} value={note[r.id] ?? ""} onChange={(e) => setNote({ ...note, [r.id]: e.target.value })} />
              <div><button className="btn btn-sm" type="submit" disabled={send.isPending || !price[r.id]}>{t("pro.quote")}</button></div></form>
            {send.isSuccess && send.variables === r.id && <p className="notice" role="status"><Icon name="check" />{t("pro.sent")}</p>}
            {send.variables === r.id && err && !err.fields.price && <FormError message={err.message} />}
          </li>))}</ul>)}</Async></div>
  );
}

export function NotFound() {
  return <div className="wrap narrow page"><h1 className="page-title">404</h1><p className="muted" style={{ margin: "12px 0 20px" }}>We could not find that page.</p><Link className="btn" to="/">Makao</Link></div>;
}
