/**
 * Planning des visites.
 * - Vue « Semaine » : calendrier (ordinateur, glisser-déposer pour déplacer) ou liste (mobile).
 * - Vue « Jour »    : tournée du jour + carte des visites.
 * La vue et la date sont dans l'URL (?vue=jour&date=2026-10-16) : le retour arrière les conserve.
 */
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addWeeks, format, isSameDay, parseISO, startOfDay, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarPlus, ChevronLeft, ChevronRight } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { Visit } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { AgendaList } from "@/components/planning/AgendaList";
import { VisitsMap } from "@/components/planning/VisitsMap";
import { LEGEND } from "@/components/planning/visitStyle";
import { WeekCalendar } from "@/components/planning/WeekCalendar";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlanVisitDialog } from "@/components/visits/PlanVisitDialog";
import { useVisitDialogs } from "@/components/visits/useVisitDialogs";
import { invalidateVisitData, useTeamUsers } from "@/hooks/queries";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatDateTime, formatLongDay, toApiDate, toApiDateTime } from "@/lib/format";

type View = "jour" | "semaine";

export function PlanningPage() {
  const { isSupervisor } = useAuth();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [planOpen, setPlanOpen] = useState(false);

  // --- État lu dans l'URL -------------------------------------------------
  const view: View = (params.get("vue") as View) ?? (isDesktop ? "semaine" : "jour");
  const anchor = params.get("date") ? parseISO(params.get("date")!) : startOfDay(new Date());
  const team = useTeamUsers();
  const delegueId = isSupervisor ? Number(params.get("delegue") ?? team.data?.[0]?.id ?? 0) || undefined : undefined;

  const update = (changes: Record<string, string>) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => next.set(k, v));
    setParams(next, { replace: true });
  };

  // --- Période affichée ---------------------------------------------------
  const weekStart = startOfWeek(anchor, { weekStartsOn: 1 });
  const rangeStart = view === "jour" ? anchor : weekStart;
  const rangeEnd = view === "jour" ? addDays(anchor, 1) : addDays(weekStart, 7);
  const days = view === "jour" ? [anchor] : Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const filters = { start: toApiDateTime(rangeStart), end: toApiDateTime(rangeEnd), delegue_id: delegueId };
  const visits = useQuery({
    queryKey: ["visits", filters],
    queryFn: () => api.visits(filters),
    enabled: !isSupervisor || !!delegueId,
  });

  usePageContext({ page: "planning", title: `Planning — ${view === "jour" ? formatLongDay(anchor) : "semaine"}`, delegueId });

  const { openVisit, dialogs } = useVisitDialogs({ readOnly: isSupervisor });

  // Glisser-déposer dans le calendrier → on déplace la visite
  const move = useMutation({
    mutationFn: ({ visit, date }: { visit: Visit; date: string }) => api.rescheduleVisit(visit.id, date),
    onSuccess: (v) => {
      invalidateVisitData(queryClient);
      toast.success("Visite déplacée", { description: `${v.doctor_name} — ${formatDateTime(v.planned_at)}` });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const goTo = (delta: number) =>
    update({ date: toApiDate(view === "jour" ? addDays(anchor, delta) : addWeeks(anchor, delta)) });

  const label =
    view === "jour"
      ? formatLongDay(anchor)
      : `Semaine du ${format(weekStart, "d MMM", { locale: fr })} au ${format(addDays(weekStart, 5), "d MMM yyyy", { locale: fr })}`;

  // Petits compteurs de la période
  const stats = useMemo(() => {
    const list = visits.data ?? [];
    return {
      planned: list.filter((v) => v.status === "planifiee" && !v.report_pending).length,
      pending: list.filter((v) => v.report_pending).length,
      done: list.filter((v) => v.status === "realisee").length,
    };
  }, [visits.data]);

  const dayVisits = (visits.data ?? []).filter((v) => isSameDay(parseISO(v.planned_at), anchor));

  return (
    <>
      <PageHeader
        title="Planning"
        description={
          visits.data
            ? `${stats.planned} planifiée(s) · ${stats.done} réalisée(s)${stats.pending ? ` · ${stats.pending} compte(s)-rendu(s) à faire` : ""}`
            : "Vos visites de la semaine"
        }
        actions={
          !isSupervisor && (
            <Button onClick={() => setPlanOpen(true)}>
              <CalendarPlus /> Planifier une visite
            </Button>
          )
        }
      />

      {/* Barre d'outils */}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-2">
          <Tabs value={view} onValueChange={(v) => update({ vue: v })}>
            <TabsList>
              <TabsTrigger value="jour">Jour</TabsTrigger>
              <TabsTrigger value="semaine">Semaine</TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={() => goTo(-1)} aria-label="Précédent">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="sm" onClick={() => update({ date: toApiDate(new Date()) })}>
              Aujourd'hui
            </Button>
            <Button variant="ghost" size="icon" onClick={() => goTo(1)} aria-label="Suivant">
              <ChevronRight />
            </Button>
          </div>
          <p className="hidden font-medium first-letter:uppercase sm:block">{label}</p>
        </div>
        <p className="font-medium first-letter:uppercase sm:hidden">{label}</p>

        <div className="flex flex-wrap items-center gap-3">
          {isSupervisor && (
            <Select value={delegueId ? String(delegueId) : ""} onValueChange={(v) => update({ delegue: v })}>
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Choisir un délégué" />
              </SelectTrigger>
              <SelectContent>
                {team.data?.map((u) => (
                  <SelectItem key={u.id} value={String(u.id)}>
                    {u.name} ({u.region})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <div className="text-muted-foreground hidden flex-wrap gap-3 text-xs xl:flex">
            {LEGEND.map((l) => (
              <span key={l.label} className="flex items-center gap-1.5">
                <span className={`size-2.5 rounded-full ${l.className}`} /> {l.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      {visits.isLoading && <LoadingState />}
      {visits.isError && <ErrorState error={visits.error} onRetry={() => visits.refetch()} />}

      {visits.data && view === "semaine" && (
        <>
          {isDesktop ? (
            <>
              <WeekCalendar
                weekStart={weekStart}
                visits={visits.data}
                readOnly={isSupervisor}
                onVisitClick={openVisit}
                onMove={(visit, date) => move.mutate({ visit, date })}
                onDayClick={(d) => update({ vue: "jour", date: toApiDate(d) })}
              />
              {!isSupervisor && (
                <p className="text-muted-foreground mt-2 text-xs">
                  Astuce : faites glisser une visite planifiée pour la déplacer. Cliquez sur un jour pour voir la tournée et la carte.
                </p>
              )}
            </>
          ) : (
            <AgendaList days={days} visits={visits.data} readOnly={isSupervisor} onVisitClick={openVisit} />
          )}
          {!isDesktop && visits.data.length === 0 && (
            <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
              Aucune visite cette semaine.
            </p>
          )}
        </>
      )}

      {visits.data && view === "jour" && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <AgendaList days={[anchor]} visits={dayVisits} readOnly={isSupervisor} onVisitClick={openVisit} numbered />
          <Card className="h-80 p-0 lg:sticky lg:top-8 lg:h-[calc(100dvh-240px)]">
            <VisitsMap visits={dayVisits} onVisitClick={openVisit} />
          </Card>
        </div>
      )}

      <PlanVisitDialog open={planOpen} onOpenChange={setPlanOpen} defaultDate={view === "jour" && anchor >= startOfDay(new Date()) ? anchor : undefined} />
      {dialogs}
    </>
  );
}
