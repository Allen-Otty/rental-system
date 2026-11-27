import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api, type Page } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateShort, kes } from "../lib/format";
import type { Invoice } from "../lib/types";
import { Icon, StatusTag } from "../components/ui";
import { Hero, Pill, SectionHead, Tile, useL, useNotice } from "../components/kit";
import { ProWallet } from "./Pro";

const isDemo = () => import.meta.env.VITE_DEMO === "1";
interface Summary { unit: string; due_in_days: number; due_day: string; total: string; items: [string, string][]; paybill: string; account: string; early_bird: string; caretaker: { name: string; office: string }; history: { title: string; ref: string; amount: string; note: string; date: string }[] }

export default function Mpesa() {
  const { user } = useAuth();
  const L = useL();
  if (user?.role === "provider") return <div className="wrap page app"><h1 className="page-title">M-Pesa</h1><div className="stack"><ProWallet /></div></div>;
  if (user?.role === "admin" || user?.role === "staff") return <div className="wrap page app"><h1 className="page-title">M-Pesa</h1><div className="stack"><Hero><h2 className="h3">{L("County escrow and payouts", "Escrow ya kaunti na malipo")}</h2><p className="muted" style={{ margin: "6px 0 14px" }}>{L("Batch payouts and the escrow vault are on the admin dashboard.", "Malipo ya kikundi na escrow yako kwenye dashibodi ya msimamizi.")}</p><Link className="btn btn-mango" to="/admin">{L("Open admin dashboard", "Fungua dashibodi")}</Link></Hero></div></div>;
  return user?.role === "tenant" ? <TenantMpesa /> : <LandlordMpesa />;
}

function useInvoices() { return useQuery({ queryKey: ["invoices"], queryFn: () => api<Page<Invoice>>("/invoices/") }); }

function TenantMpesa() {
  const L = useL();
  const { user } = useAuth();
  const inv = useInvoices();
  const sum = useQuery({ queryKey: ["mpesa-summary"], queryFn: () => api<Summary>("/mpesa/summary/"), retry: false });
  const n = useNotice();
  const rows = inv.data?.results ?? [];
  const owed = rows.reduce((s, i) => s + Number(i.balance), 0);
  const total = sum.data ? Number(sum.data.total) : owed;
  const pay = () => n.show(isDemo() ? L(`Demo: an M-Pesa prompt for ${kes(total)} would go to ${user?.phone ?? "your phone"}. Enter your PIN to pay.`, `Majaribio: ombi la M-Pesa la ${kes(total)} lingetumwa kwa ${user?.phone ?? "simu yako"}. Weka PIN kulipa.`) : L("Online rent payment is not switched on yet. Pay your landlord's Till or Paybill and they will record it.", "Malipo ya kodi mtandaoni bado hayajawashwa. Lipa Till au Paybill ya mwenye nyumba, atayarekodi."));
  const soon = () => n.show(L("This is coming soon.", "Hii inakuja hivi karibuni."));
  return (
    <div className="wrap page app">
      <p className="small muted">{L("Tenancy escrow", "Escrow ya upangaji")}</p>
      <h1 className="page-title">M-Pesa Hub</h1>
      <div className="stack">
        <Hero aria-label={L("Outstanding balance", "Salio linalodaiwa")}>
          <div className="row between wrapx"><p className="small">{sum.data?.unit ?? L("Your home", "Nyumba yako")}</p>{sum.data && <Pill tone="mango" icon="clock">{L(`Due in ${sum.data.due_in_days} days (${sum.data.due_day})`, `Siku ${sum.data.due_in_days} zimebaki (${sum.data.due_day})`)}</Pill>}</div>
          <p className="small muted" style={{ marginTop: 12 }}>{L("Total outstanding balance", "Jumla ya deni")}</p>
          <p className="big-n"><small className="mango">KES</small>{total.toLocaleString("en-KE")}</p>
          {sum.data && <div className="cols">{sum.data.items.map(([k, v]) => <div key={k}><small>{k}</small><strong>{kes(v)}</strong></div>)}</div>}
          <button type="button" className="btn btn-mango" onClick={pay} style={{ marginTop: 14 }}><Icon name="wallet" />{L("Pay via M-Pesa express", "Lipa kwa M-Pesa express")}</button>
          {sum.data && <p className="small muted row" style={{ marginTop: 10 }}>Paybill {sum.data.paybill} · {L("Account", "Akaunti")} {sum.data.account}</p>}
        </Hero>
        {n.node}
        <SectionHead title={L("Instant utilities", "Huduma papo hapo")} />
        <div className="tiles"><Tile onClick={soon} icon="bolt" label="KPLC Power" sub={L("Prepaid meter", "Mita ya token")} /><Tile onClick={soon} icon="drop" label={L("Water", "Maji")} sub={L("Water company", "Kampuni ya maji")} /><Tile onClick={soon} icon="users" label={L("Split rent", "Gawa kodi")} sub={L("Roommates", "Wenzako")} /></div>
        {sum.data && <p className="strip"><Pill tone="mango">KES {sum.data.early_bird} {L("OFF", "PUNGUZO")}</Pill>{L(`Pay before the 4th to earn an early bird credit.`, `Lipa kabla ya tarehe 4 upate punguzo.`)}</p>}
        <section className="card stack"><h2 className="h3">{L("Official tenancy statements", "Taarifa rasmi za upangaji")}</h2><p className="muted">{L("Bank-ready PDF receipts for tax returns, employer house allowance or visa checks.", "Risiti za PDF kwa ajili ya kodi, posho ya nyumba au visa.")}</p>
          <div className="row wrapx"><button type="button" className="btn btn-ghost btn-sm" onClick={soon}><Icon name="download" size={16} />{L("Download ledger", "Pakua daftari")}</button><button type="button" className="btn btn-ghost btn-sm" onClick={soon}><Icon name="check" size={16} />{L("Proof of address", "Uthibitisho wa makazi")}</button></div></section>
        <SectionHead title={L("Payment history", "Historia ya malipo")} />
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>
          {rows.map((i) => <li key={`i${i.id}`} className="rowcard"><span className="tile-ico sm"><Icon name="building" size={20} /></span><div className="grow"><p><strong>{L("Rent", "Kodi")} {i.period.slice(0, 7)}</strong></p><p className="muted small">{L("Due", "Tarehe")} {dateShort(i.due_date)}</p></div><div style={{ textAlign: "right" }}><p><strong>{kes(i.amount)}</strong></p><StatusTag status={i.status} /></div></li>)}
          {sum.data?.history.map((h) => <li key={h.ref} className="rowcard"><span className="tile-ico sm"><Icon name="file" size={20} /></span><div className="grow"><p><strong>{h.title}</strong></p><p className="muted small">M-Pesa {h.ref} · {h.note}</p></div><div style={{ textAlign: "right" }}><p><strong>{kes(h.amount)}</strong></p><p className="muted small">{dateShort(h.date)}</p></div></li>)}
        </ul>
        {sum.data && <Link to="/chat" className="rowcard" style={{ textDecoration: "none", color: "inherit" }}><span className="avatar" style={{ width: 44, height: 44 }}>{sum.data.caretaker.name[5] ?? "C"}</span><div className="grow"><p><strong>{L("Caretaker", "Mlinzi")}: {sum.data.caretaker.name}</strong></p><p className="muted small">{sum.data.caretaker.office}</p></div><Icon name="chat" size={20} /></Link>}
      </div>
    </div>
  );
}

function LandlordMpesa() {
  const L = useL();
  const inv = useInvoices();
  const n = useNotice();
  const rows = inv.data?.results ?? [];
  const paid = rows.reduce((s, i) => s + Number(i.paid_amount), 0);
  const owed = rows.reduce((s, i) => s + Number(i.balance), 0);
  return (
    <div className="wrap page app">
      <h1 className="page-title">M-Pesa</h1>
      <div className="stack">
        <Hero><p className="small muted">{L("Rent collected this month", "Kodi iliyokusanywa mwezi huu")}</p><p className="big-n"><small className="mango">KES</small>{paid.toLocaleString("en-KE")}</p>
          <div className="cols"><div><small>{L("Still to collect", "Bado kukusanywa")}</small><strong>{kes(owed)}</strong></div><div><small>{L("Invoices", "Ankara")}</small><strong>{rows.length}</strong></div></div>
          <button type="button" className="btn btn-mango" style={{ marginTop: 14 }} onClick={() => n.show(L("Payouts go to your own Till or Paybill. Tenants pay you directly, so there is nothing to withdraw yet.", "Malipo huenda kwenye Till au Paybill yako mwenyewe. Wapangaji hulipa moja kwa moja, hakuna cha kutoa bado."))}><Icon name="wallet" />{L("Withdraw net payout to Till or bank", "Toa malipo kwenda Till au benki")}</button>
        </Hero>
        {n.node}
        <SectionHead title={L("Recent rent", "Kodi ya hivi karibuni")} action={<Link to="/manage/rent">{L("All rent", "Zote")}</Link>} />
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>{rows.map((i) => <li key={i.id} className="rowcard"><div className="grow"><p><strong>{i.tenant_name}</strong> · {i.unit_label}</p><p className="muted small">{L("Due", "Tarehe")} {dateShort(i.due_date)}</p></div><div style={{ textAlign: "right" }}><p><strong>{kes(i.amount)}</strong></p><StatusTag status={i.status} /></div></li>)}</ul>
      </div>
    </div>
  );
}
