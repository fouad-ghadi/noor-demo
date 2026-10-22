/**
 * Analyse des ventes (marché type IMS, données fictives) : ventes, part de marché,
 * quotas, indices d'évolution et de pénétration, par délégué et par territoire,
 * avec les concurrents. Mêmes formules que le CRM du laboratoire partenaire.
 *
 * - Délégué : « Mes performances » (ses territoires).
 * - Superviseur : synthèse de l'équipe (ou un délégué choisi), comparée au national.
 *
 * Calculs côté serveur : GET /api/sales (backend/app/services/sales_service.py).
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Coins, Globe2, PieChart, Sparkles, TrendingUp } from "lucide-react";
import { Fragment } from "react";
import { useSearchParams } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { api } from "@/api/client";
import type { Sales, SalesMetrics } from "@/api/types";
import { useCurrentUser } from "@/auth/AuthContext";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { ChartTooltip } from "@/components/dashboard/ChartTooltip";
import { KpiCard, KpiStrip, type KpiStatus } from "@/components/dashboard/KpiCard";
import { PageHeader } from "@/components/shared/PageHeader";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useTeamUsers } from "@/hooks/queries";
import { AXIS_COLOR, DONE_COLOR, GRID_COLOR } from "@/lib/chartColors";
import { formatMoney, formatPeriod } from "@/lib/format";
import { cn } from "@/lib/utils";

const ALL = "tous";
const TEAM = "equipe";

const num = (n: number | null, digits = 2) =>
  n === null ? "—" : n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
const pctText = (n: number | null) => (n === null ? "—" : `${num(n)} %`);

/** Indice : au-dessus de 100 = gain, en dessous = perte (icône + texte, jamais la couleur seule). */
function trendOf(index: number | null): { level: KpiStatus; text: string } | undefined {
  if (index === null) return undefined;
  if (index >= 101) return { level: "good", text: "Gain de part de marché" };
  if (index > 99) return { level: "warning", text: "Part de marché stable" };
  return { level: "critical", text: "Perte de part de marché" };
}

export function SalesPage() {
  const user = useCurrentUser();
  const isSupervisor = user.role === "superviseur";
  const [params, setParams] = useSearchParams();
  const product = params.get("produit") ?? ALL;
  const period = params.get("periode") ?? "ytd";
  const delegue = params.get("delegue") ?? TEAM;
  const productId = product !== ALL ? Number(product) : undefined;
  const delegueId = delegue !== TEAM ? Number(delegue) : undefined;
  const team = useTeamUsers();

  usePageContext({ page: "sales", title: "Analyse des ventes", productId, delegueId });
  const sales = useQuery({
    queryKey: ["sales", productId ?? ALL, period, delegueId ?? TEAM],
    queryFn: () => api.sales({ product_id: productId, period, delegue_id: delegueId }),
  });
  const s = sales.data;

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    next.set(key, value);
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        title={isSupervisor ? "Analyse des ventes" : "Mes performances"}
        description={
          s
            ? `${s.period_label}, comparé à ${s.compare_label}. Données de marché disponibles jusqu'à ${formatPeriod(s.last_month).toLowerCase()}.`
            : "Ventes, part de marché et concurrents par territoire"
        }
        actions={
          <>
            <Select value={product} onValueChange={(v) => setParam("produit", v)}>
              <SelectTrigger className="w-52" aria-label="Produit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Tout le portefeuille</SelectItem>
                {s?.products.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(v) => setParam("periode", v)}>
              <SelectTrigger className="w-48" aria-label="Période">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ytd">Cumul depuis janvier</SelectItem>
                {s?.months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {formatPeriod(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isSupervisor && (
              <Select value={delegue} onValueChange={(v) => setParam("delegue", v)}>
                <SelectTrigger className="w-56" aria-label="Délégué">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TEAM}>Toute l'équipe</SelectItem>
                  {team.data?.map((u) => (
                    <SelectItem key={u.id} value={String(u.id)}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        }
      />

      {sales.isLoading && <LoadingState rows={4} />}
      {sales.isError && <ErrorState error={sales.error} onRetry={() => sales.refetch()} />}
      {s && <SalesContent s={s} />}
    </>
  );
}

function SalesContent({ s }: { s: Sales }) {
  const sc = s.scope;
  const n = s.national;
  const losing = s.delegates.flatMap((d) => d.territories).filter((t) => t.ie !== null && t.ie < 97);

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      <p className="text-muted-foreground -mt-2 text-sm">
        <span className="text-ink font-medium">{s.product_name}</span>, marché : {s.market_name}. Périmètre :{" "}
        {s.scope_label}.
      </p>

      <KpiStrip className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Ventes"
          icon={Coins}
          value={formatMoney(sc.value)}
          status={evolStatus(sc.evol)}
          detail={`National : ${formatMoney(n.value)}, soit un quota produit de ${pctText(sc.qp)}`}
        />
        <KpiCard
          label="Ventes du marché"
          icon={Globe2}
          value={formatMoney(sc.market_value)}
          status={evolStatus(sc.evol_market)}
          detail={`National : ${formatMoney(n.market_value)}, quota marché ${pctText(sc.qm)}`}
        />
        <KpiCard
          label="Part de marché"
          icon={PieChart}
          value={pctText(sc.pm)}
          detail={`Un an plus tôt : ${pctText(sc.pm_prev)}. National : ${pctText(n.pm)}`}
        />
        <KpiCard
          label="Indice d'évolution"
          icon={TrendingUp}
          value={num(sc.ie)}
          status={trendOf(sc.ie)}
          detail={`Indice de pénétration : ${num(sc.ip)}. National : IE ${num(n.ie)}`}
        />
      </KpiStrip>

      {losing.length > 0 && (
        <div className="border-line bg-mint-wash/60 flex gap-3 rounded-xl border px-4 py-3 text-sm">
          <Sparkles className="text-pine mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-medium">Copilote NOOR.</span>{" "}
            {s.product_id === null ? "Le portefeuille" : s.product_name} perd des parts de marché sur{" "}
            {losing.map((t) => `${t.territory} (IE ${num(t.ie, 0)})`).join(", ")}. Les visites recommandées du tableau
            de bord en tiennent compte : les médecins de ces territoires remontent dans la liste, avec la raison.
          </p>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Par délégué et par territoire</CardTitle>
          <CardDescription>
            QP : quota produit. QM : quota marché. PM : part de marché. IE : indice d'évolution. IP : indice de
            pénétration.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="min-w-[880px]">
            <TableHeader>
              <TableRow>
                <TableHead>Délégué, territoire</TableHead>
                <TableHead className="text-right">Ventes</TableHead>
                <TableHead className="text-right">QP</TableHead>
                <TableHead className="text-right">QM</TableHead>
                <TableHead className="text-right">PM</TableHead>
                <TableHead className="text-right">IE</TableHead>
                <TableHead className="text-right">IP</TableHead>
                <TableHead className="text-right">Évol.</TableHead>
                <TableHead className="text-right">Évol. marché</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.delegates.map((d) => (
                <Fragment key={d.delegue_id}>
                  <MetricsRow label={d.name} sub={d.region} m={d} strong />
                  {d.territories.map((t) => (
                    <MetricsRow key={t.territory} label={t.territory} m={t} indent />
                  ))}
                </Fragment>
              ))}
              <MetricsRow label="National" sub="Tous les territoires" m={n} strong muted />
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
        <MonthlyChart s={s} className="lg:col-span-2" />
        <Competitors s={s} className="lg:col-span-3" />
      </div>

      <Definitions />
    </div>
  );
}

function evolStatus(evol: number | null): { level: KpiStatus; text: string } | undefined {
  if (evol === null) return undefined;
  const text = `${evol >= 0 ? "+" : ""}${num(evol, 1)} % sur un an`;
  return { level: evol >= 1 ? "good" : evol > -1 ? "warning" : "critical", text };
}

/** Variation avec flèche : la direction se lit sur l'icône et le signe, pas seulement sur la couleur. */
function Delta({ value, isIndex = false }: { value: number | null; isIndex?: boolean }) {
  if (value === null) return <span className="text-muted-foreground">—</span>;
  const delta = isIndex ? value - 100 : value;
  const Icon = delta >= 1 ? ArrowUpRight : delta <= -1 ? ArrowDownRight : ArrowRight;
  const color = delta >= 1 ? "text-emerald-700" : delta <= -1 ? "text-rose-700" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center justify-end gap-0.5", color)}>
      <Icon className="size-3.5" aria-hidden="true" />
      {isIndex ? num(value) : `${value > 0 ? "+" : ""}${num(value)} %`}
    </span>
  );
}

function MetricsRow({ label, sub, m, strong, indent, muted }: {
  label: string;
  sub?: string;
  m: SalesMetrics;
  strong?: boolean;
  indent?: boolean;
  muted?: boolean;
}) {
  return (
    <TableRow className={cn(strong && "font-semibold", muted && "bg-mint-wash/60")}>
      <TableCell className={cn(indent && "pl-6 font-normal")}>
        <p>{label}</p>
        {sub && <p className="text-muted-foreground text-xs font-normal">{sub}</p>}
      </TableCell>
      <TableCell className="tabular text-right">{formatMoney(m.value)}</TableCell>
      <TableCell className="tabular text-right">{pctText(m.qp)}</TableCell>
      <TableCell className="tabular text-right">{pctText(m.qm)}</TableCell>
      <TableCell className="tabular text-right">{pctText(m.pm)}</TableCell>
      <TableCell className="tabular text-right">
        <Delta value={m.ie} isIndex />
      </TableCell>
      <TableCell className="tabular text-right">{num(m.ip)}</TableCell>
      <TableCell className="tabular text-right">
        <Delta value={m.evol} />
      </TableCell>
      <TableCell className="tabular text-right">
        <Delta value={m.evol_market} />
      </TableCell>
    </TableRow>
  );
}

function MonthlyChart({ s, className }: { s: Sales; className?: string }) {
  const rows = s.monthly.map((m) => ({ ...m, short: formatPeriod(m.period, true) }));
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Ventes des 12 derniers mois</CardTitle>
        <CardDescription>{s.product_name}, périmètre : {s.scope_label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis dataKey="short" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={56}
                tick={{ fontSize: 11, fill: AXIS_COLOR }}
                tickFormatter={(v: number) => formatMoney(v).replace(" DH", "")}
              />
              <Tooltip
                cursor={{ fill: "rgba(15,118,110,0.06)" }}
                content={
                  <ChartTooltip
                    labelFormatter={(l) => {
                      const r = rows.find((x) => x.short === l);
                      return r ? `${formatPeriod(r.period)}, part de marché ${pctText(r.pm)}` : String(l);
                    }}
                    valueFormatter={(v) => formatMoney(v)}
                  />
                }
              />
              <Bar dataKey="value" name="Ventes" fill={DONE_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function Competitors({ s, className }: { s: Sales; className?: string }) {
  // Tout le portefeuille : nos 10 produits, chacun sur son marché ; un produit choisi : ses concurrents
  const portfolio = s.product_id === null;
  const rows = portfolio ? s.competitors.filter((c) => c.is_ours) : s.competitors;
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{portfolio ? "Nos produits sur leurs marchés" : "Concurrents"}</CardTitle>
        <CardDescription>
          {portfolio
            ? "Choisissez un produit pour voir ses concurrents."
            : `${s.market_name}. Noms et laboratoires concurrents fictifs.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table className="min-w-[560px]">
          <TableHeader>
            <TableRow>
              <TableHead>Produit</TableHead>
              <TableHead className="text-right">Ventes</TableHead>
              <TableHead className="text-right">PM</TableHead>
              <TableHead className="text-right">IE</TableHead>
              <TableHead className="text-right">Évol.</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => {
              return (
                <Fragment key={`${c.market_name}-${c.name}`}>
                  <TableRow className={cn(c.is_ours && !portfolio && "bg-mint-wash/60")}>
                    <TableCell>
                      <p className={cn(c.is_ours && "font-semibold")}>{c.name}</p>
                      <p className="text-muted-foreground text-xs">
                        {portfolio ? c.market_name : c.is_ours ? "Notre produit" : c.laboratory}
                      </p>
                    </TableCell>
                    <TableCell className="tabular text-right">{formatMoney(c.value)}</TableCell>
                    <TableCell className="tabular text-right">{pctText(c.pm)}</TableCell>
                    <TableCell className="tabular text-right">
                      <Delta value={c.ie} isIndex />
                    </TableCell>
                    <TableCell className="tabular text-right">
                      <Delta value={c.evol} />
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Formules (les mêmes que dans les infobulles du CRM du laboratoire). */
function Definitions() {
  const items = [
    ["Part de marché (PM)", "Ventes du produit × 100 ÷ ventes du marché (le produit et ses concurrents)."],
    ["Quota produit (QP)", "Ventes locales du produit × 100 ÷ ventes nationales du produit."],
    ["Quota marché (QM)", "Ventes locales du marché × 100 ÷ ventes nationales du marché."],
    ["Indice d'évolution (IE)", "PM de la période × 100 ÷ PM de la même période l'an dernier. Au-dessus de 100 : gain de part de marché ; en dessous : perte."],
    ["Indice de pénétration (IP)", "PM locale × 100 ÷ PM nationale. Au-dessus de 100 : le produit est mieux implanté sur le territoire qu'au national."],
    ["Évolution", "Variation des ventes (ou du marché) par rapport aux mêmes mois de l'année précédente."],
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
      <p className="text-muted-foreground mt-3 text-xs">
        Données de démonstration : marchés, concurrents et chiffres sont fictifs. Les ventes arrivent avec un mois de
        décalage, comme les données IMS réelles.
      </p>
    </details>
  );
}
