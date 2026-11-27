import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError, type Page } from "../lib/api";
import { useAuth } from "../lib/auth";
import { dateShort, kes } from "../lib/format";
import type { Invoice, Lease, Unit } from "../lib/types";
import { AreaField, FormError, Icon, PhotoSlot, TextField } from "../components/ui";
import { Hero, Pill, Progress, SectionHead, Tile, useL } from "../components/kit";

export interface Order { title: string; eta: string; step: number; rider: { name: string; plate: string; rating: number; trips: number } }

export function OrderTracker({ dark = false }: { dark?: boolean }) {
  const L = useL();
  const q = useQuery({ queryKey: ["order"], queryFn: () => api<Order>("/orders/active/"), retry: false });
  if (!q.data) return null;
  const o = q.data;
  const steps = [L("Order placed", "Agizo limewekwa"), L("Picked up", "Imechukuliwa"), L("On the way", "Njiani"), L("Delivered", "Imefika")];
  const Wrap = dark ? Hero : "section";
  return (
    <Wrap className={dark ? "" : "card stack"} aria-label={L("Live order", "Agizo linaloendelea")}>
      <div className="row between"><h2 className="h3"><Icon name="flame" size={20} /> {o.title}</h2><Pill tone="mango">{o.eta}</Pill></div>
      <Progress value={((o.step + 1) / steps.length) * 100} label={steps[o.step]} />
      <ol className="row between small" style={{ listStyle: "none", padding: 0, margin: "8px 0" }}>{steps.map((s, i) => <li key={s} aria-current={i === o.step ? "step" : undefined} style={{ fontWeight: i === o.step ? 800 : 500 }}>{s}</li>)}</ol>
      <div className="row between"><p><strong>{o.rider.name}</strong> · {o.rider.plate}<br /><span className="muted small">{o.rider.rating} ★ ({o.rider.trips}+ {L("trips", "safari")})</span></p><Link className="btn btn-sm btn-mango" to="/services" style={{ width: "auto" }}><Icon name="map" size={16} />{L("Track", "Fuatilia")}</Link></div>
    </Wrap>
  );
}

export function TenantHome() {
  const L = useL();
  const { user } = useAuth();
  const leases = useQuery({ queryKey: ["leases"], queryFn: () => api<Page<Lease>>("/leases/") });
  const inv = useQuery({ queryKey: ["invoices"], queryFn: () => api<Page<Invoice>>("/invoices/") });
  const units = useQuery({ queryKey: ["units", "featured"], queryFn: () => api<Page<Unit>>("/units/", { query: { page_size: 3 } }) });
  const lease = leases.data?.results[0];
  const owed = (inv.data?.results ?? []).reduce((s, i) => s + Number(i.balance), 0);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const m = useMutation({ mutationFn: (unit: number) => api("/repairs/", { method: "POST", body: { unit, title, description: desc } }) });
  const err = m.error instanceof ApiError ? m.error : undefined;
  const first = (user?.full_name ?? "").split(" ")[0];
  return (
    <div className="wrap page app">
      <h1 className="page-title">{L("Hi", "Habari")}, {first}</h1>
      <div className="stack">
        <Link to="/explore" className="searchbar"><Icon name="search" size={20} /><span>{L("Search ward, estate or landmark", "Tafuta wadi, mtaa au alama")}</span></Link>

        {lease ? (
          <Hero aria-label={L("Current lease", "Kodi ya sasa")}>
            <div className="row between"><Pill tone="ghost" icon="home">{L("Current lease", "Kodi ya sasa")}</Pill><span className="small muted">{L("Ends", "Inaisha")} {dateShort(lease.end_date, L("en", "sw") === "sw" ? "sw" : "en")}</span></div>
            <h2 className="h3" style={{ marginTop: 10 }}>{lease.property_name}</h2>
            <p className="muted">{L("Unit", "Nyumba")} {lease.unit_label}</p>
            <div className="inner row between"><div><p className="small muted">{L("Total rent balance", "Salio la kodi")}</p><p className="big-n"><small>KES</small>{Number(owed).toLocaleString("en-KE")}</p></div><Pill tone="ghost" icon="drop">{kes(lease.rent_amount)}{L("/mo", "/mwezi")}</Pill></div>
            <Link className="btn btn-mango" to="/mpesa" style={{ marginTop: 14 }}><Icon name="wallet" />{L("Pay via M-Pesa", "Lipa kwa M-Pesa")}</Link>
          </Hero>
        ) : leases.isSuccess ? (
          <Hero><h2 className="h3">{L("Find your next home", "Tafuta nyumba yako")}</h2><p className="muted" style={{ margin: "6px 0 14px" }}>{L("Browse verified homes and book a viewing.", "Angalia nyumba zilizothibitishwa na uweke ziara.")}</p><Link className="btn btn-mango" to="/explore">{L("Browse homes", "Tazama nyumba")}</Link></Hero>
        ) : null}

        <OrderTracker />

        <SectionHead title={L("Browse inventory", "Tazama nyumba")} action={units.data ? <span className="small muted">{units.data.count} {L("available", "zinapatikana")}</span> : null} />
        <ul className="chips-row">
          <li><Link className="chip" to="/explore" aria-current="true">{L("All rentals", "Zote")}</Link></li>
          <li><Link className="chip" to="/explore">{L("1 and 2 bedroom", "Chumba 1 na 2")}</Link></li>
          <li><Link className="chip" to="/explore">{L("Bedsitters", "Bedsitter")}</Link></li>
        </ul>

        <SectionHead title={L("On-demand services", "Huduma papo hapo")} action={<Link to="/services">{L("View all", "Zote")}</Link>} />
        <div className="tiles">
          <Tile to="/services?c=gas" icon="flame" label={L("Gas refill", "Gesi")} sub={L("From KES 1,100", "Kuanzia KES 1,100")} tag="13kg" />
          <Tile to="/services?c=movers" icon="truck" label={L("Movers", "Wasafirishaji")} sub={L("Trucks and labour", "Lori na vibarua")} />
          <Tile to="/services?c=cleaning" icon="broom" label={L("Cleaners", "Wasafishaji")} sub={L("Home and deep clean", "Nyumba na usafi mkubwa")} tag="Top" />
          <Tile to="/services?c=plumbing" icon="wrench" label={L("Repairs", "Matengenezo")} sub={L("Plumbing and electric", "Mabomba na umeme")} />
        </div>

        <SectionHead title={L("Featured rentals", "Nyumba zilizochaguliwa")} />
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>{(units.data?.results ?? []).map((u) => (
          <li key={u.id} className="card feat"><div className="rel"><PhotoSlot src={(u.media.find((x) => x.is_cover) ?? u.media[0])?.url} alt={`${u.property_name}, ${u.unit_type}`} ratio="16 / 9" /><span className="price-tag">{kes(u.rent_amount)}{L("/mo", "/mwezi")}</span></div>
            <div className="body stack" style={{ ["--gap" as string]: "8px" }}><h3 className="h4">{u.property_name}</h3><p className="muted small">{u.bedrooms === 0 ? L("Studio", "Studio") : `${u.bedrooms} ${L("bed", "chumba")}`} · {u.bathrooms} {L("bath", "bafu")} · {u.estate}</p>
              <div className="row"><Link className="btn btn-ghost btn-sm grow" to="/chat"><Icon name="chat" size={16} />{L("Message", "Ujumbe")}</Link><Link className="btn btn-sm grow" to={`/listing/${u.id}`}>{L("Book tour", "Weka ziara")}</Link></div></div></li>))}</ul>

        <div className="tiles">
          <Tile to="/land" icon="map" label={L("Buy land", "Nunua ardhi")} sub={L("Plots and titles", "Viwanja na hati")} />
          <Tile to="/request" icon="search" label={L("Request a home", "Omba nyumba")} sub="KES 200" />
          <Tile to="/chat" icon="chat" label={L("Messages", "Ujumbe")} sub={L("Your landlord", "Mwenye nyumba")} />
        </div>

        {lease && <section className="card stack" aria-labelledby="rp"><h2 id="rp" className="h3">{L("Report a problem", "Ripoti tatizo")}</h2>
          {m.isSuccess ? <p className="notice" role="status"><Icon name="check" />{L("Sent. Your landlord has been told.", "Imetumwa. Mwenye nyumba ameambiwa.")}</p> : <form className="stack" noValidate onSubmit={(e: FormEvent) => { e.preventDefault(); m.mutate(lease.unit); }}>
            <TextField label={L("What is the problem?", "Tatizo ni nini?")} required value={title} onChange={(e) => setTitle(e.target.value)} error={err?.fields.title} />
            <AreaField label={L("Details", "Maelezo")} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={1500} />
            <FormError message={err && !err.fields.title ? err.message : undefined} /><button className="btn" type="submit" disabled={m.isPending || !title}>{L("Send", "Tuma")}</button></form>}</section>}
      </div>
    </div>
  );
}
