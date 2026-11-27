import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { kes } from "../lib/format";
import { Icon } from "../components/ui";
import { Hero, Pill, SectionHead, Tile, useL, useNotice } from "../components/kit";

interface Admin { counties: string[]; vault: { held: string; cut: string; growth: string; queue: number }; disputes: { id: string; unit: string; title: string; amount: string; landlord: string; tenant: string; claim: string; note: string }[]; kyc: { id: number; name: string; role: string; doc: string; kind: string }[]; health: [string, string, string][] }

export default function AdminHome() {
  const L = useL();
  const q = useQuery({ queryKey: ["admin"], queryFn: () => api<Admin>("/admin/dashboard/"), retry: false });
  const [county, setCounty] = useState("");
  const [done, setDone] = useState<Record<string, string>>({});
  const n = useNotice();
  const d = q.data;
  return (
    <div className="wrap page app">
      <h1 className="page-title">{L("Admin dashboard", "Dashibodi ya msimamizi")}</h1>
      {q.isPending && <p className="muted" role="status">{L("Loading", "Inapakia")}…</p>}
      {!d && !q.isPending && <p className="card" style={{ marginTop: 16 }}>{L("The admin tools are not connected to the live backend yet.", "Zana za msimamizi bado hazijaunganishwa na mfumo halisi.")}</p>}
      {d && <div className="stack">
        <ul className="chips-row" aria-label={L("County hub", "Kituo cha kaunti")}>{d.counties.map((c) => <li key={c}><button type="button" className="chip" aria-pressed={(county || d.counties[0]) === c} onClick={() => setCounty(c)}>{c}</button></li>)}</ul>
        <Hero aria-label={L("Escrow vault", "Hazina ya escrow")}>
          <div className="row between"><p className="small muted">{L("ESCROW VAULT", "HAZINA YA ESCROW")}</p><Pill tone="ghost" icon="shield">{L("Safeguarded", "Imelindwa")}</Pill></div>
          <p className="small muted" style={{ marginTop: 8 }}>{L("Total escrow held (deposits and disbursements)", "Jumla ya escrow (amana na malipo)")}</p>
          <p className="big-n"><small className="mango">KES</small>{Number(d.vault.held).toLocaleString("en-KE")}</p>
          <div className="cols"><div><small>{L("Platform cut (3%)", "Ada ya jukwaa (3%)")}</small><strong className="mango">{kes(d.vault.cut)}</strong><small>{d.vault.growth} {L("MoM", "kwa mwezi")}</small></div><div><small>{L("Disbursement queue", "Foleni ya malipo")}</small><strong>{d.vault.queue} {L("orders", "maagizo")}</strong><small>5:00 PM</small></div></div>
          <button type="button" className="btn btn-mango" style={{ marginTop: 14 }} onClick={() => n.show(L(`Demo: a batch payout for ${d.vault.queue} orders was queued.`, `Majaribio: malipo ya maagizo ${d.vault.queue} yamewekwa kwenye foleni.`))}><Icon name="wallet" />{L("Trigger batch M-Pesa payout", "Anzisha malipo ya kikundi M-Pesa")}</button>
        </Hero>
        {n.node}
        <SectionHead title={L("Dispute arbitration", "Usuluhishi wa migogoro")} action={<Pill tone="danger">{d.disputes.length} {L("urgent", "dharura")}</Pill>} />
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>{d.disputes.map((x) => (
          <li key={x.id} className="card stack" style={{ ["--gap" as string]: "8px" }}>
            <div className="row between"><Pill tone="mint">#{x.id}</Pill><strong style={{ color: "var(--danger)" }}>{kes(x.amount)}</strong></div>
            <h3 className="h4">{x.title}</h3><p className="muted small">{x.unit}</p>
            <div className="strip"><span className="grow">{x.landlord && `${x.landlord} / ${x.tenant}`} {x.claim}</span></div><p className="muted small">{x.note}</p>
            {done[x.id] ? <p className="notice" role="status"><Icon name="check" />{done[x.id]}</p> : <div className="row"><button type="button" className="btn btn-ghost btn-sm grow" onClick={() => setDone({ ...done, [x.id]: L("Media requested from both sides.", "Ushahidi umeombwa pande zote mbili.") })}>{L("Inspection media", "Ushahidi wa ukaguzi")}</button><button type="button" className="btn btn-mango btn-sm grow" onClick={() => setDone({ ...done, [x.id]: L("Release arbitrated.", "Uamuzi wa kutoa umefanyika.") })}>{L("Arbitrate release", "Amua kutoa")}</button></div>}
          </li>))}</ul>
        <SectionHead title={L("Pending verification", "Uthibitisho unasubiriwa")} action={<span className="small muted">{d.kyc.length} {L("in review", "zinakaguliwa")}</span>} />
        <ul className="stack" style={{ listStyle: "none", padding: 0 }}>{d.kyc.map((k) => (
          <li key={k.id} className="card stack" style={{ ["--gap" as string]: "8px" }}>
            <div className="row"><span className="avatar" style={{ width: 44, height: 44 }}>{k.name[0]}</span><div className="grow"><strong>{k.name}</strong><p className="muted small">{k.role}</p></div><Pill tone={k.kind === "landlord" ? "purple" : "mint"}>{k.kind === "landlord" ? L("New landlord", "Mwenye nyumba mpya") : L("ID attached", "Kitambulisho kimeambatanishwa")}</Pill></div>
            <p className="strip"><Icon name="file" size={16} /><span className="grow">{k.doc}</span></p>
            {done[`k${k.id}`] ? <p className="notice" role="status"><Icon name="check" />{done[`k${k.id}`]}</p> : <div className="row"><button type="button" className="btn btn-ghost btn-sm grow" onClick={() => setDone({ ...done, [`k${k.id}`]: L("Redo requested.", "Wameombwa warudie.") })}>{L("Request redo", "Omba kurudia")}</button><button type="button" className="btn btn-mango btn-sm grow" onClick={() => setDone({ ...done, [`k${k.id}`]: L("Approved.", "Imeidhinishwa.") })}>{L("Approve", "Idhinisha")}</button></div>}
          </li>))}</ul>
        <SectionHead title={L("Platform health", "Hali ya jukwaa")} />
        <div className="tiles">{d.health.map(([v, l, tag]) => <Tile key={l} icon="grid" label={v} sub={l} tag={tag || undefined} />)}</div>
      </div>}
    </div>
  );
}
