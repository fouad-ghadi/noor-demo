/**
 * ✨ IA — Visites recommandées (backend : app/ai/recommendations.py).
 *
 * NOOR propose qui voir, quand et avec quels produits, et explique toujours pourquoi.
 * Le délégué décide : le bouton « Planifier » ouvre la fenêtre de planification
 * pré-remplie (date et créneau conseillés), qu'il peut modifier.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";
import { Link } from "react-router-dom";

import { aiApi, type VisitRecommendation } from "@/api/ai";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DEFAULT_TIME, PlanVisitDialog } from "@/components/visits/PlanVisitDialog";
import { useProducts } from "@/hooks/queries";
import { formatRelativeDay } from "@/lib/format";

const SLOT_SHORT = { matin: "matin", midi: "midi", apres_midi: "après-midi" } as const;

export function RecommendedVisits({ delegueId, readOnly }: { delegueId?: number; readOnly?: boolean }) {
  const recos = useQuery({
    queryKey: ["recommendations", delegueId ?? "me"],
    queryFn: () => aiApi.recommendations(delegueId),
  });
  const products = useProducts();
  const productName = (id: number) => products.data?.find((p) => p.id === id)?.brand_name ?? "";
  const [planning, setPlanning] = useState<VisitRecommendation | null>(null);

  // Module indisponible ou erreur : la carte ne s'affiche pas (le reste du tableau de bord suffit)
  if (recos.isError || (recos.data && recos.data.length === 0)) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Visites recommandées</CardTitle>
        <CardDescription>
          Proposées par NOOR à partir de l'historique, des prescriptions et des objectifs du mois. Chaque proposition
          explique pourquoi.
        </CardDescription>
      </CardHeader>
      <CardContent className="divide-line divide-y">
        {recos.isLoading && <p className="text-muted-foreground text-sm">Calcul des recommandations…</p>}
        {recos.data?.map((r) => (
          <div key={r.doctor_id} className="flex gap-4 py-3.5 first:pt-0 last:pb-0">
            {/* Quand : date et créneau conseillés (colonne sur ordinateur, ligne au-dessus du nom sur téléphone) */}
            <div className="hidden w-20 shrink-0 sm:block">
              <p className="font-display text-ink text-sm font-semibold first-letter:uppercase">
                {formatRelativeDay(r.suggested_date)}
              </p>
              <p className="text-muted-foreground text-xs">{SLOT_SHORT[r.suggested_slot]}</p>
            </div>
            {/* Qui, avec quoi, pourquoi */}
            <div className="min-w-0 flex-1">
              <p className="text-muted-foreground text-xs sm:hidden">
                <span className="first-letter:uppercase inline-block">{formatRelativeDay(r.suggested_date)}</span>,{" "}
                {SLOT_SHORT[r.suggested_slot]}
              </p>
              <Link to={`/medecins/${r.doctor_id}`} className="text-ink font-medium underline-offset-4 hover:underline">
                {r.doctor_name}
              </Link>
              {r.product_ids.length > 0 && (
                <p className="text-ink/80 text-[13px]">À présenter : {r.product_ids.map(productName).join(", ")}</p>
              )}
              <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                {r.reasons.map((reason) => (
                  <li key={reason} className="flex gap-1.5">
                    <span className="bg-pine/40 mt-1.5 size-1 shrink-0 rounded-full" aria-hidden="true" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
            {!readOnly && (
              <Button size="sm" variant="outline" className="shrink-0 self-start" onClick={() => setPlanning(r)}>
                <CalendarPlus /> <span className="hidden sm:inline">Planifier</span>
                <span className="sr-only sm:hidden">Planifier la visite de {r.doctor_name}</span>
              </Button>
            )}
          </div>
        ))}
      </CardContent>
      <PlanVisitDialog
        open={!!planning}
        onOpenChange={(o) => !o && setPlanning(null)}
        doctor={planning ? { id: planning.doctor_id, name: planning.doctor_name, preferred_slot: planning.suggested_slot } : undefined}
        defaultDate={planning ? new Date(`${planning.suggested_date}T00:00:00`) : undefined}
        defaultTime={planning ? DEFAULT_TIME[planning.suggested_slot] : undefined}
      />
    </Card>
  );
}
