import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { kes } from "../lib/format";
import { useT } from "../lib/i18n";
import type { Amenities } from "../lib/types";
import { AreaField, CheckGroup, FormError, Icon, TextField } from "../components/ui";

interface Req { id: number; status: string; fee_amount: string }
interface Pay { status: string }

export default function RequestHome() {
  const t = useT();
  const { user } = useAuth();
  const am = useQuery({ queryKey: ["amenities"], queryFn: () => api<Amenities>("/amenities/"), staleTime: 3600_000 });
  const [f, setF] = useState({ area_text: "", min_rent: "", max_rent: "", notes: "" });
  const [amen, setAmen] = useState<string[]>([]);
  const [reqId, setReqId] = useState<number | null>(null);
  const [fee, setFee] = useState("200");
  const [payState, setPayState] = useState<"idle" | "waiting" | "paid" | "failed">("idle");
  const create = useMutation({
    mutationFn: async () => {
      const r = await api<Req>("/requests/", { method: "POST", body: { goal: "rent", area_text: f.area_text, min_rent: f.min_rent || null, max_rent: f.max_rent || null, notes: f.notes, amenities: amen, alert_channels: ["sms", "email"] } });
      setReqId(r.id); setFee(r.fee_amount);
      await api(`/requests/${r.id}/pay/`, { method: "POST" });
      setPayState("waiting");
    },
  });
  // After the M-Pesa prompt goes out, poll until the payment is confirmed or fails.
  useEffect(() => {
    if (payState !== "waiting" || !reqId) return;
    const id = setInterval(async () => {
      try { const p = await api<Pay>(`/requests/${reqId}/payment/`); if (p.status === "success") setPayState("paid"); else if (p.status !== "pending") setPayState("failed"); } catch { /* keep waiting */ }
    }, 3000);
    return () => clearInterval(id);
  }, [payState, reqId]);
  const err = create.error instanceof ApiError ? create.error : undefined;
  if (!user) return <div className="wrap narrow page"><h1 className="page-title">{t("req.title")}</h1><p style={{ margin: "16px 0" }} className="muted">{t("req.sub")}</p><Link className="btn" to="/login" state={{ from: "/request" }}>{t("nav.signin")}</Link></div>;
  const submit = (e: FormEvent) => { e.preventDefault(); setPayState("idle"); create.mutate(); };
  const on = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="wrap narrow page">
      <h1 className="page-title">{t("req.title")}</h1><p className="muted" style={{ margin: "8px 0 20px" }}>{t("req.sub")}</p>
      <form onSubmit={submit} className="stack card" noValidate>
        <TextField label={t("req.area")} required value={f.area_text} onChange={on("area_text")} error={err?.fields.non_field_errors ?? err?.fields.area_text} />
        <fieldset className="field"><legend>{t("req.budget")}</legend><div className="two"><TextField label={t("req.min")} type="number" inputMode="numeric" min={0} value={f.min_rent} onChange={on("min_rent")} /><TextField label={t("req.max")} type="number" inputMode="numeric" min={0} value={f.max_rent} onChange={on("max_rent")} error={err?.fields.max_rent} /></div></fieldset>
        {am.data && <CheckGroup legend={t("req.amenities")} options={am.data.rental} value={amen} onChange={setAmen} />}
        <AreaField label={t("req.notes")} value={f.notes} onChange={on("notes")} maxLength={1000} />
        <div className="fee"><span>{t("req.fee")}</span><strong>{kes(fee)}</strong></div>
        <FormError message={err && !Object.keys(err.fields).length ? err.message : undefined} />
        <button className="btn btn-block" type="submit" disabled={create.isPending || payState === "waiting" || payState === "paid" || !f.area_text}>{t("req.pay", { fee: kes(fee) })}</button>
        <div aria-live="polite" role="status">
          {payState === "waiting" && <p className="notice"><Icon name="clock" />{t("req.waiting")}</p>}
          {payState === "paid" && <p className="notice success"><Icon name="check" />{t("req.paid")}</p>}
          {payState === "failed" && <p className="form-error"><Icon name="alert" />{t("req.failed")}</p>}
        </div>
      </form>
    </div>
  );
}
