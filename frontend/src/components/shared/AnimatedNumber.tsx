/**
 * Chiffre qui « compte » jusqu'à sa valeur à l'arrivée sur la page (ex. 0 → 152).
 *
 * - Format français (virgule décimale) ; le nombre de décimales est gardé.
 * - Animation courte (0,9 s), freinée à la fin ; coupée si l'utilisateur réduit les animations.
 * - Le lecteur d'écran lit directement la valeur finale (aria-label), pas le défilement.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";

interface Props {
  value: number;
  decimals?: number;
  suffix?: string;
  duration?: number; // ms
  delay?: number; // ms
}

const ease = (t: number) => 1 - Math.pow(1 - t, 3);

export function AnimatedNumber({ value, decimals = 0, suffix = "", duration = 900, delay = 150 }: Props) {
  const fmt = (n: number) => n.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const start = from.current;
    let frame = 0;
    let t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now + delay;
      const t = Math.min(1, Math.max(0, (now - t0) / duration));
      const v = start + (value - start) * ease(t);
      setShown(v);
      from.current = v;
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, decimals, duration, delay, reduced]);

  return (
    <span aria-label={`${fmt(value)}${suffix}`}>
      <span aria-hidden="true">
        {fmt(shown)}
        {suffix}
      </span>
    </span>
  );
}

/**
 * Anime une valeur d'indicateur si c'est un nombre ou un texte du type « 64 % » / « 11,7 ».
 * Tout autre contenu est rendu tel quel.
 */
export function animateValue(value: ReactNode): ReactNode {
  if (typeof value === "number") return <AnimatedNumber value={value} />;
  if (typeof value === "string") {
    const m = value.match(/^(\d+)(?:,(\d+))?(\s?%)?$/);
    if (m) {
      const decimals = m[2]?.length ?? 0;
      const n = Number(`${m[1]}.${m[2] ?? 0}`);
      return <AnimatedNumber value={n} decimals={decimals} suffix={m[3] ? " %" : ""} />;
    }
  }
  return value;
}
