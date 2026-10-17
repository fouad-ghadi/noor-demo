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
  // Une teinte (pin) du plus plein au plus clair : régulier → non prescripteur
  regulier: "#0f3d3e",
  occasionnel: "#5fb8a8",
  non_prescripteur: "#e1e7e3",
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
        title={p.brand_name}
        description={`${p.molecule}. ${p.therapeutic_class}`}
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Messages clés</CardTitle>
              <CardDescription>À transmettre pendant la visite</CardDescription>
            </CardHeader>
            <CardContent className="divide-line divide-y">
              {p.key_messages.map((m, i) => (
                <div key={m} className="text-ink flex gap-4 py-3 text-[15px] leading-snug first:pt-0 last:pb-0">
                  <span className="font-display text-pine bg-mint flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold">
                    {i + 1}
                  </span>
                  {m}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Indications</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {p.indications.map((ind) => (
                  <li key={ind} className="flex gap-2">
                    <CheckCircle2 className="text-pine mt-0.5 size-4 shrink-0" /> {ind}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>
                Documents officiels du produit. Ils alimenteront l'assistant produit (réponses avec citations).
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-line divide-y">
              {p.documents.map((doc) => {
                const T = DOC_TYPE[doc.doc_type];
                return (
                  <div key={doc.id} className="border-line flex items-center gap-3 rounded-lg border px-3 py-2.5">
                    <T.icon className="text-pine size-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{doc.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {T.label}
                        {doc.version && `, version ${doc.version}`}
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
              <CardTitle className="flex items-center gap-2">
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
              <CardTitle className="flex items-center gap-2">
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
                    className="hover:bg-mint-wash/60 -mx-2 flex items-center gap-2 rounded-md px-2 py-1"
                  >
                    <span className="size-2.5 rounded-sm" style={{ background: BAR_COLOR[k] }} />
                    {PRESCRIBING[k].label}
                    <span className="tabular ml-auto font-semibold">{p.stats.prescribers[k]}</span>
                  </Link>
                ))}
              </div>
              <div className="border-line grid grid-cols-2 gap-3 border-t pt-3">
                <div>
                  <p className="font-display tabular text-ink text-2xl font-semibold">{p.stats.presentations_last_30d}</p>
                  <p className="text-muted-foreground text-xs">présentations (30 j)</p>
                </div>
                <div>
                  <p className="font-display tabular text-ink text-2xl font-semibold">{p.stats.samples_last_30d}</p>
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
