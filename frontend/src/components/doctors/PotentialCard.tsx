/**
 * 🅰️ IA — Potentiel A / B / C et fréquence de visite conseillée (backend : app/ai/potential.py).
 *
 * Règle du laboratoire : potentiel du cabinet (patients par jour) + potentiel de prescription.
 * NOOR calcule un score sur 100, montre le détail de chaque critère (le « pourquoi »),
 * et propose un potentiel et une fréquence. Le délégué valide, ou garde sa fiche telle quelle.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { aiApi } from "@/api/ai";
import { FrequencyBadge, SegmentBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function PotentialCard({ doctorId, readOnly }: { doctorId: number; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const potential = useQuery({ queryKey: ["potential", doctorId], queryFn: () => aiApi.potential(doctorId) });
  const apply = useMutation({
    mutationFn: () => aiApi.applyPotential(doctorId, potential.data!.proposed_segment, potential.data!.advised_frequency),
    onSuccess: () => {
      toast.success("Fiche mise à jour avec la proposition de NOOR");
      for (const key of ["potential", "doctor", "doctors", "recommendations", "dashboard"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const p = potential.data;
  if (potential.isError) return null; // le reste de la fiche suffit
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="text-pine size-4" /> Potentiel et fréquence de visite
        </CardTitle>
        <CardDescription>Calculés par NOOR selon la règle du ciblage : patients par jour et prescription de nos produits.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!p && <p className="text-muted-foreground text-sm">Calcul du potentiel…</p>}
        {p && (
          <>
            {/* Fiche actuelle → proposition */}
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5">
                <SegmentBadge segment={p.current_segment} />
                <FrequencyBadge frequency={p.current_frequency} />
              </div>
              {p.differs && (
                <>
                  <span className="text-muted-foreground" aria-hidden="true">→</span>
                  <div className="flex items-center gap-1.5">
                    <SegmentBadge segment={p.proposed_segment} />
                    <FrequencyBadge frequency={p.advised_frequency} />
                  </div>
                </>
              )}
              <span className="font-display tabular text-ink ml-auto text-lg font-semibold">
                {p.score}
                <span className="text-muted-foreground text-xs font-normal"> / 100</span>
              </span>
            </div>

            {/* Le pourquoi : chaque critère avec ses points */}
            <ul className="space-y-3">
              {p.factors.map((f) => (
                <li key={f.label} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-ink font-medium">{f.label}</span>
                    <span className="text-muted-foreground tabular">
                      {f.points} / {f.max_points}
                    </span>
                  </div>
                  <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                    <div className="bg-pine bar-grow h-full rounded-full" style={{ width: `${(100 * f.points) / f.max_points}%` }} />
                  </div>
                  <p className="text-muted-foreground text-xs">{f.explanation}</p>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground text-xs">Fréquence : {p.frequency_reason}.</p>

            <div className={cn("rounded-lg border px-3 py-2.5 text-[13px]", p.differs ? "border-mint bg-mint-wash/60" : "border-line bg-paper")}>
              <p className="text-ink">{p.summary}</p>
              {p.differs && (
                <p className="text-muted-foreground mt-0.5 text-xs">
                  À valider avec votre superviseur au prochain ciblage ({p.next_targeting}).
                </p>
              )}
            </div>
            {p.differs && !readOnly && (
              <Button size="sm" onClick={() => apply.mutate()} disabled={apply.isPending}>
                <Check /> Appliquer la proposition
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
