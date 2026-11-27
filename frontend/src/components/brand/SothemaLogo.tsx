/**
 * Logo du laboratoire Sothema (demande de Fouad, 27 nov. 2026 : il remplace l'étoile NOOR partout).
 * Fichiers : public/brand/sothema-mark.png (le « S » et son étoile) et public/brand/sothema-logo.png (logo complet).
 * Sur le vert pin, le logo est posé sur une pastille blanche arrondie pour garder ses vraies couleurs.
 */
import { cn } from "@/lib/utils";

/** Le « S » Sothema seul, sans fond (pour les fonds clairs). */
export function SothemaMark({ className }: { className?: string }) {
  return <img src="/brand/sothema-mark.png" alt="" aria-hidden="true" className={cn("h-8 w-auto object-contain", className)} />;
}

/** Le « S » Sothema sur une pastille blanche carrée (pour les fonds sombres). */
export function SothemaBadge({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-sm", className)}>
      <SothemaMark className={cn("h-[78%]", markClassName)} />
    </span>
  );
}

/** Le logo complet (« Sothema, Prendre soin de l'avenir ») sur une pastille blanche. */
export function SothemaLogo({ className, imgClassName }: { className?: string; imgClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-xl bg-white px-3 py-2 shadow-sm", className)}>
      <img src="/brand/sothema-logo.png" alt="Sothema" className={cn("h-9 w-auto", imgClassName)} />
    </span>
  );
}
