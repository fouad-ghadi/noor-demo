/**
 * Mode « Présenter au médecin » : plein écran, un produit à la fois, grand visuel
 * et messages clés. Navigation : flèches à l'écran, flèches du clavier, ou balayage
 * du doigt sur tablette. Échap ferme le mode.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import type { Product } from "@/api/types";
import { ProductVisual } from "@/components/catalogue/ProductVisual";
import { gammeLabel, wrapIndex } from "@/lib/catalogue";

interface PresentationModeProps {
  products: Product[];
  startIndex: number;
  onClose: () => void;
}

/** Distance minimale (px) d'un balayage pour changer de produit. */
const SWIPE_THRESHOLD = 50;

export function PresentationMode({ products, startIndex, onClose }: PresentationModeProps) {
  const [index, setIndex] = useState(startIndex);
  const [direction, setDirection] = useState<"next" | "prev">("next");
  const rootRef = useRef<HTMLDivElement>(null);
  const swipeStart = useRef<number | null>(null);

  const go = useCallback(
    (step: 1 | -1) => {
      setDirection(step === 1 ? "next" : "prev");
      setIndex((i) => wrapIndex(i + step, products.length));
    },
    [products.length],
  );

  // Clavier : ← → pour naviguer, Échap pour fermer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [go, onClose]);

  // Vrai plein écran quand le navigateur le permet (sinon, l'overlay couvre déjà la page).
  // Si l'utilisateur quitte le plein écran (touche Échap du navigateur), on ferme aussi le mode.
  useEffect(() => {
    const el = rootRef.current;
    el?.requestFullscreen?.().catch(() => {});
    const onChange = () => {
      if (!document.fullscreenElement) onClose();
    };
    document.addEventListener("fullscreenchange", onChange);
    // On bloque le défilement de la page derrière
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.body.style.overflow = overflow;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  const p = products[index];
  if (!p) return null;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Présentation des produits"
      className="bg-paper fixed inset-0 z-[60] flex flex-col select-none"
      onPointerDown={(e) => {
        swipeStart.current = e.clientX;
      }}
      onPointerUp={(e) => {
        if (swipeStart.current === null) return;
        const dx = e.clientX - swipeStart.current;
        swipeStart.current = null;
        if (Math.abs(dx) > SWIPE_THRESHOLD) go(dx < 0 ? 1 : -1);
      }}
    >
      {/* Barre du haut : position et fermeture */}
      <div className="flex items-center justify-between px-5 py-4 sm:px-8">
        <p className="text-muted-foreground text-sm">
          Produit {index + 1} sur {products.length}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="text-ink hover:bg-mint-wash focus-visible:ring-ring flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:outline-none"
        >
          <X className="size-4" /> Fermer
        </button>
      </div>

      {/* Scène : visuel + messages. La clé force l'animation de glissement à chaque produit. */}
      <div
        key={p.id}
        className={`grid min-h-0 flex-1 items-center gap-6 overflow-y-auto px-6 pb-6 sm:px-12 lg:grid-cols-2 lg:gap-12 ${direction === "next" ? "slide-next" : "slide-prev"}`}
      >
        <ProductVisual product={p} size="stage" className="py-4" />

        <div className="max-w-xl">
          <p className="text-pine text-sm font-medium">{gammeLabel(p.product_line)}</p>
          <h2 className="font-display text-ink mt-1 text-5xl leading-none font-semibold tracking-[-0.02em] sm:text-6xl">{p.brand_name}</h2>
          <p className="text-muted-foreground mt-3 text-lg">
            {p.molecule}. {p.therapeutic_class}
          </p>
          <ol className="mt-7 space-y-4">
            {p.key_messages.slice(0, 3).map((m, i) => (
              <li key={m} className="text-ink flex gap-4 text-lg leading-snug sm:text-xl">
                <span className="bg-pine font-display flex size-9 shrink-0 items-center justify-center rounded-full text-base font-bold text-white">
                  {i + 1}
                </span>
                <span className="pt-1">{m}</span>
              </li>
            ))}
          </ol>
          <p className="text-muted-foreground border-line mt-7 border-t pt-4 text-sm">{p.form_dosage}</p>
        </div>
      </div>

      {/* Navigation : flèches + points */}
      <div className="flex items-center justify-center gap-5 pb-6">
        <NavButton label="Produit précédent" onClick={() => go(-1)}>
          <ChevronLeft className="size-6" />
        </NavButton>
        <div className="flex gap-1.5" aria-hidden>
          {products.map((x, i) => (
            <span key={x.id} className={`h-1.5 rounded-full transition-all ${i === index ? "bg-pine w-6" : "bg-line w-1.5"}`} />
          ))}
        </div>
        <NavButton label="Produit suivant" onClick={() => go(1)}>
          <ChevronRight className="size-6" />
        </NavButton>
      </div>
    </div>
  );
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      // On empêche le bouton de déclencher aussi un « balayage »
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      className="border-line text-pine hover:bg-mint-wash focus-visible:ring-ring flex size-12 items-center justify-center rounded-full border bg-white focus-visible:ring-2 focus-visible:outline-none"
    >
      {children}
    </button>
  );
}
