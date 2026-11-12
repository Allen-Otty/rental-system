import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useT } from "../lib/i18n";
import { Icon, PhotoSlot, Reveal } from "../components/ui";

export default function Landing() {
  const t = useT();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const go = (e: FormEvent) => { e.preventDefault(); nav(`/explore${q ? `?q=${encodeURIComponent(q)}` : ""}`); };
  const rows = [
    { n: "01", title: t("landing.rent"), body: t("landing.rentDesc"), to: "/explore" },
    { n: "02", title: t("landing.land"), body: t("landing.landDesc"), to: "/land" },
    { n: "03", title: t("landing.move"), body: t("landing.moveDesc"), to: "/services" },
    { n: "04", title: t("landing.manage"), body: t("landing.manageDesc"), to: "/signup" },
  ];
  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="wrap">
          <h1 id="hero-title" className="hero-title"><span>{t("landing.title1")}</span> <span className="hero-accent">{t("landing.title2")}</span></h1>
          <p className="hero-sub">{t("landing.sub")}</p>
          <form className="hero-search" role="search" onSubmit={go}>
            <label htmlFor="hero-q" className="sr-only">{t("landing.search")}</label>
            <Icon name="pin" size={22} />
            <input id="hero-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("landing.search")} autoComplete="off" />
            <button className="btn" type="submit">{t("common.search")}</button>
          </form>
          <PhotoSlot src="/photos/hero.jpg" alt="A modern apartment building in Nairobi" className="hero-photo" ratio="21 / 9" />
        </div>
      </section>

      <section className="band-dark section" aria-labelledby="how-title">
        <div className="wrap">
          <h2 id="how-title" className="eyebrow">{t("landing.how")}</h2>
          <ul className="big-list">
            {rows.map((r, i) => (
              <Reveal as="li" key={r.n} delay={i * 80}>
                <Link to={r.to} className="big-row">
                  <span className="big-n" aria-hidden="true">{r.n}</span>
                  <span className="big-title">{r.title}</span>
                  <span className="big-body">{r.body}</span>
                  <span className="big-go" aria-hidden="true"><Icon name="arrow" size={32} /></span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      <section className="section closing" aria-labelledby="close-title">
        <Reveal className="wrap center">
          <h2 id="close-title" className="closing-title">{t("landing.closing")}</h2>
          <Link className="btn" to="/explore">{t("landing.closingCta")}</Link>
        </Reveal>
      </section>
    </>
  );
}
