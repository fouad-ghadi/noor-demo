/**
 * Catalogue médicaments : la vitrine que le délégué montre au médecin sur sa tablette.
 *  - grille de produits animée (entrée en cascade, boîte qui pivote au survol) ;
 *  - filtres par gamme + recherche (nom, molécule, classe, indication, spécialité) ;
 *  - un clic ouvre un aperçu (messages clés, indications, formes) ;
 *  - « Présenter au médecin » : plein écran, un produit à la fois, balayage du doigt.
 * Visuels : photos générées avec Higgsfield (frontend/public/products/), boîte dessinée sinon.
 * La logique (filtres, gammes) est dans src/lib/catalogue.ts.
 */
import { useCallback, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Presentation, Search, X } from "lucide-react";
import { Link } from "react-router-dom";

import type { Product } from "@/api/types";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { PresentationMode } from "@/components/catalogue/PresentationMode";
import { ProductVisual } from "@/components/catalogue/ProductVisual";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useProducts } from "@/hooks/queries";
import { filterProducts, gammeLabel, gammesOf } from "@/lib/catalogue";
import { cn } from "@/lib/utils";

export function ProductsPage() {
  usePageContext({ page: "products", title: "Catalogue médicaments" });
  const products = useProducts();
  const [gamme, setGamme] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);
  // Index du produit affiché en mode présentation (null = mode fermé)
  const [presenting, setPresenting] = useState<number | null>(null);

  const all = useMemo(() => products.data ?? [], [products.data]);
  const gammes = useMemo(() => gammesOf(all), [all]);
  const visible = useMemo(() => filterProducts(all, gamme, query), [all, gamme, query]);
  const closePresentation = useCallback(() => setPresenting(null), []);

  if (products.isLoading) return <LoadingState />;
  if (products.isError) return <ErrorState error={products.error} onRetry={() => products.refetch()} />;

  const present = (p: Product) => {
    setSelected(null);
    setPresenting(Math.max(0, visible.findIndex((x) => x.id === p.id)));
  };

  return (
    <>
      <PageHeader
        title="Catalogue médicaments"
        description={`${all.length} produits à présenter. Noms commerciaux fictifs, molécules réelles.`}
        actions={
          <Button onClick={() => setPresenting(0)} disabled={visible.length === 0}>
            <Presentation className="size-4" /> Présenter au médecin
          </Button>
        }
      />

      {/* Recherche + filtres par gamme */}
      <div className="mb-6 space-y-3">
        <div className="relative max-w-md">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom, molécule, indication..."
            aria-label="Rechercher un produit"
            className="h-11 bg-white pl-9"
          />
          {query && (
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => setQuery("")}
              className="text-muted-foreground hover:text-ink absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrer par gamme">
          <FilterChip active={gamme === null} onClick={() => setGamme(null)} label="Toutes" count={all.length} />
          {gammes.map((g) => (
            <FilterChip
              key={g.code}
              active={gamme === g.code}
              onClick={() => setGamme(gamme === g.code ? null : g.code)}
              label={g.label}
              count={g.count}
            />
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title="Aucun produit trouvé"
          description="Essayez un autre mot ou une autre gamme."
          action={
            <Button variant="outline" onClick={() => { setQuery(""); setGamme(null); }}>
              Tout afficher
            </Button>
          }
        />
      ) : (
        // La clé change avec les filtres : les cartes rejouent leur entrée en cascade
        <div key={`${gamme}-${query}`} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((p, i) => (
            <ProductCard key={p.id} product={p} delay={Math.min(i, 8) * 60} onOpen={() => setSelected(p)} />
          ))}
        </div>
      )}

      <ProductSheet product={selected} onClose={() => setSelected(null)} onPresent={present} />

      {presenting !== null && visible.length > 0 && (
        <PresentationMode products={visible} startIndex={presenting} onClose={closePresentation} />
      )}
    </>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "focus-visible:ring-ring flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none",
        active ? "bg-pine border-pine text-white" : "border-line text-ink hover:bg-mint-wash bg-white",
      )}
    >
      {label}
      <span className={cn("text-xs", active ? "text-mint" : "text-muted-foreground")}>{count}</span>
    </button>
  );
}

/** Carte produit : visuel en haut, puis nom, molécule et gamme. */
function ProductCard({ product: p, delay, onOpen }: { product: Product; delay: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ animationDelay: `${delay}ms` }}
      className="catalogue-rise group border-line hover:border-pine/30 focus-visible:ring-ring flex flex-col overflow-hidden rounded-xl border bg-white text-left transition-[border-color,box-shadow] duration-300 hover:shadow-[0_18px_40px_-24px_rgba(14,42,43,0.35)] focus-visible:ring-2 focus-visible:outline-none"
    >
      <ProductVisual product={p} decorative className="h-52 bg-white pt-3" />
      <div className="border-line flex flex-1 flex-col border-t px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-display text-ink text-xl leading-tight font-semibold tracking-[-0.01em]">{p.brand_name}</p>
          <span className="text-pine shrink-0 text-xs font-medium">{gammeLabel(p.product_line)}</span>
        </div>
        <p className="text-muted-foreground mt-0.5 text-sm">{p.molecule}</p>
        <p className="text-ink mt-2 line-clamp-2 text-[13px]">{p.therapeutic_class}</p>
      </div>
    </button>
  );
}

/** Aperçu d'un produit (panneau latéral, ou par le bas sur mobile). */
function ProductSheet({ product: p, onClose, onPresent }: { product: Product | null; onClose: () => void; onPresent: (p: Product) => void }) {
  return (
    <Sheet open={p !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        {p && (
          <>
            <SheetHeader>
              <p className="text-pine text-sm font-medium">{gammeLabel(p.product_line)}</p>
              <SheetTitle className="font-display text-3xl">{p.brand_name}</SheetTitle>
              <SheetDescription>
                {p.molecule}. {p.therapeutic_class}
              </SheetDescription>
            </SheetHeader>
            <div className="space-y-6 px-4 pb-6">
              <ProductVisual product={p} className="h-56" />

              <section>
                <h3 className="font-display text-ink border-line mb-3 border-b pb-2 font-semibold">Messages clés</h3>
                <ol className="space-y-3">
                  {p.key_messages.slice(0, 3).map((m, i) => (
                    <li key={m} className="text-ink flex gap-3 text-sm leading-snug">
                      <span className="bg-mint text-pine font-display flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold">
                        {i + 1}
                      </span>
                      {m}
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <h3 className="font-display text-ink border-line mb-3 border-b pb-2 font-semibold">Indications</h3>
                <ul className="space-y-2 text-sm">
                  {p.indications.map((ind) => (
                    <li key={ind} className="flex gap-2">
                      <CheckCircle2 className="text-pine mt-0.5 size-4 shrink-0" /> {ind}
                    </li>
                  ))}
                </ul>
              </section>

              <section>
                <h3 className="font-display text-ink border-line mb-2 border-b pb-2 font-semibold">Formes et dosages</h3>
                <p className="text-sm">{p.form_dosage}</p>
                <p className="text-muted-foreground mt-2 text-sm">Pour : {p.target_specialties.join(", ")}</p>
              </section>

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" onClick={() => onPresent(p)}>
                  <Presentation className="size-4" /> Présenter au médecin
                </Button>
                <Button variant="outline" className="flex-1" asChild>
                  <Link to={`/produits/${p.id}`}>
                    Fiche complète <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
