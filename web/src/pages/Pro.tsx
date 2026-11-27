import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { kes } from "../lib/format";
import { Icon } from "../components/ui";
import { Hero, Pill, SectionHead, Tile, useL, useNotice } from "../components/kit";
import { ProQuotes } from "./Other";

interface Dash { hub: string; surge: string; status: string; today_total: string; trips: number; request: { payout: string; base: string; tip: string; seconds: number; pickup: { place: string; detail: string; km: number }; drop: { place: string; detail: string; km: number } }; wallet: { balance: string; till: string }; tasks: { id: number; time: string; title: string; amount: string; place: string }[]; hubs: [string, string, boolean][] }
const useDash = () => useQuery({ queryKey: ["pro-dash"], queryFn: () => api<Dash>("/pro/dashboard/"), retry: false });

export function ProWallet() {
  const L = useL();
  const q = useDash();
  const n = useNotice();
  if (!q.data) return <p className="card">{L("Wallet and payouts are not connected yet.", "Pochi na malipo bado havijaunganishwa.")}</p>;
  return (
    <>
      <Hero><div className="row between"><h2 className="h3"><Icon name="wallet" size={20} /> {L("Pro wallet", "Pochi ya fundi")}</h2><Pill tone="ghost">{L("Auto-released", "Hutolewa yenyewe")}</Pill></div>
        <div className="inner"><p className="small muted">{L("Cleared available balance", "Salio lililopo")}</p><p className="big-n"><small className="mango">KES</small>{Number(q.data.wallet.balance).toLocaleString("en-KE")}</p><p className="small muted" style={{ marginTop: 6 }}>{L("0% fee to your registered Till", "Hakuna ada kwa Till yako")} {q.data.wallet.till}</p></div>
        <button type="button" className="btn btn-dark" style={{ marginTop: 14 }} onClick={() => n.show(L("Demo: your cashout request was sent to M-Pesa.", "Majaribio: ombi lako la kutoa pesa limetumwa M-Pesa."))}>{L("Instant M-Pesa cashout", "Toa pesa M-Pesa papo hapo")}</button></Hero>
      {n.node}
    </>
  );
}

export function ProHome() {
  const L = useL();
  const { user } = useAuth();
  const q = useDash();
  const [state, setState] = useState<"idle" | "accepted" | "declined">("idle");
  const d = q.data;
  return (
    <div className="wrap page app">
      <h1 className="page-title">{L("Pro workspace", "Nafasi ya fundi")}</h1>
      <div className="stack">
        {d && <>
          <p className="strip"><span className="dot-green" aria-hidden="true" /><span className="grow">{d.hub}</span><Pill tone="mango">{d.surge}</Pill></p>
          <div className="card stack"><div className="row between"><div className="row"><span className="avatar" style={{ width: 52, height: 52 }}>{(user?.full_name ?? "P")[0]}</span><div><strong>{user?.full_name}</strong><p className="muted small">{L("Status", "Hali")}: {d.status}</p></div></div><div style={{ textAlign: "right" }}><p className="muted small">{L("Today's total", "Jumla ya leo")}</p><p className="h3">{kes(d.today_total)}</p><p className="muted small">{d.trips} {L("trips", "safari")}</p></div></div></div>
          <Hero aria-label={L("New instant request", "Agizo jipya")}>
            <div className="row between"><Pill tone="mango" icon="bolt">{L("New instant request", "Agizo jipya la papo hapo")}</Pill><Pill tone="ghost" icon="clock">{d.request.seconds}s</Pill></div>
            <div className="inner"><p className="small muted">{L("Guaranteed escrow payout", "Malipo yaliyohakikishwa")}</p><p className="big-n"><small>KES</small>{d.request.payout}</p><p className="small muted">KES {d.request.base} + KES {d.request.tip} {L("tip", "bakshishi")} · M-Pesa safe</p></div>
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: "14px 0 0" }}>
              <li className="row"><Icon name="building" /><div><p className="small muted">{L("PICKUP", "KUCHUKUA")} ({d.request.pickup.km} km)</p><strong>{d.request.pickup.place}</strong><p className="small muted">{d.request.pickup.detail}</p></div></li>
              <li className="row"><Icon name="pin" /><div><p className="small muted">{L("DROP-OFF", "KUPELEKA")} ({d.request.drop.km} km)</p><strong>{d.request.drop.place}</strong><p className="small muted">{d.request.drop.detail}</p></div></li>
            </ul>
            {state === "idle" ? <><button type="button" className="btn btn-mango" style={{ marginTop: 14 }} onClick={() => setState("accepted")}><Icon name="map" />{L("Accept order and navigate", "Kubali agizo na uelekezwe")}</button>
              <button type="button" className="btn btn-dark" onClick={() => setState("declined")}>{L("Decline and pass to next rider", "Kataa na mpe mwingine")}</button></>
              : <p className="notice" role="status" style={{ marginTop: 14 }}><Icon name="check" />{state === "accepted" ? L("Order accepted. Navigation would open now.", "Agizo limekubaliwa. Ramani ingefunguka sasa.") : L("Passed to the next rider.", "Limepewa mwingine.")}</p>}
          </Hero>
          <ProWallet />
          <SectionHead title={L("Today's scheduled tasks", "Kazi za leo")} action={<span className="small muted">{d.tasks.length}</span>} />
          <ul className="stack" style={{ listStyle: "none", padding: 0 }}>{d.tasks.map((t) => <li key={t.id} className="card stack" style={{ ["--gap" as string]: "6px" }}><div className="row between"><Pill tone="purple" icon="clock">{t.time}</Pill><strong className="h4">{kes(t.amount)}</strong></div><p><strong>{t.title}</strong></p><p className="muted small">{t.place}</p></li>)}</ul>
          <SectionHead title={L("Dispatch hubs", "Vituo vya usambazaji")} />
          <div className="tiles">{d.hubs.map(([name, note, hot]) => <Tile key={name} icon="map" label={name} sub={note} tag={hot ? L("High", "Juu") : undefined} />)}</div>
        </>}
        <SectionHead title={L("Quote requests", "Maombi ya bei")} />
        <ProQuotes />
      </div>
    </div>
  );
}
