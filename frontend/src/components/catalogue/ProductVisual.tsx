/**
 * Visuel d'un produit du catalogue.
 *  - Si une image générée existe (Higgsfield, frontend/public/products/), on l'affiche ;
 *  - sinon (ou si l'image ne charge pas), on dessine une boîte en CSS aux couleurs de la gamme.
 * Animation « 3D » en CSS : légère rotation au survol de la carte parente (classe `group`)
 * et flottement lent en mode présentation. Tout est coupé si l'utilisateur a demandé
 * moins d'animations (prefers-reduced-motion, variante Tailwind `motion-safe:`).
 */
import { useState } from "react";

import type { Product } from "@/api/types";
import { gammeTint, packshotUrl } from "@/lib/catalogue";
import { cn } from "@/lib/utils";

interface ProductVisualProps {
  product: Product;
  /** "card" : vignette de la grille ; "stage" : grand visuel du mode présentation. */
  size?: "card" | "stage";
  className?: string;
  /** Visuel décoratif (le nom du produit est déjà écrit à côté) : ignoré par les lecteurs d'écran. */
  decorative?: boolean;
}

export function ProductVisual({ product, size = "card", className, decorative = false }: ProductVisualProps) {
  const url = packshotUrl(product);
  const [failed, setFailed] = useState(false);
  const stage = size === "stage";

  return (
    <div className={cn("relative flex items-center justify-center [perspective:900px]", className)}>
      <div
        className={cn(
          "transition-transform duration-700 ease-out [transform-style:preserve-3d]",
          // Survol de la carte : la boîte pivote un peu et se soulève
          !stage && "motion-safe:group-hover:[transform:rotateY(-14deg)_rotateX(6deg)_translateY(-6px)]",
          // Mode présentation : flottement lent et continu
          stage && "motion-safe:animate-[noor-float_6s_ease-in-out_infinite]",
        )}
      >
        {url && !failed ? (
          <img
            src={url}
            alt={decorative ? "" : `Boîte de ${product.brand_name}`}
            loading={stage ? "eager" : "lazy"}
            draggable={false}
            onError={() => setFailed(true)}
            // Fond détouré (transparent) : la boîte se pose sur n'importe quelle couleur
            className={cn("object-contain drop-shadow-[0_14px_18px_rgba(14,42,43,0.12)] select-none", stage ? "max-h-[32vh] w-auto sm:max-h-[52vh]" : "size-44")}
          />
        ) : (
          <DrawnBox product={product} stage={stage} decorative={decorative} />
        )}
      </div>
    </div>
  );
}

/** Boîte de médicament dessinée en CSS (face avant + tranche), quand il n'y a pas d'image. */
function DrawnBox({ product, stage, decorative }: { product: Product; stage: boolean; decorative: boolean }) {
  const tint = gammeTint(product.product_line);
  return (
    <div
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `Boîte de ${product.brand_name}`}
      className={cn("relative [transform-style:preserve-3d] [transform:rotateY(-22deg)]", stage ? "h-64 w-48" : "h-36 w-28")}
    >
      {/* Face avant */}
      <div className="border-line absolute inset-0 flex flex-col overflow-hidden rounded-[3px] border bg-white shadow-[0_18px_30px_-18px_rgba(14,42,43,0.45)]">
        <div className="h-[30%]" style={{ background: tint }} />
        <div className="flex flex-1 flex-col justify-between p-2.5">
          <div>
            <p className={cn("font-display text-ink leading-none font-bold", stage ? "text-2xl" : "text-sm")}>{product.brand_name}</p>
            <p className={cn("text-muted-foreground mt-1 leading-tight", stage ? "text-sm" : "text-[9px]")}>{product.molecule}</p>
          </div>
          <p className={cn("text-pine font-display font-semibold tracking-wide", stage ? "text-xs" : "text-[8px]")}>✳ NOOR</p>
        </div>
      </div>
      {/* Tranche droite (donne l'effet de volume) */}
      <div
        className="absolute top-0 right-0 h-full w-7 origin-right [transform:rotateY(90deg)] rounded-r-[3px]"
        style={{ background: `linear-gradient(90deg, ${tint}, color-mix(in srgb, ${tint} 70%, black))` }}
      />
    </div>
  );
}
