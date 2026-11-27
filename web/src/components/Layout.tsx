import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { Icon } from "./ui";
import { Avatar, LangToggle, ThemeToggle, useL } from "./kit";

export const homeOf = (role?: string) => (role === "landlord" || role === "agent" ? "/manage" : role === "provider" ? "/pro" : role === "admin" || role === "staff" ? "/admin" : role === "tenant" ? "/my" : "/");

export default function Layout() {
  const { t, lang } = useI18n();
  const L = useL();
  const { user } = useAuth();
  const loc = useLocation();
  const main = useRef<HTMLElement>(null);
  const [announce, setAnnounce] = useState("");
  // On every page change: move focus to the page and tell screen readers where they are.
  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
    const h1 = document.querySelector("main h1")?.textContent;
    document.title = h1 ? `${h1} | Makao` : "Makao";
    setAnnounce(h1 ?? "");
  }, [loc.pathname]);
  const roleName: Record<string, [string, string]> = { tenant: ["Tenant", "Mpangaji"], landlord: ["Landlord", "Mwenye nyumba"], agent: ["Agent", "Wakala"], provider: ["Pro", "Fundi"], admin: ["Admin", "Msimamizi"], staff: ["Staff", "Wafanyakazi"] };
  const tabs = user
    ? [{ to: homeOf(user.role), icon: "compass", label: L("Discover", "Gundua"), end: true }, { to: "/services", icon: "briefcase", label: L("Services", "Huduma") }, { to: "/mpesa", icon: "wallet", label: "M-Pesa" }, { to: "/account", icon: "user", label: L("Account", "Akaunti") }]
    : [{ to: "/", icon: "compass", label: L("Discover", "Gundua"), end: true }, { to: "/services", icon: "briefcase", label: L("Services", "Huduma") }, { to: "/land", icon: "map", label: L("Land", "Ardhi") }, { to: "/login", icon: "user", label: L("Sign in", "Ingia") }];
  return (
    <>
      <a href="#main" className="skip-link">{t("skip")}</a>
      {import.meta.env.VITE_DEMO === "1" && <p className="demo-banner" role="note">{L("Demo mode: sample data, nothing is saved. Sign in as tenant@demo, landlord@demo, provider@demo or admin@demo with any password.", "Hali ya majaribio: data ya mfano, hakuna kinachohifadhiwa. Ingia kama tenant@demo, landlord@demo, provider@demo au admin@demo na nenosiri lolote.")}</p>}
      <header className="site-header">
        <div className="wrap bar">
          <Link to={homeOf(user?.role)} className="logo" aria-label="Makao, home">makao<span aria-hidden="true">.</span></Link>
          {user && <Link to="/workspaces" className="role-pill"><Icon name="users" size={14} />{roleName[user.role]?.[lang === "sw" ? 1 : 0] ?? user.role}</Link>}
          <div className="tools">
            {user ? <>
              <Link to="/chat" className="icon-btn bar-btn" aria-label={L("Messages", "Ujumbe")}><Icon name="bell" size={20} /><i className="dot" aria-hidden="true" /></Link>
              <Link to="/account" className="avatar-link" aria-label={L("Account", "Akaunti")}><Avatar name={user.full_name} size={40} /></Link>
            </> : <>
              <LangToggle /><ThemeToggle />
              <Link className="btn btn-ghost btn-sm hide-sm" to="/login">{t("nav.signin")}</Link><Link className="btn btn-sm btn-mango" to="/signup">{t("nav.signup")}</Link>
            </>}
          </div>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1}><Outlet /></main>
      {!user && <footer className="site-footer band-dark"><div className="wrap"><p className="logo">makao<span aria-hidden="true">.</span></p><p className="muted">Kenya</p></div></footer>}
      <nav aria-label={t("nav.main")} className="tabbar">
        <ul>{tabs.map((x) => <li key={x.to}><NavLink to={x.to} end={x.end ?? false}><Icon name={x.icon} size={22} /><span>{x.label}</span></NavLink></li>)}</ul>
      </nav>
      <div className="sr-only" aria-live="polite" role="status">{announce}</div>
    </>
  );
}
