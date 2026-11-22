/**
 * 🗓️ IA — « Remplir ma semaine » (backend : app/ai/week_planner.py).
 *
 * NOOR propose des visites pour les places libres de la semaine :
 *   - les médecins prioritaires (ciblage F1/F2 en retard, potentiel, produits, marché) ;
 *   - regroupés par QUARTIER chaque jour (moins de route) ;
 *   - placés uniquement les jours où le médecin REÇOIT les délégués, sur son créneau préféré.
 * Le délégué décoche ce qu'il ne veut pas, puis valide : seules les visites cochées sont planifiées.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarCheck, MapPin, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { aiApi, type DayPlan } from "@/api/ai";
import { FrequencyBadge, SegmentBadge } from "@/components/shared/badges";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { invalidateVisitData } from "@/hooks/queries";
import { formatLongDay, formatTime } from "@/lib/format";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lundi de la semaine affichée (« 2026-12-07 ») ; sans valeur : première semaine avec des places libres. */
  start?: string;
  /** Appelé après validation, avec le lundi de la semaine remplie (pour l'afficher). */
  onDone?: (weekStart: string) => void;
}

const key = (doctorId: number, at: string) => `${doctorId}|${at}`;

export function FillWeekDialog({ open, onOpenChange, start, onDone }: Props) {
  const queryClient = useQueryClient();
  const plan = useQuery({
    queryKey: ["week-plan", start ?? "auto"],
    queryFn: () => aiApi.weekPlan(start),
    enabled: open,
    staleTime: 0,
  });
  // Visites décochées par le délégué (tout est coché au départ)
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setUnchecked(new Set());
  }, [open, plan.data]);

  const all = useMemo(() => plan.data?.days.flatMap((d) => d.proposals) ?? [], [plan.data]);
  const chosen = all.filter((p) => !unchecked.has(key(p.doctor_id, p.planned_at)));

  const confirm = useMutation({
    mutationFn: () => aiApi.confirmWeekPlan(chosen.map((p) => ({ doctor_id: p.doctor_id, planned_at: p.planned_at }))),
    onSuccess: (r) => {
      invalidateVisitData(queryClient);
      queryClient.invalidateQueries({ queryKey: ["week-plan"] });
      toast.success(`${r.planned} visites ajoutées au planning`, { description: plan.data?.label });
      onDone?.(plan.data!.week_start);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (k: string) =>
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="font-display flex items-center gap-2 text-xl">
            <Sparkles className="text-pine size-5" /> Remplir ma semaine
          </DialogTitle>
          <DialogDescription>
            {plan.data
              ? plan.data.summary
              : "NOOR choisit les médecins prioritaires, les regroupe par quartier et respecte leurs jours de réception."}
          </DialogDescription>
        </DialogHeader>

        {plan.isLoading && <p className="text-muted-foreground text-sm">NOOR prépare votre semaine…</p>}
        {plan.isError && <ErrorState error={plan.error} onRetry={() => plan.refetch()} />}

        {plan.data && (
          <div className="space-y-5">
            {plan.data.days.map((day) => (
              <DaySection key={day.day} day={day} unchecked={unchecked} onToggle={toggle} />
            ))}
            {plan.data.total_proposed === 0 && (
              <p className="text-muted-foreground border-line rounded-xl border border-dashed p-6 text-center text-sm">
                Cette semaine est déjà complète : rien à ajouter.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="border-line bg-card sticky -bottom-6 -mx-6 -mb-6 border-t px-6 py-4">
          <p className="text-muted-foreground mr-auto self-center text-xs">
            Vous gardez la main : décochez une visite pour ne pas la planifier.
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => confirm.mutate()} disabled={!chosen.length || confirm.isPending}>
            <CalendarCheck /> Ajouter {chosen.length} visite{chosen.length > 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DaySection({ day, unchecked, onToggle }: { day: DayPlan; unchecked: Set<string>; onToggle: (k: string) => void }) {
  const full = day.proposals.length === 0;
  return (
    <section>
      <div className="border-line mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-1.5">
        <h3 className="font-display text-ink text-base font-semibold first-letter:uppercase">{formatLongDay(day.day)}</h3>
        {day.zone.length > 0 && (
          <span className="text-pine flex items-center gap-1 text-[13px] font-medium">
            <MapPin className="size-3.5" /> {day.zone.join(", ")}
          </span>
        )}
        <span className="text-muted-foreground ml-auto text-xs">
          {day.event ? `${day.event}, ` : ""}
          {day.already_planned} déjà prévue{day.already_planned > 1 ? "s" : ""}, {day.proposals.length} proposée
          {day.proposals.length > 1 ? "s" : ""}
        </span>
      </div>
      {day.zone_reason && <p className="text-muted-foreground mb-2 text-xs">Pourquoi ce quartier : {day.zone_reason}.</p>}
      {full && !day.zone_reason && (
        <p className="text-muted-foreground text-xs">
          {day.capacity === 0 ? "Pas de visite ce jour-là." : "Aucun médecin prioritaire ne reçoit ce jour-là."}
        </p>
      )}
      <ul className="space-y-1.5">
        {day.proposals.map((p) => {
          const k = key(p.doctor_id, p.planned_at);
          const checked = !unchecked.has(k);
          return (
            <li key={k}>
              <label
                className={`border-line flex cursor-pointer gap-3 rounded-lg border bg-white px-3 py-2.5 transition-opacity ${checked ? "" : "opacity-50"}`}
              >
                <Checkbox checked={checked} onCheckedChange={() => onToggle(k)} className="mt-1" aria-label={`Planifier ${p.doctor_name}`} />
                <span className="text-ink tabular w-11 shrink-0 pt-0.5 text-sm font-medium">{formatTime(p.planned_at)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <SegmentBadge segment={p.segment} />
                    <FrequencyBadge frequency={p.frequency} />
                    <span className="text-ink text-sm font-medium">{p.doctor_name}</span>
                    <span className="text-muted-foreground text-xs">
                      {p.specialty}, {p.district}
                    </span>
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">{p.reasons.join(". ")}.</span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
