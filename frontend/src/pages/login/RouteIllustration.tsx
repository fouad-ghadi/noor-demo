/**
 * Illustration de la page de connexion : la tournée d'un délégué à travers Casablanca.
 *
 * - Un plan de rues très discret (lignes fines), la côte en haut à gauche.
 * - Le trajet du jour relie 5 cabinets. La partie déjà parcourue est pleine,
 *   la suite est en pointillés. L'arrêt en cours est la seule touche safran.
 * - Au chargement, le trajet se dessine et les arrêts apparaissent dans l'ordre
 *   (animation CSS « route-draw », désactivée si l'utilisateur réduit les animations).
 *
 * Le SVG utilise un repère de 600 × 440 ; les étiquettes HTML sont placées en %
 * de ce repère pour rester nettes à toutes les tailles.
 */
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

const W = 600;
const H = 440;

type StopState = "done" | "current" | "next";

const STOPS: {
  x: number;
  y: number;
  time: string;
  name: string;
  detail: string;
  state: StopState;
  label: "left" | "right" | "above";
}[] = [
  { x: 70, y: 372, time: "09:00", name: "Dr Bennani", detail: "Cardiologue, Maârif", state: "done", label: "right" },
  { x: 190, y: 258, time: "10:15", name: "Dr El Amrani", detail: "Généraliste, Gauthier", state: "done", label: "left" },
  { x: 330, y: 306, time: "11:30", name: "Dr Tazi", detail: "Pédiatre, Racine", state: "current", label: "right" },
  { x: 430, y: 170, time: "15:00", name: "Dr Alaoui", detail: "Gynécologue, Anfa", state: "next", label: "left" },
  { x: 540, y: 78, time: "16:30", name: "Clinique Les Palmiers", detail: "Bourgogne", state: "next", label: "left" },
];

// Le trajet suit les rues (segments droits, angles arrondis par stroke-linejoin)
const ROUTE_DONE = "M70 372 V318 H190 V258 H262 V306 H330";
const ROUTE_NEXT = "M330 306 H384 V170 H430 H470 V78 H540";

/** Délai d'apparition de chaque arrêt, calé sur le dessin du trajet. */
const DELAYS = ["0.15s", "0.8s", "1.6s", "2.0s", "2.25s"];

const SAFFRON = "#E8A33D";
const MINT = "#9FE3D6";

export function RouteIllustration({ className }: { className?: string }) {
  return (
    <div className={cn("relative w-full", className)} style={{ aspectRatio: `${W} / ${H}` }}>
      {/* Le plan s'estompe vers les bords (masque radial) pour se fondre dans le panneau */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="absolute inset-0 h-full w-full"
        aria-hidden="true"
        style={{
          maskImage: "radial-gradient(ellipse 75% 72% at 50% 52%, black 55%, transparent 100%)",
          WebkitMaskImage: "radial-gradient(ellipse 75% 72% at 50% 52%, black 55%, transparent 100%)",
        }}
      >
        {/* Plan des rues : grille irrégulière, très discrète */}
        <g stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1">
          {[40, 118, 170, 258, 318, 372, 412].map((y) => (
            <line key={`h${y}`} x1="0" y1={y} x2={W} y2={y} />
          ))}
          {[30, 70, 130, 190, 262, 330, 384, 470, 540, 584].map((x) => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2={H} />
          ))}
        </g>
        {/* Boulevard en diagonale */}
        <line x1="0" y1="430" x2="600" y2="20" stroke="#ffffff" strokeOpacity="0.09" strokeWidth="6" strokeLinecap="round" />
        {/* Côte atlantique */}
        <path d="M0 96 C 60 86, 110 60, 150 28 S 210 0, 230 0 L 0 0 Z" fill="#ffffff" fillOpacity="0.04" />
        <text x="18" y="30" fill="#ffffff" fillOpacity="0.28" fontSize="11" fontStyle="italic">
          Océan Atlantique
        </text>

        {/* Suite du trajet (pointillés), visible après le tracé principal */}
        <path
          d={ROUTE_NEXT}
          fill="none"
          stroke={MINT}
          strokeOpacity="0.45"
          strokeWidth="2.5"
          strokeDasharray="2 8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stop-appear"
          style={{ animationDelay: "1.9s" }}
        />
        {/* Trajet déjà parcouru : se dessine au chargement */}
        <path
          d={ROUTE_DONE}
          pathLength={1}
          fill="none"
          stroke={MINT}
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="route-draw"
        />

        {/* Arrêts */}
        {STOPS.map((s, i) => (
          <g key={s.time} className="stop-appear" style={{ animationDelay: DELAYS[i] }}>
            {s.state === "current" && <circle cx={s.x} cy={s.y} r="15" fill={SAFFRON} fillOpacity="0.22" />}
            <circle
              cx={s.x}
              cy={s.y}
              r={s.state === "current" ? 8 : 6.5}
              fill={s.state === "next" ? "#0F3D3E" : s.state === "current" ? SAFFRON : MINT}
              stroke={s.state === "next" ? MINT : "#0F3D3E"}
              strokeWidth={s.state === "next" ? 2 : 2.5}
            />
          </g>
        ))}
      </svg>

      {/* Étiquettes des arrêts (HTML, positionnées en % du repère) */}
      {STOPS.map((s, i) => (
        <div
          key={s.time}
          className={cn(
            "stop-appear absolute w-max max-w-[44%] rounded-md px-2.5 py-1.5 text-[12px] leading-tight shadow-sm",
            s.state === "current" ? "bg-white text-[#0E2A2B]" : "bg-[#0B3132]/90 text-white ring-1 ring-white/10",
            s.label === "right" && "translate-x-4 -translate-y-1/2",
            s.label === "left" && "-translate-x-[calc(100%+16px)] -translate-y-1/2",
          )}
          style={{ left: `${(s.x / W) * 100}%`, top: `${(s.y / H) * 100}%`, animationDelay: DELAYS[i] }}
        >
          <p className="flex items-center gap-1.5 font-semibold">
            <span className="tabular">{s.time}</span>
            <span className={s.state === "current" ? "" : "font-medium opacity-90"}>{s.name}</span>
            {s.state === "done" && <Check className="size-3.5 text-[#9FE3D6]" aria-label="visite réalisée" />}
            {s.state === "current" && (
              <span className="rounded-full bg-[#FBEBD0] px-1.5 py-px text-[10px] font-semibold text-[#8A5A12]">En cours</span>
            )}
          </p>
          <p className={cn("mt-0.5", s.state === "current" ? "text-[#0E2A2B]/70" : "text-white/60")}>{s.detail}</p>
        </div>
      ))}
    </div>
  );
}
