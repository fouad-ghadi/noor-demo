/**
 * Tableau de bord d'un délégué.
 *
 * - /tableau-de-bord          → le délégué connecté
 * - /equipe/:delegueId        → le superviseur consulte un délégué (lecture seule)
 *
 * Toutes les données viennent d'UN seul appel : GET /api/stats/dashboard (calculs côté serveur).
 *
 * Mise en page :
 *  1. bandeau vert pin : bonjour, rythme du mois (visites / objectif) et tournée du jour ;
 *  2. un panneau avec les autres indicateurs (couverture A, comptes-rendus, annulations) ;
 *  3. ce qui demande une action (comptes-rendus à rédiger, médecins à revoir, alertes) ;
 *  4. l'historique (visites par semaine).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarX2, Eye, FileClock, Target, Users } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { AlertsList } from "@/components/dashboard/AlertsList";
import { DoctorsToRevisit } from "@/components/dashboard/DoctorsToRevisit";
import { DayRoute } from "@/components/dashboard/DayRoute";
import { HeroBand, HeroPace } from "@/components/dashboard/HeroBand";
import { KpiCard, KpiStatusLine, KpiStrip, type KpiStatus } from "@/components/dashboard/KpiCard";
import { paceTone, ProgressWithMarker } from "@/components/dashboard/ProgressWithMarker";
import { PendingReports } from "@/components/dashboard/PendingReports";
import { TopObjections } from "@/components/dashboard/TopObjections";
import { VisitsPerWeekChart } from "@/components/dashboard/VisitsPerWeekChart";
import { ErrorState, LoadingState } from "@/components/shared/states";
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
        ? k.visits_done > k.visits_expected_to_date
          ? `En avance de ${k.visits_done - k.visits_expected_to_date} visite(s) sur le rythme`
          : "Dans les temps"
        : `${k.visits_expected_to_date - k.visits_done} visite(s) de retard`,
  };
  const coverageGap = k.coverage_a - k.coverage_a_target;
  const coverageStatus: { level: KpiStatus; text: string } =
    coverageGap >= 0
      ? { level: "good", text: "Objectif atteint" }
      : { level: coverageGap > -15 ? "warning" : "critical", text: `${Math.round(-coverageGap)} pts sous l'objectif` };

  const caption = o ? `Objectif de visites, ${o.label}` : "Visites du mois";

  return (
    <>
      {readOnly && (
        <Link to="/equipe" className="text-muted-foreground hover:text-foreground mb-3 inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" /> Vue équipe
        </Link>
      )}

      <div className="flex flex-col gap-5 lg:gap-6">
        {/* Bandeau : qui, quel jour, le rythme du mois et la tournée du jour */}
        <HeroBand
          title={
            readOnly ? (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {d.delegue_name}
                <span className="inline-flex items-center gap-1 rounded-full border border-white/25 px-2.5 py-0.5 font-sans text-xs font-normal tracking-normal text-white/80">
                  <Eye className="size-3" /> Lecture seule
                </span>
              </span>
            ) : (
              `Bonjour ${firstName}`
            )
          }
          subtitle={
            <>
              <span className="first-letter:uppercase inline-block">{formatLongDay(d.today)}</span>, {d.region}
            </>
          }
          summary={
            k.visits_target ? (
              <HeroPace
                caption={caption}
                done={k.visits_done}
                target={k.visits_target}
                unit="visites"
                progress={<ProgressWithMarker onDark value={visitsPct} expected={expectedPct} tone={visitsTone} />}
                status={<KpiStatusLine onDark status={visitsStatus} />}
                detail={`${k.visits_planned_remaining} encore planifiée(s) d'ici la fin du mois. Le trait blanc indique le rythme attendu.`}
              />
            ) : undefined
          }
          aside={<DayRoute visits={d.today_visits} readOnly={readOnly} onVisitClick={openVisit} onPlan={() => setPlanOpen(true)} />}
        />

        {/* Les autres indicateurs du mois, dans un seul panneau */}
        <KpiStrip className="grid-cols-1 sm:grid-cols-3">
          <KpiCard
            label="Couverture des médecins A"
            icon={Target}
            value={`${Math.round(k.coverage_a)} %`}
            suffix={k.coverage_a_target ? `objectif ${k.coverage_a_target} %` : undefined}
            progress={{ value: k.coverage_a }}
            status={k.coverage_a_target ? coverageStatus : undefined}
            detail={o ? `${o.a_doctors_visited} médecins A vus sur ${o.a_doctors_total} ce mois` : undefined}
          />
          <KpiCard
            label="Comptes-rendus en attente"
            icon={FileClock}
            value={k.pending_reports}
            status={
              k.pending_reports === 0
                ? { level: "good", text: "À jour" }
                : k.late_reports > 0
                  ? { level: "critical", text: `${k.late_reports} en retard (plus de 48 h)` }
                  : { level: "warning", text: "À rédiger rapidement" }
            }
            onClick={k.pending_reports ? () => document.getElementById("comptes-rendus")?.scrollIntoView({ behavior: "smooth" }) : undefined}
          />
          <KpiCard
            label="Visites annulées ou reportées"
            icon={CalendarX2}
            value={k.cancelled_month}
            detail={
              k.visits_done + k.cancelled_month
                ? `${Math.round((100 * k.cancelled_month) / (k.visits_done + k.cancelled_month))} % des visites du mois`
                : "Ce mois-ci"
            }
          />
        </KpiStrip>

        {/* Ce qui demande une action : comptes-rendus et alertes */}
        <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
          <div className="space-y-5 lg:col-span-3">
            <PendingReports delegueId={d.delegue_id} readOnly={readOnly} />
            <DoctorsToRevisit rows={d.doctors_to_revisit} total={d.doctors_to_revisit_total} readOnly={readOnly} />
          </div>
          <div className="space-y-5 lg:col-span-2">
            <AlertsList alerts={d.alerts} readOnly={readOnly} />
            <TopObjections items={d.top_objections} />
          </div>
        </div>

        <VisitsPerWeekChart data={d.visits_per_week} />
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
