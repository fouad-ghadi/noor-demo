/**
 * 🗓️ IA — « Remplir ma semaine » (backend : app/ai/week_planner.py).
 *
 * NOOR propose des visites pour les places libres de la semaine :
 *   - les médecins prioritaires (ciblage F1/F2 en retard, potentiel A/B/C, produits, marché, dernière visite) ;
 *   - regroupés par QUARTIER chaque jour, dans l'ordre du trajet le plus court (plus proche voisin) ;
 *   - placés uniquement les jours où le médecin REÇOIT les délégués, sur son créneau préféré.
 * Chaque jour affiche son itinéraire (km et temps de route estimés, carte).
 * Le délégué garde la main : il retire, déplace (autre jour), change l'heure, puis valide.
 * Seules les visites gardées sont planifiées.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarCheck, Car, Map as MapIcon, MapPin, RotateCcw, Sparkles, TriangleAlert, X } from "lucide-react";
import { toast } from "sonner";

import { aiApi, type DayPlan, type PlannedProposal } from "@/api/ai";
import { RouteMap, routeStats } from "@/components/planning/RouteMap";
import { FrequencyBadge, SegmentBadge } from "@/components/shared/badges";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TIME_OPTIONS } from "@/components/visits/PlanVisitDialog";
import { invalidateVisitData } from "@/hooks/queries";
import { capitalize, formatLongDay } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lundi de la semaine affichée (« 2026-12-07 ») ; sans valeur : première semaine avec des places libres. */
  start?: string;
  /** Appelé après validation, avec le lundi de la semaine remplie (pour l'afficher). */
  onDone?: (weekStart: string) => void;
}

/** Une visite proposée, avec les modifications du délégué (jour, heure). */
interface Item extends PlannedProposal {
  key: string;
  day: string; // « 2026-12-07 »
  time: string; // « 09:30 »
  moved: boolean; // déplacée par le délégué
}

/** « Lun. 14 déc. » : tient dans la liste de déplacement. */
const shortDay = (d: string) => capitalize(format(parseISO(d), "EEE d MMM", { locale: fr }));
const km = (n: number) => n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
const minutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`);
/** Le médecin reçoit-il ce jour-là ? (« 1,3 » = mardi et jeudi ; vide = tous les jours) */
const receives = (p: PlannedProposal, day: string) =>
  !p.reception_days || p.reception_days.split(",").includes(String((new Date(`${day}T12:00:00`).getDay() + 6) % 7));

function initialItems(days: DayPlan[]): Item[] {
  return days.flatMap((d) =>
    d.proposals.map((p) => ({
      ...p,
      key: `${p.doctor_id}`,
      day: d.day,
      time: p.planned_at.slice(11, 16),
      moved: false,
    })),
  );
}

export function FillWeekDialog({ open, onOpenChange, start, onDone }: Props) {
  const queryClient = useQueryClient();
  const plan = useQuery({
    queryKey: ["week-plan", start ?? "auto"],
    queryFn: () => aiApi.weekPlan(start),
    enabled: open,
    staleTime: 0,
  });
  const [items, setItems] = useState<Item[]>([]);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [mapDay, setMapDay] = useState<string | null>(null);

  const reset = () => {
    setItems(initialItems(plan.data?.days ?? []));
    setRemoved(new Set());
    setMapDay(null);
  };
  // Nouvelle proposition (ou réouverture) : on repart de ce que NOOR propose
  useEffect(() => {
    if (open && plan.data) {
      setItems(initialItems(plan.data.days));
      setRemoved(new Set());
      setMapDay(null);
    }
  }, [open, plan.data]);

  const kept = items.filter((i) => !removed.has(i.key));
  const edited = items.some((i) => i.moved) || removed.size > 0;

  const update = (key: string, change: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.key === key ? { ...i, ...change, moved: true } : i)));
  const toggleRemoved = (key: string) =>
    setRemoved((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const confirm = useMutation({
    mutationFn: () =>
      aiApi.confirmWeekPlan(kept.map((i) => ({ doctor_id: i.doctor_id, planned_at: `${i.day}T${i.time}:00` }))),
    onSuccess: (r) => {
      invalidateVisitData(queryClient);
      queryClient.invalidateQueries({ queryKey: ["week-plan"] });
      toast.success(`${r.planned} visites ajoutées au planning`, { description: plan.data?.label });
      onDone?.(plan.data!.week_start);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dayOptions = useMemo(() => (plan.data?.days ?? []).filter((d) => d.capacity > 0).map((d) => d.day), [plan.data]);
  const totalKm = useMemo(() => {
    const byDay = new Map<string, Item[]>();
    kept.forEach((i) => byDay.set(i.day, [...(byDay.get(i.day) ?? []), i]));
    let sum = 0;
    byDay.forEach((list) => (sum += routeStats(located(sorted(list))).km));
    return sum;
  }, [kept]);

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
            <p className="border-line bg-mint-wash/50 text-ink rounded-lg border px-3 py-2 text-[13px] leading-relaxed">
              Comment NOOR choisit : potentiel du médecin (A, B, C), fréquence de visite conseillée (F1, F2), date de la
              dernière visite, produits à pousser, jours et créneaux de réception, puis distance entre les cabinets.
              Vous pouvez retirer une visite, la déplacer à un autre jour ou changer l'heure.
            </p>
            {plan.data.days.map((day) => (
              <DaySection
                key={day.day}
                day={day}
                items={sorted(items.filter((i) => i.day === day.day))}
                removed={removed}
                dayOptions={dayOptions}
                showMap={mapDay === day.day}
                onToggleMap={() => setMapDay((d) => (d === day.day ? null : day.day))}
                onToggleRemoved={toggleRemoved}
                onUpdate={update}
              />
            ))}
            {plan.data.total_proposed === 0 && (
              <p className="text-muted-foreground border-line rounded-xl border border-dashed p-6 text-center text-sm">
                Cette semaine est déjà complète : rien à ajouter.
              </p>
            )}
          </div>
        )}

        <DialogFooter className="border-line bg-card sticky -bottom-6 -mx-6 -mb-6 border-t px-6 py-4">
          <p className="text-muted-foreground mr-auto hidden self-center text-xs sm:block">
            {kept.length} visite{kept.length > 1 ? "s" : ""} gardée{kept.length > 1 ? "s" : ""}, environ {km(totalKm)} km de
            route sur la semaine.
          </p>
          {edited && (
            <Button variant="ghost" onClick={reset}>
              <RotateCcw /> Revenir à la proposition
            </Button>
          )}
          <Button variant="outline" className="hidden sm:inline-flex" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => confirm.mutate()} disabled={!kept.length || confirm.isPending}>
            <CalendarCheck /> Valider {kept.length} visite{kept.length > 1 ? "s" : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const sorted = (list: Item[]) => [...list].sort((a, b) => a.time.localeCompare(b.time));
const located = (list: Item[]) =>
  list.filter((i) => i.latitude && i.longitude).map((i) => ({ lat: i.latitude!, lng: i.longitude! }));

function DaySection({
  day,
  items,
  removed,
  dayOptions,
  showMap,
  onToggleMap,
  onToggleRemoved,
  onUpdate,
}: {
  day: DayPlan;
  items: Item[];
  removed: Set<string>;
  dayOptions: string[];
  showMap: boolean;
  onToggleMap: () => void;
  onToggleRemoved: (key: string) => void;
  onUpdate: (key: string, change: Partial<Item>) => void;
}) {
  const kept = items.filter((i) => !removed.has(i.key));
  const stats = routeStats(located(kept));
  const zones = [...new Set(kept.map((i) => i.district))];
  return (
    <section>
      <div className="border-line mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b pb-1.5">
        <h3 className="font-display text-ink text-base font-semibold first-letter:uppercase">{formatLongDay(day.day)}</h3>
        {zones.length > 0 && (
          <span className="text-pine flex items-center gap-1 text-[13px] font-medium">
            <MapPin className="size-3.5" /> {zones.slice(0, 3).join(", ")}
            {zones.length > 3 ? "…" : ""}
          </span>
        )}
        <span className="text-muted-foreground ml-auto text-xs">
          {day.event ? `${day.event}, ` : ""}
          {day.already_planned} déjà prévue{day.already_planned > 1 ? "s" : ""}, {kept.length} proposée
          {kept.length > 1 ? "s" : ""}
        </span>
      </div>
      {day.zone_reason && <p className="text-muted-foreground mb-2 text-xs">Pourquoi ce quartier : {day.zone_reason}.</p>}
      {items.length === 0 && !day.zone_reason && (
        <p className="text-muted-foreground text-xs">
          {day.capacity === 0 ? "Pas de visite ce jour-là." : "Aucun médecin prioritaire ne reçoit ce jour-là."}
        </p>
      )}
      {kept.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span className="text-ink flex items-center gap-1">
            <Car className="text-pine size-3.5" /> Itinéraire : environ {km(stats.km)} km, {minutes(stats.minutes)} de route
          </span>
          <button type="button" onClick={onToggleMap} className="text-pine flex cursor-pointer items-center gap-1 font-medium underline-offset-4 hover:underline">
            <MapIcon className="size-3.5" /> {showMap ? "Masquer la carte" : "Voir sur la carte"}
          </button>
        </div>
      )}
      {showMap && (
        <div className="mb-3">
          <RouteMap
            stops={kept
              .filter((i) => i.latitude && i.longitude)
              .map((i) => ({ id: i.key, lat: i.latitude!, lng: i.longitude!, label: `${i.time} ${i.doctor_name}`, sub: `${i.specialty}, ${i.district}` }))}
          />
        </div>
      )}
      <ul className="space-y-1.5">
        {items.map((p, index) => {
          const isRemoved = removed.has(p.key);
          const prev = items.slice(0, index).reverse().find((x) => !removed.has(x.key));
          const leg = prev && prev.latitude && p.latitude ? routeStats([{ lat: prev.latitude, lng: prev.longitude! }, { lat: p.latitude, lng: p.longitude! }]).km : null;
          const notReceiving = !receives(p, p.day);
          return (
            <li key={p.key} className={cn("border-line rounded-lg border bg-white px-3 py-2.5 transition-opacity", isRemoved && "opacity-50")}>
              <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                <Select value={p.time} onValueChange={(v) => onUpdate(p.key, { time: v })} disabled={isRemoved}>
                  <SelectTrigger className="tabular h-8 w-[5.5rem] px-2 text-sm" aria-label={`Heure de la visite chez ${p.doctor_name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {(TIME_OPTIONS.includes(p.time) ? TIME_OPTIONS : [...TIME_OPTIONS, p.time].sort()).map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="min-w-0 flex-1 basis-40">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <SegmentBadge segment={p.segment} />
                    <FrequencyBadge frequency={p.frequency} />
                    <span className={cn("text-ink text-sm font-medium", isRemoved && "line-through")}>{p.doctor_name}</span>
                    <span className="text-muted-foreground text-xs">
                      {p.specialty}, {p.district}
                    </span>
                  </span>
                  <span className="text-muted-foreground mt-0.5 block text-xs">
                    {leg !== null ? `À ${km(leg)} km de l'arrêt précédent. ` : ""}
                    {p.reasons.join(". ")}.
                  </span>
                  {notReceiving && !isRemoved && (
                    <span className="mt-1 flex items-center gap-1 text-xs text-amber-800">
                      <TriangleAlert className="size-3.5" /> Ce médecin ne reçoit pas ce jour-là : vérifiez avant de valider.
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-1.5">
                  <Select value={p.day} onValueChange={(v) => onUpdate(p.key, { day: v })} disabled={isRemoved}>
                    <SelectTrigger className="h-8 w-32 text-xs" aria-label={`Déplacer la visite chez ${p.doctor_name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {dayOptions.map((d) => (
                        <SelectItem key={d} value={d}>
                          {shortDay(d)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    size="sm"
                    variant={isRemoved ? "outline" : "ghost"}
                    onClick={() => onToggleRemoved(p.key)}
                    aria-label={isRemoved ? `Remettre ${p.doctor_name}` : `Retirer ${p.doctor_name}`}
                  >
                    {isRemoved ? <RotateCcw /> : <X />}
                    <span className="hidden sm:inline">{isRemoved ? "Remettre" : "Retirer"}</span>
                  </Button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
