import { useEffect, useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { Me } from "../lib/types";
import { useT } from "../lib/i18n";
import { FormError, Icon, Loading, SelectField, Skeleton, TextField } from "../components/ui";

export function homeFor(role: string) { return role === "landlord" || role === "agent" ? "/manage" : role === "provider" ? "/pro" : role === "admin" || role === "staff" ? "/admin" : role === "tenant" ? "/my" : "/"; }

export function Login() {
  const t = useT();
  const { login, user } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const from = (loc.state as { from?: string } | null)?.from;
  const [identifier, setId] = useState("");
  const [password, setPw] = useState("");
  const m = useMutation({ mutationFn: () => login(identifier.trim(), password), onSuccess: (u) => nav(from ?? homeFor(u.role), { replace: true }) });
  const err = m.error instanceof ApiError ? m.error : undefined;
  if (user) return <Navigate to={from ?? homeFor(user.role)} replace />;
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <div className="wrap narrow page">
      <h1 className="page-title">{t("auth.signin")}</h1>
      <form onSubmit={submit} className="stack card" noValidate style={{ marginTop: 20 }}>
        <TextField label={t("auth.identifier")} required autoComplete="username" value={identifier} onChange={(e) => setId(e.target.value)} />
        <TextField label={t("auth.password")} required type="password" autoComplete="current-password" value={password} onChange={(e) => setPw(e.target.value)} />
        <FormError message={err?.message} />
        {err?.code === "email_not_confirmed" && <ResendLink email={identifier} />}
        <button className="btn btn-block" type="submit" disabled={m.isPending || !identifier || !password}>{t("auth.signin")}</button>
        <p className="muted">{t("nav.signup")}? <Link to="/signup">{t("nav.signup")}</Link></p>
      </form>
    </div>
  );
}

function ResendLink({ email }: { email: string }) {
  const t = useT();
  const m = useMutation({ mutationFn: () => api("/auth/email/resend/", { method: "POST", body: { email } }) });
  return m.isSuccess ? <p role="status" className="notice"><Icon name="check" />{t("auth.resent")}</p> : <button type="button" className="btn btn-ghost btn-sm" onClick={() => m.mutate()} disabled={m.isPending || !email.includes("@")}>{t("auth.resend")}</button>;
}

export function Signup() {
  const t = useT();
  const { user, enter } = useAuth();
  const [f, setF] = useState({ full_name: "", email: "", phone: "", password: "", role: "tenant", contact_consent: false });
  const m = useMutation({ mutationFn: async () => { const r = await api<{ user?: Me }>("/auth/signup/", { method: "POST", body: f }); if (r.user) enter(r.user); return r; } });
  const err = m.error instanceof ApiError ? m.error : undefined;
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  if (m.isSuccess) return (
    <div className="wrap narrow page"><h1 className="page-title">{t("auth.checkEmail")}</h1>
      <div className="card stack" style={{ marginTop: 20 }}><p role="status">{t("auth.checkEmailBody", { email: f.email })}</p><ResendLink email={f.email} /></div></div>
  );
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  const on = (k: "full_name" | "email" | "phone" | "password" | "role") => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="wrap narrow page">
      <h1 className="page-title">{t("auth.signup")}</h1>
      <form onSubmit={submit} className="stack card" noValidate style={{ marginTop: 20 }}>
        <TextField label={t("auth.name")} required autoComplete="name" value={f.full_name} onChange={on("full_name")} error={err?.fields.full_name} />
        <TextField label={t("auth.email")} required type="email" autoComplete="email" value={f.email} onChange={on("email")} error={err?.fields.email} />
        <TextField label={t("auth.phone")} required type="tel" autoComplete="tel" inputMode="tel" placeholder="0712 345 678" value={f.phone} onChange={on("phone")} error={err?.fields.phone} />
        <TextField label={t("auth.password")} required type="password" autoComplete="new-password" hint={t("auth.passwordHint")} value={f.password} onChange={on("password")} error={err?.fields.password} />
        <SelectField label={t("auth.role")} value={f.role} onChange={on("role")}>
          {(["tenant", "landlord", "agent", "provider"] as const).map((r) => <option key={r} value={r}>{t(`auth.${r}`)}</option>)}
        </SelectField>
        <label className="check"><input type="checkbox" checked={f.contact_consent} onChange={(e) => setF({ ...f, contact_consent: e.target.checked })} />{t("auth.consent")}</label>
        <FormError message={err && !Object.keys(err.fields).length ? err.message : err?.fields.contact_consent} />
        <button className="btn btn-block" type="submit" disabled={m.isPending || !f.contact_consent}>{t("nav.signup")}</button>
      </form>
    </div>
  );
}

export function ConfirmEmail() {
  const t = useT();
  const [sp] = useSearchParams();
  const token = sp.get("token") ?? "";
  const m = useMutation({ mutationFn: () => api<{ detail: string }>("/auth/email/confirm/", { method: "POST", body: { token } }) });
  useEffect(() => { if (token) m.mutate(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [token]);
  const err = m.error instanceof ApiError ? m.error : undefined;
  return (
    <div className="wrap narrow page"><h1 className="page-title">{t("auth.confirming")}</h1>
      <div className="card stack" style={{ marginTop: 20 }} aria-live="polite">
        {(m.isPending || m.isIdle) && token ? <Loading><Skeleton h={20} /></Loading> : null}
        {m.isSuccess && <><p className="notice" role="status"><Icon name="check" />{t("auth.confirmed")}</p><Link className="btn" to="/login">{t("auth.signin")}</Link></>}
        {(err || !token) && <FormError message={err?.message ?? "This link is not valid."} />}
      </div></div>
  );
}
