import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError, type Page } from "../lib/api";
import { dateShort, kes, monthLabel } from "../lib/format";
import { Link } from "react-router-dom";
import { useI18n } from "../lib/i18n";
import { useAuth } from "../lib/auth";
import { Avatar, Hero, Pill, Progress, SectionHead, Tile, useL, useNotice } from "../components/kit";
import type { Dashboard, Invoice, Lease, Repair, Unit, Vendor } from "../lib/types";
import { Async } from "../components/data";
import { FormError, Icon, ListSkeleton, Loading, SelectField, Skeleton, StatSkeleton, StatusTag, TextField } from "../components/ui";

const Stat = ({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "danger" }) => (
  <div className="card stat"><p className="muted">{label}</p><p className={`stat-n ${tone === "danger" ? "danger" : ""}`}>{value}</p>{sub && <p className="muted">{sub}</p>}</div>
);

interface Queue { viewings: { id: number; name: string; note: string; budget: string; when: string }[]; applications: { id: number; name: string; note: string; detail: string }[] }
export function Overview() {
  const L = useL();
  const { user } = useAuth();
  const qc = useQueryClient();
  const d = useQuery({ queryKey: ["dash"], queryFn: () => api<Dashboard>("/dashboard/landlord/") });
  const mine = useQuery({ queryKey: ["my-units"], queryFn: () => api<Page<Unit>>("/units/", { query: { scope: "mine" } }) });
  const queue = useQuery({ queryKey: ["queue"], queryFn: () => api<Queue>("/landlord/queue/"), retry: false });
  const reps = useQuery({ queryKey: ["repairs"], queryFn: () => api<Page<Repair>>("/repairs/") });
  const remind = useMutation({ mutationFn: () => api<{ sent: number }>("/invoices/remind-overdue/", { method: "POST" }), onSuccess: () => qc.invalidateQueries({ queryKey: ["dash"] }) });
  const gen = useMutation({ mutationFn: () => api<{ created: number }>("/invoices/generate/", { method: "POST", body: {} }), onSuccess: () => qc.invalidateQueries() });
  const n = useNotice();
  const units = mine.data?.results ?? [];
  const byProp = Object.entries(units.reduce<Record<string, { occ: number; all: number }>>((a, u) => { const k = u.property_name; a[k] ??= { occ: 0, all: 0 }; a[k].all += 1; if (u.status === "occupied") a[k].occ += 1; return a; }, {}));
  const open = (reps.data?.results ?? []).filter((r) => r.status !== "done" && r.status !== "closed");
  return (
    <div className="wrap page app"><h1 className="page-title">{L("Landlord workspace", "Nafasi ya mwenye nyumba")}</h1>
      <Async q={d} skeleton={<StatSkeleton />}>{(x) => {
        const collected = Number(x.rent_collected), due = Number(x.rent_due);
        const pct = due > 0 ? (collected / due) * 100 : 0;
        return (
          <div className="stack">
            <p className="strip"><Icon name="building" size={18} /><span className="grow">{L("All properties", "Mali zote")} · {x.occupancy.total} {L("units", "nyumba")}</span><Pill tone="mint">{Math.round(pct)}% {L("collected", "imekusanywa")}</Pill></p>
            <Hero aria-label={L("Rent this month", "Kodi ya mwezi huu")}>
              <p className="small muted">{L("CURRENT MONTH REVENUE", "MAPATO YA MWEZI HUU")}</p>
              <p className="big-n"><small className="mango">KES</small>{collected.toLocaleString("en-KE")}</p>
              <p className="small muted" style={{ margin: "6px 0 8px" }}>{L("of", "kati ya")} {kes(x.rent_due)} {L("due", "inayodaiwa")}</p>
              <Progress value={pct} label={L("Rent collected", "Kodi iliyokusanywa")} />
              <div className="stat-row"><div><strong>{x.occupancy.occupied}</strong><small>{L("Occupied", "Zimejaa")}</small></div><div><strong>{x.occupancy.total - x.occupancy.occupied}</strong><small>{L("Vacant", "Wazi")}</small></div><div><strong>{x.arrears.tenants}</strong><small>{L("Overdue", "Zimechelewa")}</small></div></div>
              <button type="button" className="btn btn-mango" style={{ marginTop: 14 }} onClick={() => remind.mutate()} disabled={remind.isPending}><Icon name="chat" />{L("Send M-Pesa rent reminder SMS", "Tuma SMS ya kikumbusho cha kodi")} ({x.arrears.tenants})</button>
              <Link className="btn btn-dark" to="/mpesa"><Icon name="wallet" />{L("Withdraw net payout", "Toa malipo")}</Link>
              <p role="status" aria-live="polite" className="small muted">{remind.data && L(`${remind.data.sent} reminders sent.`, `Vikumbusho ${remind.data.sent} vimetumwa.`)}{gen.data && L(` ${gen.data.created} invoices created.`, ` Ankara ${gen.data.created} zimeundwa.`)}</p>
            </Hero>
            <SectionHead title={L("Management tools", "Zana za usimamizi")} />
            <div className="tiles four">
              <Tile to="/manage/properties/new" icon="plus" label={L("Add unit or listing", "Ongeza nyumba")} />
              <Tile to="/manage/tenants" icon="users" label={L("Tenant directory", "Wapangaji")} />
              <Tile to="/manage/repairs" icon="wrench" label={L("Log ticket", "Tiketi")} />
              <Tile to="/manage/rent" icon="file" label={L("Rent and tax", "Kodi na ushuru")} />
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => gen.mutate()} disabled={gen.isPending}>{L("Create this month's invoices", "Unda ankara za mwezi huu")}</button>
            <section className="card stack" aria-labelledby="occ"><div className="row between"><div><h2 id="occ" className="h3">{L("Occupancy overview", "Hali ya nyumba")}</h2><p className="muted small">{x.occupancy.occupied} {L("of", "kati ya")} {x.occupancy.total} {L("units occupied", "zimejaa")}</p></div><strong className="h3" style={{ color: "var(--accent)" }}>{x.occupancy.percent}%</strong></div>
              <Progress value={x.occupancy.percent} label={L("Occupancy", "Hali ya nyumba")} />
              {byProp.length > 0 && <ul className="chips-row">{byProp.map(([name, v]) => <li key={name}><Pill tone={v.occ === v.all ? "purple" : "mango"}>{name} ({v.occ}/{v.all})</Pill></li>)}</ul>}
              <Link to="/manage/properties" className="link-btn">{L("Manage properties", "Simamia mali")}</Link></section>
            <SectionHead title={L("Urgent actions", "Vitendo vya haraka")} action={<span className="pill pill-mango">{x.attention.length + (queue.data ? queue.data.viewings.length + queue.data.applications.length : 0)}</span>} />
            <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
              {queue.data?.viewings.map((v) => <li key={`v${v.id}`} className="card stack" style={{ ["--gap" as string]: "8px" }}><div className="row between"><Pill tone="mint" icon="clock">{L("Viewing request", "Ombi la ziara")}</Pill><span className="small">{v.when}</span></div><div className="row"><Avatar name={v.name} size={48} /><div><strong>{v.name}</strong><p className="muted small">{v.note}</p><Pill tone="purple">{L("Budget", "Bajeti")}: KES {Number(v.budget).toLocaleString("en-KE")}</Pill></div></div>
                <div className="row"><Link className="btn btn-ghost btn-sm grow" to="/chat">{L("Message", "Ujumbe")}</Link><button type="button" className="btn btn-mango btn-sm grow" onClick={() => n.show(L("Viewing approved.", "Ziara imeidhinishwa."))}>{L("Approve viewing", "Idhinisha ziara")}</button></div></li>)}
              {queue.data?.applications.map((a) => <li key={`a${a.id}`} className="card stack" style={{ ["--gap" as string]: "8px" }}><div className="row between"><Pill tone="mint" icon="file">{L("Lease application", "Ombi la kupanga")}</Pill><Pill tone="mango">{L("Pending approval", "Inasubiri")}</Pill></div><div><strong>{a.name}</strong><p className="muted small">{a.note}. {a.detail}</p></div><Link className="btn btn-sm" to="/chat">{L("Review and generate digital lease", "Kagua na uunde mkataba")}</Link></li>)}
              {x.attention.map((a, i) => <li key={i} className="card row between"><div><p><strong>{a.title}</strong></p><p className="muted small">{a.detail}</p></div>{a.type === "rent_overdue" ? <StatusTag status="overdue" /> : a.type === "lease_ending" ? <StatusTag status="scheduled" /> : <StatusTag status="open" />}</li>)}
            </ul>
            {n.node}
            {open.length > 0 && <><SectionHead title={L("Active maintenance", "Matengenezo yanayoendelea")} action={<span className="small muted">{open.length} {L("in progress", "yanaendelea")}</span>} />
              <ul className="stack" style={{ listStyle: "none", padding: 0 }}>{open.slice(0, 2).map((r) => <li key={r.id} className="card row between"><div><Pill tone={r.priority === "high" ? "danger" : "mint"}>{r.priority}</Pill><p style={{ marginTop: 6 }}><strong>{r.title}</strong></p><p className="muted small">{r.unit_label}, {r.property_name}</p></div><StatusTag status={r.status} /></li>)}</ul></>}
            <p className="strip"><Icon name="shield" size={18} /><span className="grow small">{L("Deposits and M-Pesa receipts are recorded on Makao for both you and your tenants.", "Amana na risiti za M-Pesa zinarekodiwa kwenye Makao kwa wewe na wapangaji wako.")}</span></p>
            {user?.landlord_verified === false && <p className="notice" role="note"><Icon name="alert" />{L("Your account is waiting for admin verification before listings go public.", "Akaunti yako inasubiri uthibitisho wa msimamizi kabla matangazo hayajaonekana.")}</p>}
          </div>); }}</Async></div>
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
