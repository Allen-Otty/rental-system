import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type Page } from "../lib/api";
import { kes } from "../lib/format";
import { useT } from "../lib/i18n";
import type { Land } from "../lib/types";
import { Async } from "../components/data";
import { Icon, ListSkeleton, PhotoSlot, VerifiedTag } from "../components/ui";

export default function LandPage() {
  const t = useT();
  const [verified, setVerified] = useState(false);
  const q = useQuery({ queryKey: ["land", verified], queryFn: () => api<Page<Land>>("/land/", { query: { verified: verified ? 1 : undefined } }) });
  return (
    <div className="wrap page">
      <h1 className="page-title">{t("land.title")}</h1>
      <div className="row" style={{ margin: "16px 0 20px" }}><label className="check"><input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />{t("land.verifiedOnly")}</label></div>
      <Async q={q} skeleton={<ListSkeleton />} isEmpty={(d) => d.results.length === 0}>
        {(d) => (
          <div className="grid grid-auto">{d.results.map((l) => (
            <article key={l.id} className="card listing"><PhotoSlot alt="" ratio="4 / 3" />
              <div className="listing-body">
                <div className="row between"><h2 className="h3">{l.title}</h2><VerifiedTag verified={l.is_verified} /></div>
                <p className="price">{kes(l.price)}{l.price_negotiable && <span className="muted"> · {t("land.negotiable")}</span>}</p>
                <p className="muted row" style={{ gap: 6 }}><Icon name="pin" size={16} />{[l.ward_name, l.county_name].filter(Boolean).join(", ")}</p>
                <p className="muted">{t("land.acres", { n: Number(l.size_acres).toFixed(2) })}</p>
              </div>
            </article>
          ))}</div>
        )}
      </Async>
    </div>
  );
}
