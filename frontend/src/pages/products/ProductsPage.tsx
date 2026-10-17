/** Catalogue des produits du laboratoire. */
import { ChevronRight, FileText, Pill } from "lucide-react";
import { Link } from "react-router-dom";

import { usePageContext } from "@/components/assistant/AssistantContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useProducts } from "@/hooks/queries";

export function ProductsPage() {
  usePageContext({ page: "products", title: "Catalogue produits" });
  const products = useProducts();

  if (products.isLoading) return <LoadingState />;
  if (products.isError) return <ErrorState error={products.error} onRetry={() => products.refetch()} />;

  return (
    <>
      <PageHeader title="Produits" description={`${products.data?.length ?? 0} produits · noms commerciaux fictifs (démo)`} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {products.data?.map((p) => (
          <Link key={p.id} to={`/produits/${p.id}`} className="group">
            <Card className="h-full gap-3 px-5 py-4 transition group-hover:border-teal-300 group-hover:shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                  <Pill className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{p.brand_name}</p>
                  <p className="text-muted-foreground text-sm">{p.molecule}</p>
                </div>
                <ChevronRight className="text-muted-foreground size-4 transition group-hover:translate-x-0.5" />
              </div>
              <p className="text-sm">{p.therapeutic_class}</p>
              <p className="text-muted-foreground line-clamp-2 text-xs">{p.form_dosage}</p>
              <div className="mt-auto flex flex-wrap items-center gap-1.5">
                {p.target_specialties.map((s) => (
                  <Badge key={s} variant="secondary" className="font-normal">
                    {s}
                  </Badge>
                ))}
                <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
                  <FileText className="size-3.5" /> {p.documents.length}
                </span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
