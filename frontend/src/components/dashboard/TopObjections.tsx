/** Objections les plus fréquentes : barres horizontales simples avec valeur affichée. */
import type { CountItem } from "@/api/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DONE_COLOR } from "@/lib/chartColors";

export function TopObjections({ items, description = "3 derniers mois" }: { items: CountItem[]; description?: string }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Objections les plus fréquentes</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && <p className="text-muted-foreground text-sm">Aucune objection enregistrée.</p>}
        {items.map((i) => (
          <div key={i.key} className="space-y-1" title={`${i.label} : ${i.count}`}>
            <div className="flex justify-between gap-3 text-xs">
              <span>{i.label}</span>
              <span className="tabular font-semibold">{i.count}</span>
            </div>
            <div className="h-2 rounded-full bg-slate-100">
              <div className="h-full rounded-full" style={{ width: `${(i.count / max) * 100}%`, background: DONE_COLOR }} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
