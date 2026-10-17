/**
 * Emblème NOOR : étoile à huit branches (khatam), motif marocain traditionnel.
 * « Noor » signifie « lumière » en arabe : l'étoile en est le symbole.
 * Deux carrés superposés, l'un tourné de 45°, et un petit losange central.
 */
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** Couleur de l'étoile (par défaut : couleur du texte courant) */
  color?: string;
  /** Couleur du losange central */
  core?: string;
}

export function NoorMark({ className, color = "currentColor", core }: Props) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <rect x="6.5" y="6.5" width="19" height="19" rx="0.8" fill={color} />
      <rect x="6.5" y="6.5" width="19" height="19" rx="0.8" fill={color} transform="rotate(45 16 16)" />
      {/* Petit losange central : la « lumière » au cœur de l'étoile */}
      <rect x="13.6" y="13.6" width="4.8" height="4.8" fill={core ?? "white"} transform="rotate(45 16 16)" />
    </svg>
  );
}
