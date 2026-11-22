/**
 * 🌙 IA — « Clôturer ma journée / mon mois » (backend : app/ai/closing.py).
 *
 * Journée : ce qui reste à régler (comptes-rendus manquants, pharmacovigilance à déclarer)
 * et un rapport rédigé automatiquement (visites, produits, échantillons et lots, tournée du lendemain).
 * Mois : les indicateurs du rapport mensuel (jours travaillés, calls, contacts, moyenne, couverture, CPA F1/F2).
 * Le délégué relit et copie le rapport : rien n'est envoyé automatiquement.
 */
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { aiApi, type ClosingReport } from "@/api/ai";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type ClosingScope = "jour" | "mois";

export function ClosingDialog({ scope, onOpenChange }: { scope: ClosingScope | null; onOpenChange: (open: boolean) => void }) {
  const [tab, setTab] = useState<ClosingScope>("jour");
  // À l'ouverture : l'onglet demandé (« Clôturer ma journée » ou « mon mois »)
  useEffect(() => {
    if (scope) setTab(scope);
  }, [scope]);
  const current = scope ? tab : null;
  const report = useQuery({
    queryKey: ["closing", current],
    queryFn: () => (current === "mois" ? aiApi.closeMonth() : aiApi.closeDay()),
    enabled: current !== null,
    staleTime: 0,
  });

  return (
    <Dialog open={scope !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Clôturer</DialogTitle>
          <DialogDescription>NOOR vérifie ce qui reste à faire et rédige le rapport. Relisez-le avant de l'envoyer.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as ClosingScope)}>
          <TabsList>
            <TabsTrigger value="jour">Ma journée</TabsTrigger>
            <TabsTrigger value="mois">Mon mois</TabsTrigger>
          </TabsList>
        </Tabs>
        {report.isLoading && <p className="text-muted-foreground text-sm">Préparation du rapport…</p>}
        {report.isError && <ErrorState error={report.error} onRetry={() => report.refetch()} />}
        {report.data && <ReportBody r={report.data} onNavigate={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ReportBody({ r, onNavigate }: { r: ClosingReport; onNavigate: () => void }) {
  const copy = async () => {
    await navigator.clipboard.writeText(r.report);
    toast.success("Rapport copié : vous pouvez le coller dans un e-mail");
  };
  return (
    <div className="space-y-4">
      <h3 className="font-display text-ink text-base font-semibold first-letter:uppercase">{r.title}</h3>
      {r.to_fix.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          <CheckCircle2 className="size-4 shrink-0" /> Tout est en ordre : vous pouvez clôturer.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {r.to_fix.map((c) => (
            <li key={c.label} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <span className="flex-1">{c.label}</span>
              {c.link && (
                <Link to={c.link} onClick={onNavigate} className="shrink-0 font-medium underline underline-offset-4">
                  Régler
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      <div className="border-line bg-paper rounded-lg border p-3.5">
        <p className="text-muted-foreground mb-1.5 text-xs">Rapport rédigé par NOOR</p>
        <div className="text-ink space-y-1.5 text-[13px] leading-relaxed">
          {r.report.split("\n").map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </div>
      <Button variant="outline" onClick={copy}>
        <Copy /> Copier le rapport
      </Button>
    </div>
  );
}
