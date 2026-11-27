import { useEffect, useId, useRef, useState, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { useT, type Key } from "../lib/i18n";

/* ---------- Icons (decorative: always hidden from screen readers; the words carry the meaning) ---------- */
const PATHS: Record<string, string> = {
  check: "M5 12l5 5 9-10", clock: "M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", alert: "M12 8v5M12 17h.01M10.3 4l-8 14a2 2 0 0 0 1.7 3h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4 0z",
  info: "M12 11v6M12 7h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z", arrow: "M5 12h14M13 6l6 6-6 6", pin: "M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11zM12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  bed: "M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5", bath: "M4 12h16v3a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4zM6 12V6a2 2 0 0 1 3-1.7", moon: "M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z",
  sun: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5", x: "M6 6l12 12M18 6L6 18",
  plus: "M12 5v14M5 12h14", bell: "M6 17v-6a6 6 0 0 1 12 0v6l2 2H4zM10 21h4", compass: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z",
  briefcase: "M4 8h16v11H4zM9 8V5h6v3M4 13h16", wallet: "M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-3v3M16 14h2", user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  chat: "M4 5h16v11H9l-5 4z", send: "M4 12l16-8-6 16-3-7z", lock: "M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3", flame: "M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 2 2 2 0-3-1-5 1-8z",
  drop: "M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z", truck: "M3 6h11v10H3zM14 9h4l3 3v4h-7zM7 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM17 19a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  bike: "M6 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 18a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 15l4-7h5l3 7M10 8l2 7", wrench: "M14 6a4 4 0 0 0 5 5l-9 9-3-3 9-9a4 4 0 0 0-2-2z",
  broom: "M14 3l6 6-7 7M13 16l-6 5-3-3 5-6M9 11l4 4", shirt: "M8 4l-5 3 2 4 3-1v10h8V10l3 1 2-4-5-3a4 4 0 0 1-8 0z", bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
  file: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6", building: "M5 21V4h9v17M14 9h5v12M8 8h3M8 12h3M8 16h3", users: "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M17 11a2.5 2.5 0 1 0 0-5M18 20a5 5 0 0 0-3-4.5",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z", download: "M12 4v11M7 11l5 5 5-5M5 20h14", fingerprint: "M6 11a6 6 0 0 1 12 0v3M9 20c0-3 0-6 3-6s3 3 3 6M12 11v3M4 15c0-1 .3-2 1-3",
  map: "M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14", chev: "M9 6l6 6-6 6", logout: "M10 5H5v14h5M15 8l4 4-4 4M19 12H9", home: "M4 11l8-7 8 7v9H4zM10 20v-6h4v6",
  scale: "M12 4v16M6 8h12M6 8l-3 7a3 3 0 0 0 6 0zM18 8l-3 7a3 3 0 0 0 6 0z", search: "M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4", camera: "M4 8h4l2-3h4l2 3h4v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z", grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
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
  available: { tone: "success", icon: "check" }, occupied: { tone: "info", icon: "users" },
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
