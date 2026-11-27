import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useI18n, useL } from "../lib/i18n";
import { Icon } from "./ui";

export { useL };
export const Hero = ({ children, className = "", ...r }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) => <section className={`hero-card ${className}`} {...r}>{children}</section>;
export const Pill = ({ children, tone = "mint", icon }: { children: ReactNode; tone?: "mint" | "mango" | "purple" | "danger" | "ghost"; icon?: string }) => <span className={`pill pill-${tone}`}>{icon && <Icon name={icon} size={14} />}{children}</span>;
export const Avatar = ({ name, size = 44 }: { name: string; size?: number }) => <span className="avatar" aria-hidden="true" style={{ width: size, height: size, fontSize: size * 0.36 }}>{name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}</span>;
export const SectionHead = ({ title, action, id }: { title: string; action?: ReactNode; id?: string }) => <div className="row between sect-head"><h2 id={id} className="h3">{title}</h2>{action}</div>;
export function Progress({ value, label }: { value: number; label: string }) {
  return <div className="progress" role="progressbar" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}
export function Tile({ to, icon, label, sub, onClick, tag }: { to?: string; icon: string; label: string; sub?: string; onClick?: () => void; tag?: string }) {
  const inner = <><span className="tile-ico"><Icon name={icon} size={22} /></span>{tag && <span className="tile-tag">{tag}</span>}<strong>{label}</strong>{sub && <small>{sub}</small>}</>;
  return to ? <Link className="tile" to={to}>{inner}</Link> : <button type="button" className="tile" onClick={onClick}>{inner}</button>;
}
export function Toggle({ label, hint, icon, checked, onChange }: { label: string; hint?: string; icon?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <div className="setting">
      {icon && <span className="tile-ico sm"><Icon name={icon} size={20} /></span>}
      <div className="grow"><p><strong id={id}>{label}</strong></p>{hint && <p className="muted small">{hint}</p>}</div>
      <button type="button" role="switch" aria-checked={checked} aria-labelledby={id} className="switch" onClick={() => onChange(!checked)}><span /></button>
    </div>
  );
}
export function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { key: T; label: string }[]; onChange: (v: T) => void }) {
  return <div role="group" aria-label={label} className="segmented">{options.map((o) => <button key={o.key} type="button" aria-pressed={value === o.key} onClick={() => onChange(o.key)}>{o.label}</button>)}</div>;
}
export function Accordion({ title, icon, children }: { title: string; icon?: string; children: ReactNode }) {
  return <details className="acc"><summary>{icon && <Icon name={icon} size={20} />}<span>{title}</span><Icon name="chev" size={18} /></summary><div className="acc-body">{children}</div></details>;
}
/** A calm notice used when a demo-only action is tapped. */
export function useNotice() {
  const [msg, setMsg] = useState("");
  return { msg, show: (m: string) => setMsg(m), node: msg ? <p className="notice" role="status"><Icon name="check" />{msg}</p> : null };
}
export function ThemeToggle() {
  const { t } = useI18n();
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") ?? "light");
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" className="icon-btn" aria-label={t("common.theme")} aria-pressed={theme === "dark"} onClick={() => { document.documentElement.setAttribute("data-theme", next); try { localStorage.setItem("makao-theme", next); } catch { /* ignore */ } setTheme(next); }}>
      <Icon name={theme === "dark" ? "sun" : "moon"} size={20} />
    </button>
  );
}
export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t("common.language")} className="lang">
      {(["en", "sw"] as const).map((l) => <button key={l} type="button" lang={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
    </div>
  );
}
