/**
 * Tableau de bord d'un délégué.
 *
 * - /tableau-de-bord          → le délégué connecté
 * - /equipe/:delegueId        → le superviseur consulte un délégué (lecture seule)
 *
 * Toutes les données viennent d'UN seul appel : GET /api/stats/dashboard (calculs côté serveur).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2, CalendarX2, Eye, FileClock, Target, Users } from "lucide-react";
import { useParams } from "react-router-dom";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { AlertsList } from "@/components/dashboard/AlertsList";
import { DoctorsToRevisit } from "@/components/dashboard/DoctorsToRevisit";
import { KpiCard, type KpiStatus } from "@/components/dashboard/KpiCard";
import { paceTone } from "@/components/dashboard/ProgressWithMarker";
import { PendingReports } from "@/components/dashboard/PendingReports";
import { TodayAgenda } from "@/components/dashboard/TodayAgenda";
import { TopObjections } from "@/components/dashboard/TopObjections";
import { VisitsPerWeekChart } from "@/components/dashboard/VisitsPerWeekChart";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { PlanVisitDialog } from "@/components/visits/PlanVisitDialog";
import { useVisitDialogs } from "@/components/visits/useVisitDialogs";
import { formatLongDay } from "@/lib/format";

export function DashboardPage() {
  const params = useParams();
  const { user } = useAuth();
  const delegueId = params.delegueId ? Number(params.delegueId) : undefined;
  const readOnly = delegueId !== undefined && delegueId !== user?.id; // superviseur qui consulte

  const dashboard = useQuery({
    queryKey: ["dashboard", delegueId ?? "me"],
    queryFn: () => api.dashboard(delegueId),
  });
  const d = dashboard.data;
  usePageContext({
    page: "dashboard",
    title: d ? `Tableau de bord — ${d.delegue_name}` : "Tableau de bord",
    delegueId: d?.delegue_id,
  });

  const { openVisit, dialogs } = useVisitDialogs({ readOnly });
  const [planOpen, setPlanOpen] = useState(false);

  if (dashboard.isLoading) return <LoadingState rows={5} />;
  if (dashboard.isError || !d) return <ErrorState error={dashboard.error} onRetry={() => dashboard.refetch()} />;

  const k = d.kpis;
  const o = d.objective;
  const firstName = d.delegue_name.split(" ")[0];

  // --- Statuts des KPIs (icône + texte : jamais la couleur seule) ---------
  const visitsPct = k.visits_target ? (100 * k.visits_done) / k.visits_target : 0;
  const expectedPct = o?.expected_pct ?? 0;
  const visitsTone = paceTone(visitsPct, expectedPct);
  const visitsStatus: { level: KpiStatus; text: string } = {
    level: visitsTone,
    text:
      visitsTone === "good"
        ? k.visits_done >= k.visits_expected_to_date
          ? `En avance (+${k.visits_done - k.visits_expected_to_date} vs attendu)`
          : "Dans les temps"
        : `${k.visits_expected_to_date - k.visits_done} visite(s) de retard`,
  };
  const coverageGap = k.coverage_a - k.coverage_a_target;
  const coverageStatus: { level: KpiStatus; text: string } =
    coverageGap >= 0
      ? { level: "good", text: "Objectif atteint" }
      : { level: coverageGap > -15 ? "warning" : "critical", text: `${Math.round(-coverageGap)} pts sous l'objectif` };

  return (
    <>
      <PageHeader
        backTo={readOnly ? "/equipe" : undefined}
        backLabel="Vue équipe"
        title={
          readOnly ? (
            <span className="flex flex-wrap items-center gap-2">
              Tableau de bord de {d.delegue_name}
              <Badge variant="outline" className="gap-1 font-normal">
                <Eye className="size-3" /> Lecture seule
              </Badge>
            </span>
          ) : (
            `Bonjour ${firstName} 👋`
          )
        }
        description={
          <span className="first-letter:uppercase">
            {formatLongDay(d.today)} · {d.region}
            {o && ` · Objectifs de ${o.label}`}
          </span>
        }
      />

      <div className="flex flex-col gap-5">
        {/* KPIs : en 2e position sur mobile (l'agenda d'abord), en 1re sur ordinateur */}
        <div className="order-2 grid grid-cols-2 gap-3 lg:order-1 lg:grid-cols-4 lg:gap-4">
          <KpiCard
            label="Visites du mois"
            icon={CalendarCheck2}
            value={k.visits_done}
            suffix={k.visits_target ? `/ ${k.visits_target}` : undefined}
            progress={k.visits_target ? { value: visitsPct, expected: expectedPct } : undefined}
            status={k.visits_target ? visitsStatus : undefined}
            detail={`${k.visits_planned_remaining} encore planifiée(s) ce mois`}
          />
          <KpiCard
            label="Couverture médecins A"
            icon={Target}
            value={`${Math.round(k.coverage_a)} %`}
            suffix={k.coverage_a_target ? `obj. ${k.coverage_a_target} %` : undefined}
            progress={{ value: k.coverage_a }}
            status={k.coverage_a_target ? coverageStatus : undefined}
            detail={o ? `${o.a_doctors_visited} / ${o.a_doctors_total} médecins A vus ce mois` : undefined}
          />
          <KpiCard
            label="Comptes-rendus en attente"
            icon={FileClock}
            value={k.pending_reports}
            status={
              k.pending_reports === 0
                ? { level: "good", text: "À jour" }
                : k.late_reports > 0
                  ? { level: "critical", text: `${k.late_reports} en retard (> 48 h)` }
                  : { level: "warning", text: "À rédiger rapidement" }
            }
            onClick={k.pending_reports ? () => document.getElementById("comptes-rendus")?.scrollIntoView({ behavior: "smooth" }) : undefined}
          />
          <KpiCard
            label="Visites annulées / reportées"
            icon={CalendarX2}
            value={k.cancelled_month}
            detail={
              k.visits_done + k.cancelled_month
                ? `${Math.round((100 * k.cancelled_month) / (k.visits_done + k.cancelled_month))} % des visites du mois`
                : "Ce mois-ci"
            }
          />
        </div>

        {/* Agenda + comptes-rendus + alertes */}
        <div className="order-1 grid gap-5 lg:order-2 lg:grid-cols-5">
          <div className="space-y-5 lg:col-span-3">
            <TodayAgenda visits={d.today_visits} readOnly={readOnly} onVisitClick={openVisit} onPlan={() => setPlanOpen(true)} />
            <PendingReports delegueId={d.delegue_id} readOnly={readOnly} />
          </div>
          <div className="lg:col-span-2">
            <AlertsList alerts={d.alerts} readOnly={readOnly} />
          </div>
        </div>

        <div className="order-3 grid gap-5 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <DoctorsToRevisit rows={d.doctors_to_revisit} total={d.doctors_to_revisit_total} readOnly={readOnly} />
          </div>
          <div className="lg:col-span-2">
            <TopObjections items={d.top_objections} />
          </div>
        </div>

        <div className="order-4">
          <VisitsPerWeekChart data={d.visits_per_week} />
        </div>
      </div>

      {readOnly && (
        <p className="text-muted-foreground mt-6 flex items-center gap-1.5 text-xs">
          <Users className="size-3.5" /> Vue superviseur : les actions (planifier, rédiger) sont réservées au délégué.
        </p>
      )}
      <PlanVisitDialog open={planOpen} onOpenChange={setPlanOpen} />
      {dialogs}
    </>
  );
}
