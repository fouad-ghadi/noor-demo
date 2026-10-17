/** Catalogue des produits du laboratoire. */
import { ChevronRight, FileText } from "lucide-react";
import { Link } from "react-router-dom";

import { usePageContext } from "@/components/assistant/AssistantContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { useProducts } from "@/hooks/queries";

export function ProductsPage() {
  usePageContext({ page: "products", title: "Catalogue produits" });
  const products = useProducts();

  if (products.isLoading) return <LoadingState />;
  if (products.isError) return <ErrorState error={products.error} onRetry={() => products.refetch()} />;

  return (
    <>
      <PageHeader title="Produits" description={`${products.data?.length ?? 0} produits. Les noms commerciaux sont fictifs, les molécules sont réelles.`} />
      {/* Catalogue : chaque produit comme une étiquette de boîte (nom commercial, molécule, forme) */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {products.data?.map((p) => (
          <Link
            key={p.id}
            to={`/produits/${p.id}`}
            className="group border-line hover:border-pine/30 focus-visible:ring-ring flex flex-col rounded-xl border bg-white transition-colors focus-visible:ring-2 focus-visible:outline-none"
          >
            <div className="flex items-start gap-4 p-5 pb-4">
              <span className="bg-mint-wash text-pine font-display flex size-12 shrink-0 items-center justify-center rounded-xl text-lg font-bold">
                {p.brand_name.slice(0, 2)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-display text-ink text-xl leading-tight font-semibold tracking-[-0.01em] group-hover:underline">
                  {p.brand_name}
                </p>
                <p className="text-muted-foreground mt-0.5 text-sm">{p.molecule}</p>
              </div>
              <ChevronRight className="text-muted-foreground mt-1 size-4 transition group-hover:translate-x-0.5" />
            </div>
            <div className="flex-1 px-5 pb-4">
              <p className="text-ink text-sm">{p.therapeutic_class}</p>
              <p className="text-muted-foreground mt-1 line-clamp-2 text-[13px]">{p.form_dosage}</p>
            </div>
            <div className="border-line bg-paper flex items-center gap-3 rounded-b-xl border-t px-5 py-2.5 text-xs">
              <span className="text-muted-foreground min-w-0 flex-1 truncate">Pour : {p.target_specialties.join(", ")}</span>
              <span className="text-muted-foreground flex shrink-0 items-center gap-1" title="Documents">
                <FileText className="size-3.5" /> {p.documents.length}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
