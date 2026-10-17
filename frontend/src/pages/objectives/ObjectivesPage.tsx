/**
 * Objectifs : avancement du mois en cours (visites, couverture A, produits)
 * et historique des mois précédents.
 * Superviseur : choix du délégué.
 */
import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2, Package, Target } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "@/api/client";
import type { ObjectiveProgress } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { ChartTooltip } from "@/components/dashboard/ChartTooltip";
import { paceTone, ProgressWithMarker } from "@/components/dashboard/ProgressWithMarker";
import { ProgressStatusBadge } from "@/components/shared/badges";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTeamUsers } from "@/hooks/queries";
import { AXIS_COLOR, DONE_COLOR, GRID_COLOR } from "@/lib/chartColors";
import { cn } from "@/lib/utils";

export function ObjectivesPage() {
  const { isSupervisor } = useAuth();
  const team = useTeamUsers();
  const [params, setParams] = useSearchParams();
  const delegueId = isSupervisor ? Number(params.get("delegue") ?? team.data?.[0]?.id ?? 0) || undefined : undefined;

  const objectives = useQuery({
    queryKey: ["objectives", delegueId ?? "me"],
    queryFn: () => api.objectives(delegueId),
    enabled: !isSupervisor || !!delegueId,
  });
  usePageContext({ page: "objectives", title: "Objectifs", delegueId });

  const list = objectives.data ?? [];
  const current = list.find((o) => o.is_current);
  const history = list.filter((o) => !o.is_current);

  return (
    <>
      <PageHeader
        title="Objectifs"
        description={current ? <span className="first-letter:uppercase">Mois en cours : {current.label}</span> : "Suivi mensuel"}
        actions={
          isSupervisor && (
            <Select value={delegueId ? String(delegueId) : ""} onValueChange={(v) => setParams({ delegue: v }, { replace: true })}>
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
          )
        }
      />

      {objectives.isLoading && <LoadingState />}
      {objectives.isError && <ErrorState error={objectives.error} onRetry={() => objectives.refetch()} />}
      {objectives.data && !current && <EmptyState title="Aucun objectif défini pour ce mois" />}

      {current && <CurrentMonth o={current} />}
      {history.length > 0 && <History all={list} history={history} />}
    </>
  );
}

function ObjectiveRow({ label, done, target, pct, expected, unit = "" }: {
  label: string;
  done: number;
  target: number;
  pct: number;
  expected?: number;
  unit?: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular">
          <span className="font-semibold">
            {done}
            {unit}
          </span>
          <span className="text-muted-foreground">
            {" "}
            / {target}
            {unit} · {Math.round(pct)} %
          </span>
        </span>
      </div>
      <ProgressWithMarker value={pct} expected={expected} tone={expected !== undefined ? paceTone(pct, expected) : "neutral"} />
    </div>
  );
}

function CurrentMonth({ o }: { o: ObjectiveProgress }) {
  const coveragePctOfTarget = o.target_coverage_a ? (100 * o.coverage_a) / o.target_coverage_a : 0;
  return (
    <div className="mb-5 grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2 text-base">
            <span className="flex items-center gap-2">
              <CalendarCheck2 className="size-4 text-teal-700" /> Visites et couverture
            </span>
            <ProgressStatusBadge status={o.status} />
          </CardTitle>
          <CardDescription>
            Le trait noir indique où vous devriez être aujourd'hui ({Math.round(o.expected_pct)} % du mois ouvré écoulé).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-end gap-2">
            <p className="tabular text-4xl font-semibold tracking-tight">{o.done_visits}</p>
            <p className="text-muted-foreground pb-1">/ {o.target_visits} visites réalisées</p>
          </div>
          <ObjectiveRow
            label="Visites réalisées"
            done={o.done_visits}
            target={o.target_visits}
            pct={o.visits_pct}
            expected={o.expected_pct}
          />
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="flex items-center gap-1.5 font-medium">
                <Target className="size-4 text-teal-700" /> Couverture des médecins A
              </span>
              <span className="tabular">
                <span className="font-semibold">{Math.round(o.coverage_a)} %</span>
                <span className="text-muted-foreground"> / objectif {o.target_coverage_a} %</span>
              </span>
            </div>
            <ProgressWithMarker value={o.coverage_a} tone={coveragePctOfTarget >= 100 ? "good" : coveragePctOfTarget >= 85 ? "warning" : "critical"} />
            <p className="text-muted-foreground text-xs">
              {o.a_doctors_visited} médecins A visités sur {o.a_doctors_total} ce mois-ci
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="size-4 text-teal-700" /> Objectifs par produit
          </CardTitle>
          <CardDescription>Nombre de présentations du produit pendant le mois</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {o.products.length === 0 && <p className="text-muted-foreground text-sm">Pas d'objectif produit ce mois.</p>}
          {o.products.map((p) => (
            <ObjectiveRow
              key={p.product_id}
              label={p.brand_name}
              done={p.done}
              target={p.target}
              pct={p.pct}
              expected={o.expected_pct}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function History({ all, history }: { all: ObjectiveProgress[]; history: ObjectiveProgress[] }) {
  // Du plus ancien au plus récent pour le graphique
  const rows = [...all].reverse().map((o) => ({
    label: o.label.split(" ")[0].slice(0, 4) + ".",
    full: o.label,
    done: o.done_visits,
    target: o.target_visits,
  }));
  return (
    <div className="grid gap-5 lg:grid-cols-5">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="text-base">Historique des visites</CardTitle>
          <CardDescription>Visites réalisées par mois et objectif fixé (le mois en cours n'est pas terminé)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-muted-foreground mb-3 flex gap-4 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: DONE_COLOR }} /> Réalisées
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full bg-slate-700" /> Objectif
            </span>
          </div>
          <div className="h-60">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={GRID_COLOR} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
                <Tooltip
                  cursor={{ fill: "rgba(15,118,110,0.06)" }}
                  content={<ChartTooltip labelFormatter={(l) => String(rows.find((r) => r.label === l)?.full ?? l)} />}
                />
                <Bar dataKey="done" name="Réalisées" fill={DONE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Line dataKey="target" name="Objectif" type="step" stroke="#334155" strokeWidth={2} strokeDasharray="5 4" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="py-0 lg:col-span-2">
        <CardHeader className="pt-5">
          <CardTitle className="text-base">Mois précédents</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mois</TableHead>
              <TableHead className="text-right">Visites</TableHead>
              <TableHead className="text-right">Couv. A</TableHead>
              <TableHead>Statut</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {history.map((o) => (
              <TableRow key={o.period}>
                <TableCell className="first-letter:uppercase">{o.label}</TableCell>
                <TableCell className="tabular text-right">
                  {o.done_visits}/{o.target_visits}{" "}
                  <span className={cn("text-xs", o.visits_pct >= 100 ? "text-emerald-700" : "text-muted-foreground")}>
                    ({Math.round(o.visits_pct)} %)
                  </span>
                </TableCell>
                <TableCell className={cn("tabular text-right", o.coverage_a < o.target_coverage_a && "text-rose-700")}>
                  {Math.round(o.coverage_a)} %
                </TableCell>
                <TableCell>
                  <ProgressStatusBadge status={o.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
