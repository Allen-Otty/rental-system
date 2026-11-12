import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Page } from "../lib/api";
import { dateShort, kes, monthLabel } from "../lib/format";
import { useI18n } from "../lib/i18n";
import type { Dashboard, Invoice, Lease, Repair, Unit, Vendor } from "../lib/types";
import { Async } from "../components/data";
import { FormError, Icon, ListSkeleton, Loading, SelectField, Skeleton, StatSkeleton, StatusTag, TextField } from "../components/ui";

const Stat = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" }) => (
  <div className="card stat"><p className="muted">{label}</p><p className={`stat-n ${tone === "danger" ? "danger" : ""}`}>{value}</p>{sub && <p className="muted">{sub}</p>}</div>
);

export function Overview() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["dash"], queryFn: () => api<Dashboard>("/dashboard/landlord/") });
  const remind = useMutation({ mutationFn: () => api<{ sent: number }>("/invoices/remind-overdue/", { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["dash"] }) });
  const gen = useMutation({ mutationFn: () => api<{ created: number }>("/invoices/generate/", { method: "POST", body: {} }), onSuccess: () => qc.invalidateQueries() });
  return (
    <div className="wrap page"><h1 className="page-title">{t("mg.title")}</h1>
      <Async q={d} skeleton={<StatSkeleton />}>{(x) => (
        <>
          <div className="grid stats" style={{ margin: "20px 0" }}>
            <Stat label={t("mg.collected")} value={kes(x.rent_collected)} sub={`${t("mg.due")}: ${kes(x.rent_due)}`} />
            <Stat label={t("mg.occupancy")} value={`${x.occupancy.percent}%`} sub={`${x.occupancy.occupied} / ${x.occupancy.total}`} />
            <Stat label={t("mg.arrears")} value={kes(x.arrears.amount)} sub={`${x.arrears.tenants}`} tone={Number(x.arrears.amount) > 0 ? "danger" : undefined} />
            <Stat label={t("mg.repairs")} value={String(x.open_repairs)} sub={x.repairs_needing_vendor ? `${x.repairs_needing_vendor} → ${t("mg.assign")}` : undefined} />
          </div>
          <div className="row wrapx" style={{ gap: 12, marginBottom: 28 }}>
            <button className="btn" type="button" onClick={() => remind.mutate()} disabled={remind.isPending}>{t("mg.remind")}</button>
            <button className="btn btn-ghost" type="button" onClick={() => gen.mutate()} disabled={gen.isPending}>{t("mg.generate")}</button>
            <p role="status" aria-live="polite" className="muted">{remind.data && t("mg.reminded", { n: remind.data.sent })}{gen.data && t("mg.generated", { n: gen.data.created })}</p>
          </div>
          <section aria-labelledby="att"><h2 id="att" className="h3" style={{ marginBottom: 12 }}>{t("mg.attention")}</h2>
            {x.attention.length === 0 ? <p className="muted">{t("common.none")}</p> : <ul className="stack" style={{ listStyle: "none", padding: 0 }}>{x.attention.map((a, i) => (
              <li key={i} className="card row between"><div><p><strong>{a.title}</strong></p><p className="muted">{a.detail}</p></div>{a.type === "rent_overdue" ? <StatusTag status="overdue" /> : a.type === "lease_ending" ? <StatusTag status="scheduled" /> : <StatusTag status="open" />}</li>
            ))}</ul>}
          </section>
        </>)}</Async></div>
  );
}

export function Rent() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const inv = useQuery({ queryKey: ["invoices"], queryFn: () => api<Page<Invoice>>("/invoices/") });
  const [open, setOpen] = useState<number | null>(null);
  const [f, setF] = useState({ amount: "", method: "mpesa", reference: "", paid_on: new Date().toISOString().slice(0, 10) });
  const pay = useMutation({ mutationFn: (id: number) => api(`/invoices/${id}/payments/`, { method: "POST", body: f }), onSuccess: () => { setOpen(null); setF({ ...f, amount: "", reference: "" }); qc.invalidateQueries(); } });
  const err = pay.error instanceof ApiError ? pay.error : undefined;
  const submit = (id: number) => (e: FormEvent) => { e.preventDefault(); pay.mutate(id); };
  return (
    <div className="wrap page"><h1 className="page-title">{t("mg.invoices")}</h1>
      <Async q={inv} skeleton={<ListSkeleton card={false} n={5} />} isEmpty={(d) => d.results.length === 0}>{(d) => (
        <ul className="stack" style={{ listStyle: "none", padding: 0, marginTop: 20 }}>{d.results.map((i) => (
          <li key={i.id} className="card">
            <div className="row between wrapx"><div><p><strong>{i.tenant_name}</strong> · {i.unit_label}</p><p className="muted">{monthLabel(i.period, lang)} · {dateShort(i.due_date, lang)}</p></div>
              <div className="row" style={{ gap: 12 }}><div style={{ textAlign: "right" }}><p><strong>{kes(i.amount)}</strong></p>{Number(i.balance) > 0 && Number(i.balance) < Number(i.amount) && <p className="muted">{kes(i.balance)}</p>}</div><StatusTag status={i.status} /></div></div>
            {i.status !== "paid" && (open === i.id ? (
              <form onSubmit={submit(i.id)} className="stack" style={{ marginTop: 14 }} noValidate>
                <div className="two"><TextField label={t("mg.amount")} type="number" required inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} error={err?.fields.amount} />
                  <SelectField label={t("mg.method")} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="mpesa">M-Pesa</option><option value="cash">Cash</option><option value="bank">Bank</option></SelectField></div>
                {f.method === "mpesa" && <TextField label={t("mg.reference")} required value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} error={err?.fields.reference} />}
                <TextField label={t("mg.paidOn")} type="date" required value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} error={err?.fields.paid_on} />
                <FormError message={err && !Object.keys(err.fields).length ? err.message : undefined} />
                <div className="row" style={{ gap: 10 }}><button className="btn btn-sm" type="submit" disabled={pay.isPending}>{t("mg.record")}</button><button className="btn btn-ghost btn-sm" type="button" onClick={() => setOpen(null)}>{t("common.cancel")}</button></div>
              </form>) : <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 12 }} onClick={() => { setOpen(i.id); setF({ ...f, amount: String(Math.round(Number(i.balance))) }); }}>{t("mg.record")}</button>)}
          </li>))}</ul>)}</Async></div>
  );
}

export function Tenants() {
  const { t, lang } = useI18n();
  const qc = useQueryClient();
  const leases = useQuery({ queryKey: ["leases"], queryFn: () => api<Page<Lease>>("/leases/") });
  const units = useQuery({ queryKey: ["myunits"], queryFn: () => api<Page<Unit>>("/units/", { query: { scope: "mine" } }) });
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ unit: "", tenant_name: "", tenant_phone: "", start_date: "", end_date: "", rent_amount: "" });
  const add = useMutation({ mutationFn: () => api("/leases/", { method: "POST", body: { ...f, unit: Number(f.unit), rent_due_day: 1, deposit_amount: 0 } }), onSuccess: () => { setShow(false); qc.invalidateQueries(); } });
  const err = add.error instanceof ApiError ? add.error : undefined;
  const on = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="wrap page"><div className="row between wrapx"><h1 className="page-title">{t("mg.tenants")}</h1><button type="button" className="btn" aria-expanded={show} onClick={() => setShow(!show)}>{t("mg.addTenant")}</button></div>
      {show && <form className="card stack" style={{ margin: "20px 0" }} noValidate onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <SelectField label={t("mg.unit")} required value={f.unit} onChange={on("unit")} error={err?.fields.unit}><option value="">—</option>{units.data?.results.map((u) => <option key={u.id} value={u.id}>{u.property_name} · {u.label}</option>)}</SelectField>
        <div className="two"><TextField label={t("mg.tenantName")} required value={f.tenant_name} onChange={on("tenant_name")} error={err?.fields.tenant_name} /><TextField label={t("auth.phone")} required type="tel" value={f.tenant_phone} onChange={on("tenant_phone")} error={err?.fields.tenant_phone} /></div>
        <div className="two"><TextField label={t("mg.start")} type="date" required value={f.start_date} onChange={on("start_date")} error={err?.fields.start_date} /><TextField label={t("mg.end")} type="date" required value={f.end_date} onChange={on("end_date")} error={err?.fields.end_date} /></div>
        <TextField label={t("mg.rent")} type="number" required inputMode="numeric" value={f.rent_amount} onChange={on("rent_amount")} error={err?.fields.rent_amount} />
        <FormError message={err && !Object.keys(err.fields).length ? err.message : undefined} />
        <button className="btn" type="submit" disabled={add.isPending}>{t("common.save")}</button></form>}
      <Async q={leases} skeleton={<ListSkeleton card={false} n={4} />} isEmpty={(d) => d.results.length === 0}>{(d) => (
        <ul className="stack" style={{ listStyle: "none", padding: 0, marginTop: 20 }}>{d.results.map((l) => (
          <li key={l.id} className="card row between wrapx"><div><p><strong>{l.tenant_name}</strong></p><p className="muted">{l.property_name} · {l.unit_label}</p><p className="muted">{dateShort(l.start_date, lang)} – {dateShort(l.end_date, lang)} · {kes(l.rent_amount)}</p></div><StatusTag status={l.status} /></li>))}</ul>)}</Async></div>
  );
}

export function Repairs() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const reps = useQuery({ queryKey: ["repairs"], queryFn: () => api<Page<Repair>>("/repairs/") });
  const vendors = useQuery({ queryKey: ["vendors"], queryFn: () => api<Page<Vendor>>("/vendors/") });
  const patch = useMutation({ mutationFn: ({ id, body }: { id: number; body: object }) => api(`/repairs/${id}/`, { method: "PATCH", body }), onSuccess: () => qc.invalidateQueries({ queryKey: ["repairs"] }) });
  return (
    <div className="wrap page"><h1 className="page-title">{t("mg.repairsTitle")}</h1>
      <Async q={reps} skeleton={<ListSkeleton card={false} n={4} />} isEmpty={(d) => d.results.length === 0}>{(d) => (
        <ul className="stack" style={{ listStyle: "none", padding: 0, marginTop: 20 }}>{d.results.map((r) => (
          <li key={r.id} className="card stack" style={{ ["--gap" as string]: "10px" }}>
            <div className="row between wrapx"><div><p><strong>{r.title}</strong></p><p className="muted">{r.property_name} · {r.unit_label}</p></div><StatusTag status={r.status} /></div>
            {r.description && <p>{r.description}</p>}
            <div className="two">
              <SelectField label={t("mg.assign")} value={r.vendor ?? ""} onChange={(e) => patch.mutate({ id: r.id, body: { vendor: Number(e.target.value) || null } })}><option value="">—</option>{vendors.data?.results.map((v) => <option key={v.id} value={v.id}>{v.name} ({v.trade})</option>)}</SelectField>
              <SelectField label="Status" value={r.status} onChange={(e) => patch.mutate({ id: r.id, body: { status: e.target.value } })}>{(["open", "scheduled", "in_progress", "done", "closed"] as const).map((s) => <option key={s} value={s}>{t(`status.${s}`)}</option>)}</SelectField>
            </div>
            {r.updates.length > 0 && <ol className="timeline" aria-label="Updates">{r.updates.slice(0, 4).map((u) => <li key={u.id}>{u.text}</li>)}</ol>}
          </li>))}</ul>)}</Async></div>
  );
}
export { Icon, Loading, Skeleton };
