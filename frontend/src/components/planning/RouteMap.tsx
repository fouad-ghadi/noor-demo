/**
 * Petite carte d'itinéraire (Leaflet + OpenStreetMap) : arrêts numérotés dans l'ordre, reliés par un trait.
 * Sert à « Remplir ma semaine » (tournée proposée d'un jour). ⚠️ Fonds de carte : connexion internet nécessaire.
 */
import { useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from "react-leaflet";

export interface RouteStop {
  id: string;
  lat: number;
  lng: number;
  label: string; // « 09:00 Dr Nadia Tazi »
  sub?: string; // « Cardiologue, Maârif »
}

function stopIcon(n: number) {
  return L.divIcon({
    className: "",
    html: `<div style="background:#0F3D3E;color:white;width:26px;height:26px;border-radius:9999px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.35)">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

/** Recadre la carte sur les arrêts, sans animation (voir VisitsMap.tsx). */
function Fit({ points }: { points: [number, number][] }) {
  const map = useMap();
  const key = JSON.stringify(points);
  useEffect(() => {
    const pts = JSON.parse(key) as [number, number][];
    if (pts.length === 1) map.setView(pts[0], 14, { animate: false });
    else if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], animate: false });
  }, [map, key]);
  return null;
}

export function RouteMap({ stops, className }: { stops: RouteStop[]; className?: string }) {
  if (stops.length === 0) return null;
  const points = stops.map((s) => [s.lat, s.lng] as [number, number]);
  return (
    <MapContainer center={points[0]} zoom={13} scrollWheelZoom={false} className={className ?? "border-line z-0 h-60 w-full rounded-lg border"}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Fit points={points} />
      <Polyline positions={points} pathOptions={{ color: "#0F3D3E", weight: 3, opacity: 0.6, dashArray: "6 8" }} />
      {stops.map((s, i) => (
        <Marker key={s.id} position={[s.lat, s.lng]} icon={stopIcon(i + 1)}>
          <Tooltip direction="top" offset={[0, -12]}>
            <strong>{s.label}</strong>
            {s.sub && (
              <>
                <br />
                {s.sub}
              </>
            )}
          </Tooltip>
        </Marker>
      ))}
    </MapContainer>
  );
}

/** Distance par la route, estimée (même règle que le serveur : vol d'oiseau × 1,3). */
export function roadKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dx = (a.lng - b.lng) * 111 * Math.cos((a.lat * Math.PI) / 180);
  const dy = (a.lat - b.lat) * 111;
  return Math.hypot(dx, dy) * 1.3;
}

/** Longueur d'une tournée (km) et temps de route estimé (25 km/h en ville). */
export function routeStats(stops: { lat: number; lng: number }[]): { km: number; minutes: number } {
  let km = 0;
  for (let i = 1; i < stops.length; i++) km += roadKm(stops[i - 1], stops[i]);
  return { km: Math.round(km * 10) / 10, minutes: Math.round((km / 25) * 60) };
}
