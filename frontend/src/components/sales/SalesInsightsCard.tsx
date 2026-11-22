/**
 * 📈 IA — « Ce que NOOR en déduit » (backend : app/ai/sales_insights.py).
 *
 * À partir des ventes du marché (cumul depuis janvier, comparé à l'an dernier) :
 *   - zones à prioriser : territoire × produit qui perdent des parts de marché (ventes perdues estimées) ;
 *   - produits en progression : à consolider ;
 *   - médecins à revoir dans ces zones (bonne spécialité, potentiel A/B, peu ou pas prescripteurs).
 * Chaque conclusion affiche ses chiffres : c'est le « pourquoi ».
 */
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Sparkles, Stethoscope } from "lucide-react";
import { Link } from "react-router-dom";

import { aiApi, type SalesInsight } from "@/api/ai";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SalesInsightsCard() {
  const insights = useQuery({ queryKey: ["sales-insights"], queryFn: aiApi.salesInsights });
  const d = insights.data;
  if (insights.isError) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="text-pine size-4" /> Ce que NOOR en déduit
        </CardTitle>
        <CardDescription>
          {d ? `Tout le portefeuille, ${d.period_label.charAt(0).toLowerCase()}${d.period_label.slice(1)}. ` : ""}
          Chaque conclusion montre les chiffres qui la justifient.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {!d && <p className="text-muted-foreground text-sm">Analyse en cours…</p>}
        {d && (
          <>
            <p className="bg-mint-wash/70 border-mint text-ink rounded-lg border px-3.5 py-2.5 text-sm">{d.summary}</p>
            <div className="grid gap-5 lg:grid-cols-3">
              <Column
                title={d.zones[0]?.kind === "zone_a_surveiller" ? "Zones à surveiller" : "Zones à prioriser"}
                icon={<ArrowDownRight className="size-4 text-rose-700" />}
                items={d.zones}
                empty="Aucun produit ne perd de parts."
              />
              <Column
                title="En progression"
                icon={<ArrowUpRight className="size-4 text-emerald-700" />}
                items={d.growth}
                empty="Pas de progression nette cette année."
              />
              <Column
                title="Médecins à revoir"
                icon={<Stethoscope className="text-pine size-4" />}
                items={d.doctors}
                empty="Aucun médecin à revoir en priorité."
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Column({ title, icon, items, empty }: { title: string; icon: React.ReactNode; items: SalesInsight[]; empty: string }) {
  return (
    <section>
      <h3 className="font-display text-ink mb-2 flex items-center gap-1.5 text-[15px] font-semibold">
        {icon} {title}
      </h3>
      {items.length === 0 && <p className="text-muted-foreground text-xs">{empty}</p>}
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.title} className="border-line rounded-lg border bg-white px-3 py-2.5">
            {it.doctor_id ? (
              <Link to={`/medecins/${it.doctor_id}`} className="text-ink text-sm font-medium underline-offset-4 hover:underline">
                {it.title}
              </Link>
            ) : (
              <p className="text-ink text-sm font-medium">{it.title}</p>
            )}
            <ul className="text-muted-foreground mt-1 space-y-0.5 text-xs">
              {it.why.map((w) => (
                <li key={w} className="flex gap-1.5">
                  <span className="bg-pine/40 mt-1.5 size-1 shrink-0 rounded-full" aria-hidden="true" />
                  {w}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
