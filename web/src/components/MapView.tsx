import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Unit } from "../lib/types";
import { kes } from "../lib/format";

/** Map of the same homes shown in the list. The list is always available, so the map is a bonus, not the only way in. */
export default function MapView({ units }: { units: Unit[] }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!el.current) return;
    const map = L.map(el.current, { keyboard: true }).setView([-1.286, 36.817], 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
    const pts: L.LatLngExpression[] = [];
    units.forEach((u) => {
      const ll: L.LatLngExpression = [u.latitude, u.longitude];
      pts.push(ll);
      const k = `${Math.round(Number(u.rent_amount) / 1000)}k`;
      const m = L.marker(ll, { title: `${u.property_name}, ${kes(u.rent_amount)}`, icon: L.divIcon({ className: "pin", html: `<span>${k}</span>`, iconSize: [52, 30] }), keyboard: true }).addTo(map);
      const box = document.createElement("div");
      const a = document.createElement("a");
      a.href = `/listing/${u.id}`; a.textContent = `${u.property_name}, ${kes(u.rent_amount)}`;
      box.appendChild(a); m.bindPopup(box);
    });
    if (pts.length) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
    return () => { map.remove(); };
  }, [units]);
  return <div ref={el} className="map" role="region" aria-label="Map of homes" />;
}
