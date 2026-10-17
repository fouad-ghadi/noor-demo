/**
 * Graphique : visites réalisées et annulées/reportées par semaine (13 dernières semaines).
 * Barres empilées, une seule échelle, infobulle au survol.
 */
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import type { Dashboard } from "@/api/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AXIS_COLOR, CANCELLED_COLOR, DONE_COLOR, GRID_COLOR } from "@/lib/chartColors";
import { ChartTooltip } from "./ChartTooltip";

export function VisitsPerWeekChart({ data }: { data: Dashboard["visits_per_week"] }) {
  const rows = data.map((w) => ({ ...w, label: format(parseISO(w.week_start), "d MMM", { locale: fr }) }));
  const total = data.reduce((s, w) => s + w.done, 0);
  const avg = data.length ? Math.round(total / data.length) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Visites par semaine</CardTitle>
        <CardDescription>
          3 derniers mois · {total} visites réalisées · moyenne {avg} / semaine
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Légende (toujours présente pour 2 séries) */}
        <div className="text-muted-foreground mb-3 flex gap-4 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: DONE_COLOR }} /> Réalisées
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: CANCELLED_COLOR }} /> Annulées / reportées
          </span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="25%">
              <CartesianGrid vertical={false} stroke={GRID_COLOR} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 11, fill: AXIS_COLOR }}
                interval="preserveStartEnd"
                minTickGap={8}
              />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: AXIS_COLOR }} />
              <Tooltip
                cursor={{ fill: "rgba(15,118,110,0.06)" }}
                content={<ChartTooltip labelFormatter={(l) => `Semaine du ${l}`} />}
              />
              {/* 2 px de blanc entre segments empilés (stroke = couleur de fond) */}
              <Bar dataKey="done" name="Réalisées" stackId="v" fill={DONE_COLOR} stroke="#fff" strokeWidth={1} />
              <Bar
                dataKey="cancelled"
                name="Annulées / reportées"
                stackId="v"
                fill={CANCELLED_COLOR}
                stroke="#fff"
                strokeWidth={1}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
