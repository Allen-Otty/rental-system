import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { kes } from "../lib/format";
import { Icon } from "../components/ui";
import { Avatar, Hero, Pill, SectionHead, useL } from "../components/kit";

interface Msg { id: number; from: "me" | "them"; text: string; time: string }
interface Thread { with: { name: string; unit: string; verified: boolean }; lease: { unit: string; term: string; rent: string; escrow: string; signed_by: string }; messages: Msg[]; checklist: number }

export default function Chat() {
  const L = useL();
  const q = useQuery({ queryKey: ["thread"], queryFn: () => api<Thread>("/chat/thread/"), retry: false });
  const [extra, setExtra] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [signed, setSigned] = useState(false);
  const now = () => new Date().toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit" });
  const send = (t: string) => { if (t.trim()) setExtra((m) => [...m, { id: 1000 + m.length, from: "me", text: t.trim(), time: now() }]); };
  if (q.isPending) return <div className="wrap page app"><h1 className="page-title">{L("Messages", "Ujumbe")}</h1><p className="muted" role="status">{L("Loading", "Inapakia")}…</p></div>;
  if (!q.data) return <div className="wrap page app"><h1 className="page-title">{L("Messages", "Ujumbe")}</h1><p className="card" style={{ marginTop: 16 }}>{L("In-app messaging is not connected yet. For now, reach your landlord by phone or WhatsApp.", "Ujumbe ndani ya programu bado haujaunganishwa. Kwa sasa wasiliana na mwenye nyumba kwa simu au WhatsApp.")}</p></div>;
  const d = q.data;
  const all = [...d.messages, ...extra];
  const quick = [L("Send M-Pesa rent receipt", "Tuma risiti ya kodi"), L("Request fundi callout", "Omba fundi")];
  return (
    <div className="wrap page app">
      <div className="row" style={{ gap: 12 }}><Avatar name={d.with.name} size={52} /><div className="grow"><h1 className="h3">{d.with.name}</h1><p className="muted small">{d.with.unit}</p></div>{d.with.verified && <Pill tone="mint" icon="check">{L("Verified", "Amethibitishwa")}</Pill>}</div>
      <div className="stack" style={{ marginTop: 16 }}>
        <p className="strip"><Icon name="lock" size={16} />{L("Official tenancy legal channel. Messages are time-stamped.", "Njia rasmi ya kisheria ya upangaji. Ujumbe una muhuri wa muda.")}</p>
        <Hero aria-label={L("Digital tenancy agreement", "Mkataba wa upangaji")}>
          <div className="row between"><p className="small muted">{L("OFFICIAL DOCUMENT", "NYARAKA RASMI")}</p><Pill tone={signed ? "mint" : "mango"}>{signed ? L("Signed", "Imetiwa saini") : L("Pending e-sign", "Inasubiri saini")}</Pill></div>
          <h2 className="h3" style={{ margin: "8px 0" }}>{L("Digital tenancy agreement ready", "Mkataba wa kidijitali uko tayari")}</h2>
          <div className="inner stack" style={{ ["--gap" as string]: "6px" }}>
            <p className="row between"><span className="muted">{L("Terms and premises", "Masharti na nyumba")}</span><strong>{d.lease.term}, {d.lease.unit}</strong></p>
            <p className="row between"><span className="muted">{L("Monthly rent", "Kodi ya mwezi")}</span><strong className="mango">{kes(d.lease.rent)}</strong></p>
            <p className="row between"><span className="muted">{L("Refundable escrow", "Amana inayorudishwa")}</span><strong>{kes(d.lease.escrow)}</strong></p>
            <p className="small row"><Icon name="check" size={14} />{L("Signed by landlord", "Imesainiwa na mwenye nyumba")} {d.lease.signed_by}</p>
          </div>
          <button type="button" className="btn btn-mango" style={{ marginTop: 14 }} disabled={signed} onClick={() => setSigned(true)}><Icon name="fingerprint" />{signed ? L("Signed. Copy saved to your documents", "Imesainiwa. Nakala imehifadhiwa") : L("Review and sign with biometrics", "Soma na utie saini kwa alama ya kidole")}</button>
        </Hero>
        <ul className="stack" style={{ listStyle: "none", padding: 0 }} aria-label={L("Conversation", "Mazungumzo")}>{all.map((m) => (
          <li key={m.id} className={`bubble ${m.from}`}><p className="small row between" style={{ gap: 12 }}><strong>{m.from === "me" ? L("You", "Wewe") : d.with.name}</strong><span>{m.time}</span></p><p>{m.text}</p></li>))}</ul>
        <section className="card row between" aria-label="Checklist"><span className="row"><Icon name="check" /><strong>{L(`Automated move-in checklist, ${d.checklist} items`, `Orodha ya kuhamia, vitu ${d.checklist}`)}</strong></span></section>
        <SectionHead title={L("Quick actions", "Vitendo vya haraka")} />
        <ul className="chips-row">{quick.map((x) => <li key={x}><button type="button" className="chip" onClick={() => send(x)}>{x}</button></li>)}</ul>
        <form className="composer" onSubmit={(e: FormEvent) => { e.preventDefault(); send(text); setText(""); }}>
          <input aria-label={L("Type a message", "Andika ujumbe")} value={text} onChange={(e) => setText(e.target.value)} placeholder={L("Type a message", "Andika ujumbe")} />
          <button className="btn btn-mango" type="submit" aria-label={L("Send", "Tuma")} style={{ minWidth: 52 }}><Icon name="send" /></button>
        </form>
        <p className="muted small">{L("Demo: messages you send here are not delivered anywhere.", "Majaribio: ujumbe unaotuma hapa haufiki popote.")}</p>
      </div>
    </div>
  );
}
