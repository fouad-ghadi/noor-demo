/**
 * Carte des visites de la journée (Leaflet + OpenStreetMap).
 * Les marqueurs sont numérotés dans l'ordre de la tournée, reliés par un trait.
 * ⚠️ Nécessite une connexion internet (fonds de carte OpenStreetMap).
 */
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

import type { Visit } from "@/api/types";
import { formatTime } from "@/lib/format";

/** Marqueur rond numéroté (HTML), couleur selon le statut. */
function numberedIcon(n: number, v: Visit) {
  const color = v.report_pending ? "#f97316" : v.status === "realisee" ? "#10b981" : "#0f766e";
  return L.divIcon({
    className: "",
    html: `<div style="background:${color};color:white;width:28px;height:28px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)">${n}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

/** Ajuste le zoom pour voir tous les marqueurs. */
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  // On ne recadre que si la liste des points change vraiment (pas à chaque rendu)
  const key = JSON.stringify(points);
  useEffect(() => {
    const pts = JSON.parse(key) as [number, number][];
    if (pts.length === 1) map.setView(pts[0], 14);
    else if (pts.length > 1) map.fitBounds(pts, { padding: [40, 40] });
  }, [map, key]);
  return null;
}

export function VisitsMap({ visits, onVisitClick }: { visits: Visit[]; onVisitClick: (v: Visit) => void }) {
  const located = visits.filter(
    (v) => v.doctor_latitude && v.doctor_longitude && v.status !== "annulee" && v.status !== "reportee",
  );
  const points = located.map((v) => [v.doctor_latitude!, v.doctor_longitude!] as [number, number]);

  if (located.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full min-h-72 items-center justify-center rounded-xl border border-dashed bg-white text-sm">
        Aucune visite à afficher sur la carte.
      </div>
    );
  }

  return (
    <MapContainer
      center={points[0]}
      zoom={13}
      scrollWheelZoom={false}
      className="z-0 h-full min-h-72 w-full rounded-xl border"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <FitBounds points={points} />
      <Polyline positions={points} pathOptions={{ color: "#0f766e", weight: 3, opacity: 0.5, dashArray: "6 8" }} />
      {located.map((v, i) => (
        <Marker
          key={v.id}
          position={[v.doctor_latitude!, v.doctor_longitude!]}
          icon={numberedIcon(i + 1, v)}
          eventHandlers={{ click: () => onVisitClick(v) }}
        >
          <Tooltip direction="top" offset={[0, -12]}>
            <strong>
              {formatTime(v.planned_at)} — {v.doctor_name}
            </strong>
            <br />
            {v.doctor_specialty} · {v.doctor_district}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}
