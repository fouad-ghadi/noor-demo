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
 *  2. un panneau avec les indicateurs d'activité du mois (moyenne de visites par jour,
 *     couverture de la cible, CPA) et les comptes-rendus en attente ;
 *  3. ce qui demande une action (comptes-rendus à rédiger, visites recommandées par l'IA,
 *     médecins à revoir, alertes) ;
 *  4. l'historique (visites par semaine).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Eye, FileClock, Gauge, Repeat, Target, Users } from "lucide-react";
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
import { RecommendedVisits } from "@/components/dashboard/RecommendedVisits";
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
  // Activité du mois (à date) : couverture et CPA comparés au rythme attendu (part du mois écoulée)
  const act = d.activity;
  const coverageTone = paceTone(act.coverage_pct, expectedPct);
  const cpaTone = paceTone(act.cpa_pct, expectedPct * 0.85); // F2 : la 2e visite vient en fin de mois

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
        <KpiStrip className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Moyenne de visites par jour"
            icon={Gauge}
            value={act.avg_visits_per_day.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
            detail={`${act.calls} visites en ${act.worked_days.toLocaleString("fr-FR")} jours travaillés, ${k.cancelled_month} annulée(s) ou reportée(s)`}
          />
          <KpiCard
            label="Couverture de la cible"
            icon={Target}
            value={`${Math.round(act.coverage_pct)} %`}
            progress={{ value: act.coverage_pct, expected: expectedPct || undefined }}
            status={
              expectedPct
                ? { level: coverageTone, text: coverageTone === "good" ? "Au rythme du mois" : "En dessous du rythme du mois" }
                : undefined
            }
            detail={`${act.targeted_visited} médecins ciblés vus sur ${act.targeted}`}
          />
          <KpiCard
            label="CPA, fréquence respectée"
            icon={Repeat}
            value={`${Math.round(act.cpa_pct)} %`}
            progress={{ value: act.cpa_pct }}
            status={
              expectedPct
                ? { level: cpaTone, text: cpaTone === "good" ? "Au rythme du mois" : "Fréquences en retard" }
                : undefined
            }
            detail={`F1 vus 1 fois : ${Math.round(act.cpa_f1_pct)} %. F2 vus 2 fois : ${Math.round(act.cpa_f2_pct)} %`}
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
        </KpiStrip>

        {/* Ce qui demande une action : comptes-rendus et alertes */}
        <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
          <div className="space-y-5 lg:col-span-3">
            <PendingReports delegueId={d.delegue_id} readOnly={readOnly} />
            <RecommendedVisits delegueId={readOnly ? d.delegue_id : undefined} readOnly={readOnly} />
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
