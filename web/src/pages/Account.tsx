import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { Icon } from "../components/ui";
import { Avatar, Hero, LangToggle, Pill, SectionHead, Segmented, ThemeToggle, Toggle, useL } from "../components/kit";
import { homeOf } from "../components/Layout";

const isDemo = () => import.meta.env.VITE_DEMO === "1";
const ROLES = ["tenant", "landlord", "provider", "admin"] as const;

function useSwitch() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    go: async (role: string) => {
      if (!user || role === user.role) { nav(homeOf(role)); return; }
      setBusy(true);
      try { await login(`${role}@demo`, "demo"); nav(homeOf(role)); } finally { setBusy(false); }
    },
  };
}

export function Account() {
  const L = useL();
  const { user, logout } = useAuth();
  const sw = useSwitch();
  const [s, setS] = useState({ auto: true, bio: true, tfa: true, stk: true, wa: true, grid: false });
  const set = (k: keyof typeof s) => (v: boolean) => setS((x) => ({ ...x, [k]: v }));
  if (!user) return null;
  const role = user.role;
  const rows = [L("Landlord and tenant bylaws", "Sheria za mwenye nyumba na mpangaji"), L("Standard tenancy agreement", "Mkataba wa kawaida wa upangaji"), L("Contact the ombudsman", "Wasiliana na msuluhishi")];
  return (
    <div className="wrap page app">
      <h1 className="page-title">{L("Account hub", "Akaunti yangu")}</h1>
      <div className="stack">
        <Hero>
          <div className="row" style={{ gap: 14 }}><Avatar name={user.full_name} size={64} /><div className="grow"><h2 className="h3">{user.full_name}</h2><p className="muted">{user.phone || user.email}</p></div></div>
          <div className="row wrapx" style={{ marginTop: 12 }}><Pill tone="mango" icon="check">{user.is_email_verified ? L("Email verified", "Barua pepe imethibitishwa") : L("Verify your email", "Thibitisha barua pepe")}</Pill>{role === "landlord" && <Pill tone="ghost" icon="shield">{user.landlord_verified ? L("Verified landlord", "Mwenye nyumba aliyethibitishwa") : L("Verification pending", "Uthibitisho unasubiriwa")}</Pill>}</div>
        </Hero>

        <section className="card" aria-labelledby="fin"><SectionHead id="fin" title={L("Financial and M-Pesa", "Fedha na M-Pesa")} />
          <div className="setting"><span className="tile-ico sm"><Icon name="wallet" size={20} /></span><div className="grow"><p><strong>{L("Default M-Pesa number", "Namba ya M-Pesa")}</strong></p><p className="muted small">{user.phone || L("Add your phone number", "Weka namba ya simu")}</p></div></div>
          {role === "tenant" && <Toggle icon="clock" label={L("Automatic rent reminder", "Kikumbusho cha kodi")} hint={L("An M-Pesa prompt on the 5th of each month", "Ombi la M-Pesa tarehe 5 kila mwezi")} checked={s.auto} onChange={set("auto")} />}
          {role !== "tenant" && <div className="setting"><span className="tile-ico sm"><Icon name="file" size={20} /></span><div className="grow"><p><strong>{L("Payout Till or Paybill", "Till au Paybill ya malipo")}</strong></p><p className="muted small">{L("Set by your landlord or provider profile", "Huwekwa kwenye wasifu wako")}</p></div></div>}
        </section>

        <section className="card" aria-labelledby="sec"><SectionHead id="sec" title={L("Security", "Usalama")} />
          <Toggle icon="fingerprint" label={L("Fingerprint or face unlock", "Alama ya kidole au uso")} hint={L("For lease signing and approvals", "Kwa kusaini mikataba na kuidhinisha")} checked={s.bio} onChange={set("bio")} />
          <Toggle icon="lock" label={L("Two-step sign-in", "Kuingia kwa hatua mbili")} hint={L("SMS code as a fallback", "Msimbo wa SMS kama mbadala")} checked={s.tfa} onChange={set("tfa")} />
        </section>

        <section className="card stack" aria-labelledby="rol"><SectionHead id="rol" title={L("Roles and workspaces", "Majukumu na nafasi za kazi")} action={<Link to="/workspaces">{L("See all", "Zote")}</Link>} />
          {isDemo() ? <Segmented label={L("Active role", "Jukumu linalotumika")} value={(ROLES as readonly string[]).includes(role) ? (role as typeof ROLES[number]) : "tenant"} onChange={(r) => sw.go(r)} options={[{ key: "tenant", label: L("Tenant", "Mpangaji") }, { key: "landlord", label: L("Landlord", "Mwenye nyumba") }, { key: "provider", label: L("Pro", "Fundi") }, { key: "admin", label: L("Admin", "Msimamizi") }]} />
            : <p className="muted">{L("Your account has one role. Use a separate account for another role.", "Akaunti yako ina jukumu moja. Tumia akaunti nyingine kwa jukumu lingine.")}</p>}
        </section>

        <section className="card" aria-labelledby="look"><SectionHead id="look" title={L("Language and theme", "Lugha na mwonekano")} />
          <div className="row between"><LangToggle /><ThemeToggle /></div>
        </section>

        <section className="card" aria-labelledby="ntf"><SectionHead id="ntf" title={L("Notifications", "Arifa")} />
          <Toggle icon="wallet" label={L("M-Pesa payment alerts", "Arifa za malipo ya M-Pesa")} hint={L("Prompts and receipts", "Maombi na risiti")} checked={s.stk} onChange={set("stk")} />
          <Toggle icon="chat" label={L("WhatsApp reminders", "Vikumbusho vya WhatsApp")} hint={L("Rent receipts and delivery updates", "Risiti za kodi na hali ya uwasilishaji")} checked={s.wa} onChange={set("wa")} />
          <Toggle icon="alert" label={L("Water and power outage alerts", "Arifa za maji na umeme")} checked={s.grid} onChange={set("grid")} />
        </section>

        <section className="card" aria-labelledby="leg"><SectionHead id="leg" title={L("Legal and support", "Sheria na msaada")} />
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>{rows.map((r) => <li key={r} className="setting"><span className="tile-ico sm"><Icon name="file" size={20} /></span><span className="grow"><strong>{r}</strong></span><Icon name="chev" size={18} /></li>)}</ul>
        </section>
        <button type="button" className="btn btn-ghost btn-block" onClick={logout}><Icon name="logout" />{L("Sign out", "Toka")}</button>
        {isDemo() && <p className="muted small">{L("Demo: switches and settings are not saved.", "Majaribio: mipangilio haihifadhiwi.")}</p>}
      </div>
    </div>
  );
}

export function Workspaces() {
  const L = useL();
  const { user } = useAuth();
  const sw = useSwitch();
  if (!user) return null;
  const cards = [
    { key: "tenant", icon: "home", title: L("Tenant workspace", "Nafasi ya mpangaji"), lines: [L("Rent due on the 5th", "Kodi inadaiwa tarehe 5"), L("1 open repair ticket", "Tiketi 1 ya matengenezo")] },
    { key: "landlord", icon: "building", title: L("Landlord and property manager", "Mwenye nyumba na meneja wa mali"), lines: [L("2 properties, 5 units", "Mali 2, nyumba 5"), L("94% collection rate", "Ukusanyaji 94%"), L("3 viewing requests", "Maombi 3 ya ziara")] },
    { key: "provider", icon: "bike", title: L("Service pro or boda rider", "Fundi au mwendesha boda"), lines: [L("Online", "Yuko mtandaoni"), L("KES 3,450 today", "KES 3,450 leo"), "4.9 ★ (118)"] },
    { key: "admin", icon: "shield", title: L("Platform admin", "Msimamizi wa jukwaa"), lines: [L("Disputes, compliance, ledger", "Migogoro, kanuni, leja"), L("2 pending verifications", "Uthibitisho 2 unasubiri")] },
  ];
  return (
    <div className="wrap page app">
      <h1 className="page-title">{L("Switch workspace", "Badilisha nafasi ya kazi")}</h1>
      <p className="muted" style={{ margin: "8px 0 16px" }}>{L("One Makao account, several roles. Switch without signing out.", "Akaunti moja ya Makao, majukumu kadhaa. Badilisha bila kutoka.")}</p>
      <ul className="stack" style={{ listStyle: "none", padding: 0 }}>{cards.map((c) => {
        const active = (c.key === user.role) || (c.key === "landlord" && user.role === "agent");
        return (
          <li key={c.key} className="card stack" style={active ? { borderColor: "var(--purple)", borderWidth: 2 } : undefined}>
            <div className="row between"><span className="row"><span className="tile-ico"><Icon name={c.icon} size={22} /></span><strong>{c.title}</strong></span>
              {active ? <Pill tone="purple" icon="check">{L("Selected", "Imechaguliwa")}</Pill> : <button type="button" className="btn btn-sm" disabled={!isDemo() || sw.busy} onClick={() => sw.go(c.key)}>{c.key === "admin" ? L("Unlock", "Fungua") : L("Switch", "Badilisha")}</button>}</div>
            <ul className="chips-row">{c.lines.map((x) => <li key={x}><Pill tone="mint">{x}</Pill></li>)}</ul>
          </li>);
      })}</ul>
      {!isDemo() && <p className="muted small" style={{ marginTop: 12 }}>{L("Other workspaces need a separate account for now.", "Nafasi nyingine zinahitaji akaunti tofauti kwa sasa.")}</p>}
    </div>
  );
}
