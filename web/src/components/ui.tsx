import { useEffect, useId, useRef, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useT, type Key } from "../lib/i18n";

/* ---------- Icons (decorative: always hidden from screen readers; the words carry the meaning) ---------- */
const PATHS: Record<string, string> = {
  check: "M5 12l5 5 9-10", clock: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", alert: "M12 8v5M12 17h.01M10.3 4l-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z",
  info: "M12 11v6M12 7h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", arrow: "M5 12h14M13 6l6 6-6 6", pin: "M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  bed: "M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5", bath: "M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 12V6a2 2 0 0 1 3-1.7", moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5", x: "M6 6l12 12M18 6L6 18",
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z", shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
};
export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={PATHS[name] ?? ""} /></svg>;
}

/* ---------- Skeleton loaders ---------- */
export function Skeleton({ w = "100%", h = 16, r }: { w?: string | number; h?: number | string; r?: number }) {
  return <span className="skeleton" aria-hidden="true" style={{ width: w, height: h, borderRadius: r }} />;
}
/** Wrap skeletons so assistive tech hears one calm "Loading" instead of dozens of empty boxes. */
export function Loading({ children, label }: { children: ReactNode; label?: string }) {
  const t = useT();
  return <div role="status" aria-busy="true" aria-live="polite"><span className="sr-only">{label ?? t("common.loading")}</span>{children}</div>;
}
export function CardSkeleton() {
  return (
    <div className="card listing" style={{ padding: 10 }}>
      <Skeleton h={190} r={12} />
      <div className="stack" style={{ padding: "14px 6px 6px", ["--gap" as string]: "10px" }}><Skeleton w="70%" h={22} /><Skeleton w="45%" h={16} /><Skeleton w="35%" h={16} /></div>
    </div>
  );
}
export function ListSkeleton({ n = 6, card = true }: { n?: number; card?: boolean }) {
  return <Loading><div className="grid grid-auto">{Array.from({ length: n }, (_, i) => card ? <CardSkeleton key={i} /> : <div key={i} className="card"><Skeleton h={20} w="60%" /><div style={{ height: 10 }} /><Skeleton h={14} w="40%" /></div>)}</div></Loading>;
}
export function StatSkeleton() {
  return <Loading><div className="grid stats">{[0, 1, 2, 3].map((i) => <div key={i} className="card"><Skeleton w="50%" h={14} /><div style={{ height: 14 }} /><Skeleton w="70%" h={34} /></div>)}</div></Loading>;
}

/* ---------- Status tag: colour + icon + words ---------- */
const TONE: Record<string, { tone: "success" | "warning" | "danger" | "info"; icon: string }> = {
  paid: { tone: "success", icon: "check" }, done: { tone: "success", icon: "check" }, active: { tone: "success", icon: "check" },
  partial: { tone: "warning", icon: "clock" }, unpaid: { tone: "info", icon: "clock" }, scheduled: { tone: "info", icon: "clock" }, in_progress: { tone: "warning", icon: "clock" },
  overdue: { tone: "danger", icon: "alert" }, open: { tone: "danger", icon: "alert" }, closed: { tone: "info", icon: "check" }, ended: { tone: "info", icon: "info" },
};
export function StatusTag({ status }: { status: string }) {
  const t = useT();
  const m = TONE[status] ?? { tone: "info", icon: "info" };
  return <span className={`tag tag-${m.tone}`}><Icon name={m.icon} size={14} />{t(`status.${status}` as Key)}</span>;
}
export function VerifiedTag({ verified }: { verified: boolean }) {
  const t = useT();
  return verified ? <span className="tag tag-info"><Icon name="shield" size={14} />{t("common.verified")}</span> : <span className="tag tag-warning"><Icon name="alert" size={14} />{t("common.unverified")}</span>;
}

/* ---------- Form fields: label, hint and error are always wired to the control ---------- */
interface FieldProps { label: string; hint?: string; error?: string; required?: boolean }
export function TextField({ label, hint, error, required, ...rest }: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  const id = useId(), hid = `${id}-h`, eid = `${id}-e`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <input id={id} className="input" required={required} aria-invalid={error ? true : undefined} aria-describedby={[hint ? hid : "", error ? eid : ""].filter(Boolean).join(" ") || undefined} {...rest} />
      {hint && <p id={hid} className="hint">{hint}</p>}
      {error && <p id={eid} className="error" role="alert"><Icon name="alert" size={16} />{error}</p>}
    </div>
  );
}
export function SelectField({ label, hint, error, required, children, ...rest }: FieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  const id = useId(), eid = `${id}-e`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}{required && <span aria-hidden="true"> *</span>}</label>
      <select id={id} className="input" required={required} aria-invalid={error ? true : undefined} aria-describedby={error ? eid : undefined} {...rest}>{children}</select>
      {hint && <p className="hint">{hint}</p>}
      {error && <p id={eid} className="error" role="alert"><Icon name="alert" size={16} />{error}</p>}
    </div>
  );
}
export function AreaField({ label, hint, error, ...rest }: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const id = useId(), eid = `${id}-e`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} className="input" aria-invalid={error ? true : undefined} aria-describedby={error ? eid : undefined} {...rest} />
      {hint && <p className="hint">{hint}</p>}
      {error && <p id={eid} className="error" role="alert"><Icon name="alert" size={16} />{error}</p>}
    </div>
  );
}
export function CheckGroup({ legend, options, value, onChange }: { legend: string; options: { key: string; label: string }[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <fieldset className="field"><legend>{legend}</legend>
      <div className="check-grid">{options.map((o) => (
        <label key={o.key} className="check"><input type="checkbox" checked={value.includes(o.key)} onChange={(e) => onChange(e.target.checked ? [...value, o.key] : value.filter((k) => k !== o.key))} />{o.label}</label>
      ))}</div>
    </fieldset>
  );
}
export function FormError({ message }: { message?: string }) {
  return message ? <p className="form-error" role="alert"><Icon name="alert" size={18} />{message}</p> : null;
}

/* ---------- Photos: real photo when it loads, calm placeholder when not (never a broken-image icon) ---------- */
export function PhotoSlot({ src, alt, className = "", ratio = "4 / 3" }: { src?: string; alt: string; className?: string; ratio?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`photo ${className}`} style={{ aspectRatio: ratio }}>
      {src && !failed ? <img src={src} alt={alt} loading="lazy" decoding="async" onError={() => setFailed(true)} /> : <div className="photo-fallback" {...(alt ? { role: "img", "aria-label": alt } : { "aria-hidden": true })}><svg viewBox="0 0 200 120" aria-hidden="true" preserveAspectRatio="xMidYMax slice"><path d="M30 120V62l40-28 40 28v58zM110 120V76l30-22 30 22v44z" /></svg></div>}
    </div>
  );
}

/* ---------- Scroll reveal (instant when the person prefers reduced motion) ---------- */
export function Reveal({ children, as: Tag = "div", className = "", delay = 0 }: { children: ReactNode; as?: "div" | "section" | "li"; className?: string; delay?: number }) {
  const ref = useRef<HTMLElement | null>(null);
  const [shown, setShown] = useState(typeof IntersectionObserver === "undefined");
  useEffect(() => {
    if (shown || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, [shown]);
  const T = Tag as "div";
  return <T ref={ref as React.RefObject<HTMLDivElement>} className={`reveal ${shown ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>{children}</T>;
}
