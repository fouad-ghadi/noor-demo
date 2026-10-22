/**
 * Statistiques d'activité terrain (comme les rapports mensuels des laboratoires) :
 * moyenne de visites par jour, couverture de la cible, CPA (fréquence respectée),
 * jours travaillés et événements hors terrain.
 *
 * - Délégué : ses propres indicateurs.
 * - Superviseur : toute l'équipe (ligne par délégué + ligne « Équipe »), ou un délégué choisi.
 *
 * Tout est calculé côté serveur : GET /api/activity (voir backend/app/services/activity_service.py).
 */
import { useQuery } from "@tanstack/react-query";
import { CalendarRange, Gauge, Repeat, Target } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "@/api/client";
import type { Activity, ActivityRow } from "@/api/types";
import { useCurrentUser } from "@/auth/AuthContext";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { ChartTooltip } from "@/components/dashboard/ChartTooltip";
import { KpiCard, KpiStrip } from "@/components/dashboard/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTeamUsers } from "@/hooks/queries";
import { AXIS_COLOR, COVERAGE_COLOR, CPA_COLOR, GRID_COLOR } from "@/lib/chartColors";
import { capitalize, formatDate, formatPeriod as monthLabel } from "@/lib/format";
import { EVENT_TYPE } from "@/lib/labels";
import { cn } from "@/lib/utils";

const ALL = "equipe";

/** « 9.5 » → « 9,5 » ; les jours peuvent être des demi-journées. */
const num = (n: number, digits = 1) => n.toLocaleString("fr-FR", { maximumFractionDigits: digits });
const pct = (n: number) => `${Math.round(n)} %`;

export function ActivityPage() {
  const user = useCurrentUser();
  const isSupervisor = user.role === "superviseur";
  const [params, setParams] = useSearchParams();
  const period = params.get("mois") ?? undefined;
  const delegue = params.get("delegue");
  const delegueId = delegue && delegue !== ALL ? Number(delegue) : undefined;
  const team = useTeamUsers();

  usePageContext({ page: "stats", title: "Statistiques d'activité", delegueId });
  const activity = useQuery({
    queryKey: ["activity", period ?? "current", delegueId ?? "all"],
    queryFn: () => api.activity(period, delegueId),
  });
  const a = activity.data;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title="Statistiques d'activité"
        description={
          a
            ? a.is_current
              ? `${capitalize(a.period_label)}, à date du ${formatDate(a.through)}`
              : capitalize(a.period_label)
            : "Couverture, moyenne de visites et fréquence respectée"
        }
        actions={
          <>
            <Select value={a?.period ?? ""} onValueChange={(v) => setParam("mois", v)}>
              <SelectTrigger className="w-44" aria-label="Mois">
                <SelectValue placeholder="Mois" />
              </SelectTrigger>
              <SelectContent>
                {a?.periods.map((p) => (
                  <SelectItem key={p} value={p}>
                    {monthLabel(p)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSupervisor && (
              <Select value={delegue ?? ALL} onValueChange={(v) => setParam("delegue", v)}>
                <SelectTrigger className="w-60" aria-label="Délégué">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Toute l'équipe</SelectItem>
                  {team.data?.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name} ({u.region})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        }
      />

      {activity.isLoading && <LoadingState rows={4} />}
      {activity.isError && <ErrorState error={activity.error} onRetry={() => activity.refetch()} />}
      {a && <ActivityContent a={a} showTeam={isSupervisor} />}
    </>
  );
}

function ActivityContent({ a, showTeam }: { a: Activity; showTeam: boolean }) {
  const scope = a.total ?? a.rows[0];
  if (!scope) return null;
  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <KpiStrip className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Moyenne de visites par jour"
          icon={Gauge}
          value={num(scope.avg_visits_per_day, 2)}
          detail={`${scope.calls} visites réalisées en ${num(scope.worked_days)} jours travaillés`}
        />
        <KpiCard
          label="Couverture de la cible"
          icon={Target}
          value={pct(scope.coverage_pct)}
          progress={{ value: scope.coverage_pct }}
          detail={`${scope.targeted_visited} médecins ciblés vus sur ${scope.targeted}`}
        />
        <KpiCard
          label="CPA, fréquence respectée"
          icon={Repeat}
          value={pct(scope.cpa_pct)}
          progress={{ value: scope.cpa_pct }}
          detail={`F1 : ${pct(scope.cpa_f1_pct)} (${scope.f1_ok} sur ${scope.targeted_f1}). F2 : ${pct(scope.cpa_f2_pct)} (${scope.f2_ok} sur ${scope.targeted_f2})`}
        />
        <KpiCard
          label="Jours travaillés"
          icon={CalendarRange}
          value={num(scope.worked_days)}
          suffix={`sur ${num(scope.period_days)}`}
          detail={
            scope.event_days
              ? `${num(scope.event_days)} jour(s) d'événements hors terrain`
              : "Aucun événement hors terrain"
          }
        />
      </KpiStrip>

      <Card>
        <CardHeader>
          <CardTitle>Couverture et moyenne de visites par jour</CardTitle>
          <CardDescription>
            Un médecin F1 doit être vu une fois par mois, un médecin F2 deux fois.
            {a.is_current && " Le mois n'est pas terminé : les pourcentages augmentent jusqu'à la fin du mois."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ActivityTable rows={a.rows} total={a.total} showName={showTeam} />
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
        <DaysBreakdown a={a} className="lg:col-span-2" />
        <TrendChart a={a} className="lg:col-span-3" />
      </div>

      <Definitions />
    </div>
  );
}

function ActivityTable({ rows, total, showName }: { rows: ActivityRow[]; total: ActivityRow | null; showName: boolean }) {
  const all = total ? [...rows, total] : rows;
  return (
    <Table className="min-w-[860px]">
      <TableHeader>
        <TableRow>
          <TableHead>{showName ? "Délégué (VM)" : "Région"}</TableHead>
          <TableHead className="text-right">Jours travaillés</TableHead>
          <TableHead className="text-right">Événements</TableHead>
          <TableHead className="text-right">Ciblage</TableHead>
          <TableHead className="text-right">Visites</TableHead>
          <TableHead className="text-right">Contacts</TableHead>
          <TableHead className="text-right">Couverture</TableHead>
          <TableHead className="text-right">Moyenne</TableHead>
          <TableHead className="text-right">CPA</TableHead>
          <TableHead className="text-right">CPA F1</TableHead>
          <TableHead className="text-right">CPA F2</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {all.map((r) => {
          const isTotal = r.delegue_id === null;
          return (
            <TableRow key={r.delegue_id ?? "total"} className={cn(isTotal && "bg-mint-wash/60 font-semibold")}>
              <TableCell>
                <p className="font-medium">{showName ? r.name : r.region}</p>
                {showName && !isTotal && <p className="text-muted-foreground text-xs">{r.region}</p>}
              </TableCell>
              <TableCell className="tabular text-right">
                {num(r.worked_days)} <span className="text-muted-foreground text-xs">/ {num(r.period_days)}</span>
              </TableCell>
              <TableCell className="tabular text-right">{num(r.event_days)}</TableCell>
              <TableCell className="tabular text-right">{r.targeted}</TableCell>
              <TableCell className="tabular text-right">{r.calls}</TableCell>
              <TableCell className="tabular text-right">{r.contacts}</TableCell>
              <TableCell className="tabular text-right">{pct(r.coverage_pct)}</TableCell>
              <TableCell className="tabular text-right">{num(r.avg_visits_per_day, 2)}</TableCell>
              <TableCell className="tabular text-right">{pct(r.cpa_pct)}</TableCell>
              <TableCell className="tabular text-right">{pct(r.cpa_f1_pct)}</TableCell>
              <TableCell className="tabular text-right">{pct(r.cpa_f2_pct)}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** Répartition des jours de la période : terrain d'abord, puis chaque type d'événement. */
function DaysBreakdown({ a, className }: { a: Activity; className?: string }) {
  const total = a.breakdown.reduce((s, b) => s + b.days, 0);
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Répartition des jours</CardTitle>
        <CardDescription>
          {total ? `${pct((100 * (a.breakdown[0]?.days ?? 0)) / total)} du temps sur le terrain` : "Aucun jour sur la période"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {a.breakdown.map((b) => {
          const share = total ? (100 * b.days) / total : 0;
          return (
            <div key={b.key} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className={cn(b.key === "terrain" && "font-medium")}>
                  {b.key === "terrain" ? "Activités terrain" : EVENT_TYPE[b.key]}
                </span>
                <span className="tabular text-muted-foreground">
                  <span className="text-ink font-semibold">{num(b.days)} j</span>, {pct(share)}
                </span>
              </div>
              <div className="bg-mint-wash h-2 overflow-hidden rounded-full">
                <div
                  className={cn("h-full rounded-full", b.key === "terrain" ? "bg-pine" : "bg-slate-400")}
                  style={{ width: `${share}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TrendChart({ a, className }: { a: Activity; className?: string }) {
  const rows = a.trend.map((t) => ({ ...t, short: monthLabel(t.period, true) }));
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Évolution sur 6 mois</CardTitle>
        <CardDescription>
          Couverture et CPA, en %. Les mois de congé d'été font baisser les deux indicateurs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground mb-3 flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: COVERAGE_COLOR }} /> Couverture
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: CPA_COLOR }} /> CPA
          </span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis dataKey="short" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
              <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
              <Tooltip
                content={
                  <ChartTooltip
                    labelFormatter={(l) => String(rows.find((r) => r.short === l)?.label ?? l)}
                    valueFormatter={(v) => pct(v)}
                  />
                }
              />
              <Line dataKey="coverage_pct" name="Couverture" stroke={COVERAGE_COLOR} strokeWidth={2} dot={{ r: 3 }} />
              <Line dataKey="cpa_pct" name="CPA" stroke={CPA_COLOR} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="text-muted-foreground mt-3 text-xs">
          Moyenne de visites par jour :{" "}
          {a.trend.map((t, i) => (
            <span key={t.period}>
              {i > 0 && ", "}
              {monthLabel(t.period, true)} {num(t.avg_visits_per_day)}
            </span>
          ))}
        </p>
      </CardContent>
    </Card>
  );
}

/** Définitions des indicateurs (comme les infobulles du CRM du laboratoire), lisibles aussi sur mobile. */
function Definitions() {
  const items = [
    ["Jours travaillés", "Jours ouvrés de la période (le samedi matin compte pour ½ jour) moins les jours d'événements : réunion, formation, congrès, congé, jour férié."],
    ["Ciblage", "Médecins ciblés, avec leur fréquence : F1 = une visite par mois, F2 = deux visites par mois."],
    ["Visites et contacts", "Visites réalisées sur la période, et nombre de médecins différents visités."],
    ["Moyenne de visites", "Visites réalisées ÷ jours travaillés. Exemple : 255 visites en 20 jours = 12,75 par jour."],
    ["Couverture", "Médecins ciblés visités au moins une fois ÷ médecins ciblés. Exemple : 205 vus sur 220 = 93 %."],
    ["CPA (Call Plan Adherence)", "Médecins vus à la bonne fréquence ÷ médecins ciblés : F1 vus au moins 1 fois, F2 vus au moins 2 fois."],
  ];
  return (
    <details className="border-line rounded-xl border bg-white px-4 py-3 text-sm lg:px-5">
      <summary className="text-ink cursor-pointer font-medium">Comment sont calculés ces indicateurs ?</summary>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {items.map(([term, def]) => (
          <div key={term}>
            <dt className="font-medium">{term}</dt>
            <dd className="text-muted-foreground">{def}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
