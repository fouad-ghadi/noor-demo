/**
 * Vue équipe (superviseur) : comparaison des délégués sur le mois en cours,
 * évolution sur 6 mois et couverture par région / segment.
 * Clic sur un délégué → son tableau de bord en lecture seule.
 */
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarX2, ChevronRight, FileClock, Target, type LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "@/api/client";
import type { Team, TeamMember } from "@/api/types";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { ChartTooltip } from "@/components/dashboard/ChartTooltip";
import { HeroBand, HeroPace } from "@/components/dashboard/HeroBand";
import { KpiStatusLine } from "@/components/dashboard/KpiCard";
import { paceTone, ProgressWithMarker } from "@/components/dashboard/ProgressWithMarker";
import { TopObjections } from "@/components/dashboard/TopObjections";
import { ProgressStatusBadge } from "@/components/shared/badges";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AXIS_COLOR, delegateColor, GRID_COLOR, SEGMENT_COLORS } from "@/lib/chartColors";
import { cn } from "@/lib/utils";

export function TeamPage() {
  usePageContext({ page: "team", title: "Vue équipe" });
  const navigate = useNavigate();
  const team = useQuery({ queryKey: ["team-stats"], queryFn: api.teamStats });

  if (team.isLoading) return <LoadingState rows={5} />;
  if (team.isError || !team.data) return <ErrorState error={team.error} onRetry={() => team.refetch()} />;

  const t = team.data;
  const ids = t.members.map((m) => m.delegue_id);
  const colorOf = (id: number) => delegateColor(id, ids);
  // Tri par taux d'atteinte (meilleur en premier) pour le tableau
  const members = [...t.members].sort((a, b) => b.achievement_pct - a.achievement_pct);
  const totalTone = paceTone(t.totals.achievement_pct, t.totals.expected_pct);

  return (
    <>
      {/* Bandeau : rythme de l'équipe sur le mois + les autres totaux */}
      <HeroBand
        className="mb-5 lg:mb-6"
        title="Vue équipe"
        subtitle={
          <>
            <span className="first-letter:uppercase inline-block">{t.period_label}</span>, {t.members.length} délégués,{" "}
            {t.totals.doctors} médecins suivis
          </>
        }
        summary={
          <HeroPace
            caption="Visites de l'équipe ce mois"
            done={t.totals.visits_done}
            target={t.totals.visits_target}
            unit="visites"
            progress={<ProgressWithMarker onDark value={t.totals.achievement_pct} expected={t.totals.expected_pct} tone={totalTone} />}
            status={
              <KpiStatusLine
                onDark
                status={{
                  level: totalTone,
                  text: `${Math.round(t.totals.achievement_pct)} % réalisé, ${Math.round(t.totals.expected_pct)} % attendu à date`,
                }}
              />
            }
          />
        }
        aside={
          <dl className="divide-y divide-white/10">
            <HeroStat icon={Target} label="Couverture moyenne des médecins A" value={`${Math.round(t.totals.coverage_a)} %`} detail="Vus au moins une fois ce mois" />
            <HeroStat
              icon={FileClock}
              label="Comptes-rendus en retard"
              value={t.totals.late_reports}
              detail={
                <KpiStatusLine
                  onDark
                  status={t.totals.late_reports ? { level: "critical", text: `À relancer, ${t.totals.pending_reports} en attente au total` } : { level: "good", text: "À jour" }}
                />
              }
            />
            <HeroStat icon={CalendarX2} label="Visites annulées ou reportées" value={t.totals.cancelled} detail="Ce mois-ci, toute l'équipe" />
          </dl>
        }
      />

      {/* Tableau comparatif */}
      <Card className="mb-5 py-0">
        <CardHeader className="pt-5">
          <CardTitle className="text-base">Comparaison des délégués</CardTitle>
          <CardDescription>Cliquez sur un délégué pour ouvrir son tableau de bord. Le trait noir indique l'objectif attendu à date.</CardDescription>
        </CardHeader>
        {/* Ordinateur */}
        <div className="hidden lg:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Délégué</TableHead>
                <TableHead className="text-right">Médecins</TableHead>
                <TableHead className="w-64">Visites / objectif</TableHead>
                <TableHead className="text-right">Couverture A</TableHead>
                <TableHead className="text-right">Annulations</TableHead>
                <TableHead className="text-right">CR en retard</TableHead>
                <TableHead>Statut</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={m.delegue_id} className="cursor-pointer" onClick={() => navigate(`/equipe/${m.delegue_id}`)}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span className="size-2.5 rounded-full" style={{ background: colorOf(m.delegue_id) }} />
                      <UserAvatar name={m.name} className="size-8 text-xs" />
                      <div>
                        <p className="font-medium">{m.name}</p>
                        <p className="text-muted-foreground text-xs">{m.region}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="tabular text-right">{m.doctors_count}</TableCell>
                  <TableCell>
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="tabular font-medium">
                          {m.visits_done} / {m.visits_target}
                        </span>
                        <span className="tabular text-muted-foreground">{Math.round(m.achievement_pct)} %</span>
                      </div>
                      <ProgressWithMarker value={m.achievement_pct} expected={m.expected_pct} tone={paceTone(m.achievement_pct, m.expected_pct)} />
                    </div>
                  </TableCell>
                  <TableCell className={cn("tabular text-right", m.coverage_a < m.coverage_a_target && "font-medium text-rose-700")}>
                    {Math.round(m.coverage_a)} %
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {m.cancelled} <span className="text-muted-foreground text-xs">({Math.round(m.cancel_rate)} %)</span>
                  </TableCell>
                  <TableCell className={cn("tabular text-right", m.late_reports > 0 && "font-medium text-rose-700")}>
                    {m.late_reports}
                  </TableCell>
                  <TableCell>
                    <ProgressStatusBadge status={m.status} />
                  </TableCell>
                  <TableCell>
                    <ChevronRight className="text-muted-foreground size-4" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        {/* Mobile */}
        <div className="space-y-2 px-4 pb-4 lg:hidden">
          {members.map((m) => (
            <MemberCard key={m.delegue_id} m={m} color={colorOf(m.delegue_id)} onClick={() => navigate(`/equipe/${m.delegue_id}`)} />
          ))}
        </div>
      </Card>

      <div className="mb-5 grid gap-5 lg:grid-cols-2">
        <AchievementChart team={t} colorOf={colorOf} />
        <TrendChart team={t} colorOf={colorOf} />
      </div>
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <RegionCoverageChart team={t} />
        </div>
        <div className="lg:col-span-2">
          <TopObjections items={t.top_objections} description="Toute l'équipe · 3 derniers mois" />
        </div>
      </div>
    </>
  );
}

/** Un total de l'équipe dans le bandeau (libellé, valeur, détail). */
function HeroStat({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: ReactNode; detail: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 py-3.5 first:pt-0 last:pb-0">
      <dt className="flex items-center gap-2 text-sm text-[#CFEDE7]">
        <Icon className="size-4 shrink-0" /> {label}
      </dt>
      <dd className="font-display tabular row-span-2 text-3xl font-semibold tracking-tight">{value}</dd>
      <dd className="mt-0.5 text-[13px] text-white/60">{detail}</dd>
    </div>
  );
}

function MemberCard({ m, color, onClick }: { m: TeamMember; color: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full cursor-pointer rounded-xl border bg-white p-3 text-left">
      <div className="flex items-center gap-3">
        <span className="size-2.5 rounded-full" style={{ background: color }} />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{m.name}</p>
          <p className="text-muted-foreground text-xs">{m.region}</p>
        </div>
        <ProgressStatusBadge status={m.status} />
      </div>
      <div className="mt-3 space-y-1.5">
        <div className="flex justify-between text-xs">
          <span className="tabular">
            {m.visits_done} / {m.visits_target} visites
          </span>
          <span className="tabular text-muted-foreground">{Math.round(m.achievement_pct)} %</span>
        </div>
        <ProgressWithMarker value={m.achievement_pct} expected={m.expected_pct} tone={paceTone(m.achievement_pct, m.expected_pct)} />
      </div>
      <div className="text-muted-foreground mt-2 grid grid-cols-3 text-xs">
        <span>Couv. A : {Math.round(m.coverage_a)} %</span>
        <span>Annul. : {m.cancelled}</span>
        <span>CR retard : {m.late_reports}</span>
      </div>
    </button>
  );
}

/** Atteinte de l'objectif du mois (une barre par délégué) + repère « attendu à date ». */
function AchievementChart({ team, colorOf }: { team: Team; colorOf: (id: number) => string }) {
  const rows = team.members.map((m) => ({
    name: m.name.split(" ")[0],
    fullName: m.name,
    pct: Math.round(m.achievement_pct),
    color: colorOf(m.delegue_id),
  }));
  const expected = Math.round(team.totals.expected_pct);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Atteinte de l'objectif — mois en cours</CardTitle>
        <CardDescription>% de l'objectif de visites réalisé · trait pointillé : {expected} % attendu à date</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 20, right: 8, left: -16, bottom: 0 }} barCategoryGap="30%">
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: AXIS_COLOR }} />
              <YAxis unit=" %" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} />
              <Tooltip
                cursor={{ fill: "rgba(15,118,110,0.06)" }}
                content={<ChartTooltip valueFormatter={(v) => `${v} %`} labelFormatter={(l) => String(rows.find((r) => r.name === l)?.fullName ?? l)} />}
              />
              <ReferenceLine y={expected} stroke="#334155" strokeDasharray="4 4" />
              <Bar dataKey="pct" name="Objectif réalisé" radius={[4, 4, 0, 0]} maxBarSize={56}>
                <LabelList dataKey="pct" position="top" formatter={(v) => `${v} %`} style={{ fontSize: 11, fill: "#334155" }} />
                {/* <Cell> colore chaque barre : une couleur par délégué (son identité, la même dans tous les graphiques) */}
                {rows.map((r) => (
                  <Cell key={r.name} fill={r.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/** Évolution du % d'atteinte sur 6 mois, une ligne par délégué. */
function TrendChart({ team, colorOf }: { team: Team; colorOf: (id: number) => string }) {
  // Seuls les mois TERMINÉS : le mois en cours (à moitié écoulé) ferait croire à une chute.
  // Il est déjà représenté par le graphique « mois en cours » à côté.
  const periods = (team.members[0]?.history ?? []).filter((h) => h.period !== team.period);
  const rows = periods.map((p, i) => {
    const row: Record<string, string | number> = { label: p.label.split(" ")[0].slice(0, 4) + "." };
    team.members.forEach((m) => (row[m.name] = Math.round(m.history[i]?.pct ?? 0)));
    return row;
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Évolution sur les mois précédents</CardTitle>
        <CardDescription>% de l'objectif de visites atteint chaque mois terminé · pointillé : objectif (100 %)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {team.members.map((m) => (
            <span key={m.delegue_id} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ background: colorOf(m.delegue_id) }} /> {m.name}
            </span>
          ))}
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
              <YAxis unit=" %" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} domain={[0, 130]} />
              <ReferenceLine y={100} stroke="#334155" strokeDasharray="4 4" />
              <Tooltip content={<ChartTooltip valueFormatter={(v) => `${v} %`} />} />
              {team.members.map((m) => (
                <Line
                  key={m.delegue_id}
                  type="monotone"
                  dataKey={m.name}
                  stroke={colorOf(m.delegue_id)}
                  strokeWidth={2}
                  dot={{ r: 3, strokeWidth: 2, fill: "#fff" }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/** Couverture du mois par région et par segment (A foncé → C clair). */
function RegionCoverageChart({ team }: { team: Team }) {
  const rows = team.regions.map((r) => ({ region: r.region, ...r.coverage_by_segment }));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Couverture par région et segment</CardTitle>
        <CardDescription>% des médecins de chaque segment visités au moins une fois ce mois</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-muted-foreground mb-3 flex gap-4 text-xs">
          {(["A", "B", "C"] as const).map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: SEGMENT_COLORS[s] }} /> Segment {s}
            </span>
          ))}
        </div>
        <div className="h-60">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 4, left: -16, bottom: 0 }} barGap={2} barCategoryGap="22%">
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis dataKey="region" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
              <YAxis unit=" %" domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
              <Tooltip cursor={{ fill: "rgba(15,118,110,0.06)" }} content={<ChartTooltip valueFormatter={(v) => `${Math.round(v)} %`} />} />
              {(["A", "B", "C"] as const).map((s) => (
                <Bar key={s} dataKey={s} name={`Segment ${s}`} fill={SEGMENT_COLORS[s]} radius={[4, 4, 0, 0]} maxBarSize={28} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
