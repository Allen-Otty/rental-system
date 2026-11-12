import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { useI18n, type Key } from "../lib/i18n";
import { Icon } from "./ui";

function navFor(role?: string): { to: string; key: Key }[] {
  const base = [{ to: "/explore", key: "nav.explore" as Key }, { to: "/land", key: "nav.land" as Key }, { to: "/services", key: "nav.services" as Key }];
  if (role === "landlord" || role === "agent") return [{ to: "/manage", key: "nav.overview" }, { to: "/manage/tenants", key: "nav.tenants" }, { to: "/manage/rent", key: "nav.money" }, { to: "/manage/repairs", key: "nav.repairs" }, ...base.slice(0, 1)];
  if (role === "provider") return [{ to: "/pro", key: "nav.inbox" }, ...base.slice(2)];
  if (role === "tenant") return [{ to: "/my", key: "nav.home" }, ...base, { to: "/request", key: "nav.request" }];
  return [...base, { to: "/request", key: "nav.request" }];
}

function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") ?? "light");
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="icon-btn" aria-label={t("common.theme")} aria-pressed={theme === "dark"} onClick={() => { document.documentElement.setAttribute("data-theme", next); try { localStorage.setItem("makao-theme", next); } catch { /* ignore */ } setTheme(next); }}>
      <Icon name={theme === "dark" ? "sun" : "moon"} size={20} />
    </button>
  );
}
function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t("common.language")} className="lang">
      {(["en", "sw"] as const).map((l) => <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
    </div>
  );
}

export default function Layout() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
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
  const links = navFor(user?.role);
  return (
    <>
      <a href="#main" className="skip-link">{t("skip")}</a>
      {import.meta.env.VITE_DEMO === "1" && <p className="demo-banner" role="note">Demo mode: sample data, nothing is saved. Sign in as tenant@demo, landlord@demo or provider@demo with any password.</p>}
      <header className="site-header">
        <div className="wrap bar">
          <Link to="/" className="logo" aria-label="Makao, home">makao<span aria-hidden="true">.</span></Link>
          <nav aria-label={t("nav.main")} className="nav">
            <ul>{links.map((l) => <li key={l.to}><NavLink to={l.to} end={l.to === "/manage"}>{t(l.key)}</NavLink></li>)}</ul>
          </nav>
          <div className="tools">
            <LangToggle /><ThemeToggle />
            {user ? <button type="button" className="btn btn-ghost btn-sm" onClick={logout}>{t("nav.signout")}</button>
              : <><Link className="btn btn-ghost btn-sm hide-sm" to="/login">{t("nav.signin")}</Link><Link className="btn btn-sm" to="/signup">{t("nav.signup")}</Link></>}
          </div>
        </div>
      </header>
      <main id="main" ref={main} tabIndex={-1}><Outlet /></main>
      <footer className="site-footer band-dark"><div className="wrap"><p className="logo">makao<span aria-hidden="true">.</span></p><p className="muted">Kenya</p></div></footer>
      <div className="sr-only" aria-live="polite" role="status">{announce}</div>
    </>
  );
}
