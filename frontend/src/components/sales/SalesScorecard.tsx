/**
 * 🎯 Objectifs de ventes par produit + zones à fort potentiel (backend : sales_service.scorecard).
 *
 * - Pour chaque produit : ventes depuis janvier face à l'objectif (FICTIF : ventes de l'an dernier + x %),
 *   taux d'atteinte (barre avec repère à 100 %), évolution de la part de marché sur 12 mois (mini-courbe).
 *   Les produits en retard sont en tête de liste.
 * - Zones à fort potentiel : territoires où notre part de marché est sous la moyenne nationale
 *   (ventes « à conquérir ») et où beaucoup de médecins A ou B ne prescrivent pas encore nos produits.
 * Chaque ligne affiche son pourquoi. Un clic sur un produit filtre la page sur ce produit.
 */
import { useQuery } from "@tanstack/react-query";
import { MapPinned, Target } from "lucide-react";

import { api } from "@/api/client";
import type { ProductScore } from "@/api/types";
import { StatusPill } from "@/components/shared/badges";
import { ErrorState, LoadingState } from "@/components/shared/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DONE_COLOR } from "@/lib/chartColors";
import { formatMoney, formatPeriod } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS: Record<ProductScore["status"], { label: string; dot: string; bar: string }> = {
  atteint: { label: "Objectif atteint", dot: "bg-emerald-600", bar: "bg-pine" },
  proche: { label: "Proche de l'objectif", dot: "bg-amber-500", bar: "bg-amber-500" },
  en_retard: { label: "En retard", dot: "bg-rose-600", bar: "bg-rose-600" },
};
const pct = (n: number | null, digits = 1) =>
  n === null ? "—" : `${n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits })} %`;

export function SalesScorecard({ delegueId, onSelectProduct }: { delegueId?: number; onSelectProduct: (id: number) => void }) {
  const card = useQuery({ queryKey: ["sales-scorecard", delegueId ?? "moi"], queryFn: () => api.salesScorecard(delegueId) });
  if (card.isLoading) return <LoadingState rows={3} />;
  if (card.isError) return <ErrorState error={card.error} onRetry={() => card.refetch()} />;
  const c = card.data!;

  return (
    <div className="grid gap-5 lg:grid-cols-5 lg:gap-6">
      <Card className="lg:col-span-3">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="text-pine size-4" /> Objectifs et résultats par produit
          </CardTitle>
          <CardDescription>
            {c.period_label}. {c.objective_rule}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-ink mb-2 text-sm">{c.summary}</p>
          <ul className="divide-line divide-y">
            {c.products.map((p) => (
              <li key={p.product_id}>
                <button
                  type="button"
                  onClick={() => onSelectProduct(p.product_id)}
                  className="hover:bg-mint-wash/40 grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1 rounded-md px-1 py-2.5 text-left sm:grid-cols-[9rem_minmax(0,1fr)_6.5rem]"
                  title={p.why}
                >
                  <span className="min-w-0">
                    <span className="text-ink block text-sm font-medium">{p.name}</span>
                    <StatusPill dot={STATUS[p.status].dot} label={STATUS[p.status].label} className="mt-0.5" />
                  </span>
                  <span className="order-3 col-span-2 sm:order-none sm:col-span-1">
                    <AttainmentBar value={p.attainment_pct} tone={STATUS[p.status].bar} />
                    <span className="text-muted-foreground mt-1 block text-xs">
                      {formatMoney(p.value)} sur {formatMoney(p.objective)} visés (+{p.growth_target_pct} % sur un an)
                    </span>
                  </span>
                  <span className="text-right">
                    <Sparkline points={p.pm_series.map((x) => x.pm)} label={`Part de marché de ${p.name} sur 12 mois`} />
                    <span className="text-muted-foreground block text-xs">
                      PM {pct(p.pm)}
                      <span className={cn("ml-1", (p.ie ?? 100) >= 100 ? "text-emerald-700" : "text-rose-700")}>
                        {(p.ie ?? 100) >= 100 ? "▲" : "▼"}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="text-muted-foreground pt-2 text-xs">
            Mini-courbe : part de marché mois par mois ({formatPeriod(c.products[0]?.pm_series[0]?.period ?? "2026-01", true)} →{" "}
            {formatPeriod(c.products[0]?.pm_series.at(-1)?.period ?? "2026-01", true)}). Cliquez un produit pour voir son détail.
          </p>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPinned className="text-pine size-4" /> Zones à fort potentiel
          </CardTitle>
          <CardDescription>
            Ventes à conquérir si notre part de marché rejoignait la moyenne nationale, et médecins A ou B à convaincre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3">
            {c.territories.map((t, i) => (
              <li key={t.territory} className="border-line rounded-lg border bg-white p-3">
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-pine text-sm font-semibold">{i + 1}.</span>
                  <span className="text-ink text-sm font-semibold">{t.territory}</span>
                  <span className="text-ink tabular ml-auto text-sm font-medium">
                    {t.gap_value > 0 ? `${formatMoney(t.gap_value)} à conquérir` : "Au-dessus du national"}
                  </span>
                </div>
                <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                  {t.why.map((w) => (
                    <li key={w}>{w}.</li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

/** Barre d'atteinte : remplie jusqu'au taux (plafonnée à 120 %), repère vertical à 100 %. */
function AttainmentBar({ value, tone }: { value: number; tone: string }) {
  const max = 120;
  return (
    <span className="flex items-center gap-2">
      <span className="bg-mint-wash relative h-2 flex-1 overflow-hidden rounded-full" role="img" aria-label={`${pct(value)} de l'objectif`}>
        <span className={cn("bar-grow absolute inset-y-0 left-0 rounded-full", tone)} style={{ width: `${Math.min(value, max) / max * 100}%` }} />
        <span className="bg-ink absolute inset-y-0 w-0.5" style={{ left: `${(100 / max) * 100}%` }} />
      </span>
      <span className="text-ink tabular w-14 text-right text-sm font-medium">{pct(value, 0)}</span>
    </span>
  );
}

/** Mini-courbe SVG (sans axes) : la tendance se lit d'un coup d'œil, la valeur exacte est à côté. */
function Sparkline({ points, label }: { points: (number | null)[]; label: string }) {
  const values = points.filter((p): p is number => p !== null);
  if (values.length < 2) return null;
  const w = 88;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const coords = values.map((v, i) => `${(i / (values.length - 1)) * w},${h - 2 - ((v - min) / span) * (h - 4)}`);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="ml-auto block" role="img" aria-label={label}>
      <polyline points={coords.join(" ")} fill="none" stroke={DONE_COLOR} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={coords.at(-1)!.split(",")[0]} cy={coords.at(-1)!.split(",")[1]} r={2.5} fill={DONE_COLOR} />
    </svg>
  );
}
