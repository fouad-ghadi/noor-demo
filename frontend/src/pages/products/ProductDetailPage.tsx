/**
 * Fiche produit : molécule, indications, messages clés, documents liés,
 * et statistiques de prescription dans le périmètre de l'utilisateur.
 *
 * Les documents (RCP, notice...) seront la base de connaissances du futur
 * assistant produit (RAG) : il ne répondra qu'à partir de ces documents.
 */
import { useQuery } from "@tanstack/react-query";
import { BookOpen, CheckCircle2, FileText, Megaphone, Package, Stethoscope } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { api } from "@/api/client";
import type { DocumentInfo, PrescribingStatus } from "@/api/types";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PRESCRIBING } from "@/lib/labels";

const DOC_TYPE: Record<DocumentInfo["doc_type"], { label: string; icon: typeof FileText }> = {
  rcp: { label: "RCP", icon: BookOpen },
  notice: { label: "Notice patient", icon: FileText },
  support_promotionnel: { label: "Support promotionnel", icon: Megaphone },
};

const ORDER: PrescribingStatus[] = ["regulier", "occasionnel", "non_prescripteur"];
const BAR_COLOR: Record<PrescribingStatus, string> = {
  regulier: "#0d9488",
  occasionnel: "#14b8a6",
  non_prescripteur: "#e2e8f0",
};

export function ProductDetailPage() {
  const id = Number(useParams().id);
  const product = useQuery({ queryKey: ["product", id], queryFn: () => api.product(id) });
  const p = product.data;
  usePageContext({ page: "product_detail", title: p ? `Produit ${p.brand_name}` : "Produit", productId: id });

  if (product.isLoading) return <LoadingState />;
  if (product.isError || !p) return <ErrorState error={product.error} onRetry={() => product.refetch()} />;

  const total = ORDER.reduce((s, k) => s + p.stats.prescribers[k], 0);

  return (
    <>
      <PageHeader
        backTo="/produits"
        backLabel="Produits"
        title={
          <span>
            {p.brand_name} <span className="text-muted-foreground font-normal">— {p.molecule}</span>
          </span>
        }
        description={p.therapeutic_class}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Messages clés</CardTitle>
              <CardDescription>À transmettre pendant la visite</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {p.key_messages.map((m, i) => (
                <div key={m} className="flex gap-3 rounded-lg bg-teal-50/70 p-3 text-sm">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-bold text-white">
                    {i + 1}
                  </span>
                  {m}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Indications</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {p.indications.map((ind) => (
                  <li key={ind} className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-teal-700" /> {ind}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Documents</CardTitle>
              <CardDescription>
                Documents officiels du produit. Ils alimenteront l'assistant produit (réponses avec citations).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {p.documents.map((doc) => {
                const T = DOC_TYPE[doc.doc_type];
                return (
                  <div key={doc.id} className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <T.icon className="size-5 shrink-0 text-teal-700" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {T.label}
                        {doc.version && ` · version ${doc.version}`}
                      </p>
                    </div>
                    {doc.file_path ? (
                      <Button variant="outline" size="sm" asChild>
                        <a href={doc.file_path} target="_blank" rel="noreferrer">
                          Ouvrir
                        </a>
                      </Button>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground font-normal">
                        PDF à déposer
                      </Badge>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="size-4" /> Présentation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>{p.form_dosage}</p>
              {p.description && <p className="text-muted-foreground">{p.description}</p>}
              <div>
                <p className="text-muted-foreground mb-1.5 text-xs">Spécialités ciblées</p>
                <div className="flex flex-wrap gap-1.5">
                  {p.target_specialties.map((s) => (
                    <Badge key={s} variant="secondary" className="font-normal">
                      {s}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Stethoscope className="size-4" /> Prescription
              </CardTitle>
              <CardDescription>Dans votre périmètre ({total} médecins)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Barre empilée : réguliers / occasionnels / non prescripteurs (2 px d'espace entre segments) */}
              <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
                {ORDER.map((k) =>
                  p.stats.prescribers[k] ? (
                    <div
                      key={k}
                      style={{ width: `${(100 * p.stats.prescribers[k]) / Math.max(1, total)}%`, background: BAR_COLOR[k] }}
                      title={`${PRESCRIBING[k].label} : ${p.stats.prescribers[k]}`}
                    />
                  ) : null,
                )}
              </div>
              <div className="space-y-1.5 text-sm">
                {ORDER.map((k) => (
                  <Link
                    key={k}
                    to={`/medecins?product_id=${p.id}&prescribing_status=${k}`}
                    className="hover:bg-muted/60 -mx-2 flex items-center gap-2 rounded-md px-2 py-1"
                  >
                    <span className="size-2.5 rounded-sm" style={{ background: BAR_COLOR[k] }} />
                    {PRESCRIBING[k].label}
                    <span className="tabular ml-auto font-semibold">{p.stats.prescribers[k]}</span>
                  </Link>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <p className="tabular text-xl font-semibold">{p.stats.presentations_last_30d}</p>
                  <p className="text-muted-foreground text-xs">présentations (30 j)</p>
                </div>
                <div>
                  <p className="tabular text-xl font-semibold">{p.stats.samples_last_30d}</p>
                  <p className="text-muted-foreground text-xs">échantillons remis (30 j)</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
