/**
 * Motif « zellige » animé : le fond signature de NOOR (page de connexion, menu, bandeaux).
 *
 * « Noor » signifie « lumière » : un treillis d'étoiles à huit branches (khatam), très discret,
 * est éclairé par une tache de lumière.
 *  - Au chargement, la lumière « se lève » depuis un point (animation CSS `zellige-dawn`).
 *  - Sur ordinateur, la lumière suit la souris (variables CSS --lx / --ly, sans re-rendu React).
 *  - Sur téléphone / tablette, elle dérive lentement toute seule (`zellige-drift`).
 *  - Si l'utilisateur réduit les animations : motif fixe, lumière immobile.
 *
 * Tout est en SVG + CSS (aucune image à télécharger) : léger et net à toutes les tailles.
 */
import { useEffect, useId, useRef } from "react";

import { cn } from "@/lib/utils";

/** Taille d'une tuile du motif (px). */
const T = 72;
const C = T / 2;

/** Étoile à 8 branches (deux carrés superposés) centrée en (cx, cy), rayon extérieur R. */
function starPoints(cx: number, cy: number, R: number) {
  const r = (R * Math.cos(Math.PI / 4)) / Math.cos(Math.PI / 8); // creux entre deux branches
  const pts: string[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k * Math.PI) / 8;
    const rad = k % 2 === 0 ? R : r;
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

const STAR = starPoints(C, C, 26);
const INNER_STAR = starPoints(C, C, 11);

interface Props {
  className?: string;
  /** La lumière suit la souris (désactivé automatiquement sur écran tactile). */
  interactive?: boolean;
  /** Intensité du motif (0 à 1). */
  intensity?: number;
}

export function ZelligeField({ className, interactive = true, intensity = 1 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId().replace(/:/g, "");

  useEffect(() => {
    const el = ref.current;
    if (!el || !interactive) return;
    // Pas de suivi sur écran tactile ni si l'utilisateur réduit les animations
    const fine = window.matchMedia("(pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!fine || reduced) return;
    const parent = el.parentElement;
    if (!parent) return;
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = el.getBoundingClientRect();
        el.style.setProperty("--lx", `${e.clientX - box.left}px`);
        el.style.setProperty("--ly", `${e.clientY - box.top}px`);
        el.dataset.follow = "true";
      });
    };
    parent.addEventListener("pointermove", onMove);
    return () => {
      parent.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [interactive]);

  const pattern = (pid: string, opacity: number) => (
    <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
      <defs>
        <pattern id={pid} width={T} height={T} patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#9FE3D6" strokeOpacity={opacity} strokeWidth="1">
            <polygon points={STAR} />
            <polygon points={INNER_STAR} />
            {/* Liens vers les étoiles voisines (le treillis) */}
            <path d={`M${C + 26} ${C} H${T + 10} M${C - 26} ${C} H-10 M${C} ${C + 26} V${T + 10} M${C} ${C - 26} V-10`} />
            {/* Petits losanges aux coins de la tuile */}
            <path d={`M0 -7 L7 0 L0 7 L-7 0 Z M${T} -7 L${T + 7} 0 L${T} 7 L${T - 7} 0 Z M0 ${T - 7} L7 ${T} L0 ${T + 7} L-7 ${T} Z M${T} ${T - 7} L${T + 7} ${T} L${T} ${T + 7} L${T - 7} ${T} Z`} />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#${pid})`} />
    </svg>
  );

  return (
    <div ref={ref} className={cn("zellige-field pointer-events-none absolute inset-0 overflow-hidden", className)} aria-hidden="true">
      {/* Le motif « éteint », à peine visible partout */}
      <div className="absolute inset-0">{pattern(`z-base-${id}`, 0.07 * intensity)}</div>
      {/* Le même motif « allumé », visible seulement sous la lumière (masque radial) */}
      <div className="zellige-lit absolute inset-0">{pattern(`z-lit-${id}`, 0.5 * intensity)}</div>
      {/* Halo de lumière */}
      <div className="zellige-glow absolute inset-0" />
    </div>
  );
}
