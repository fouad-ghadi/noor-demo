/**
 * 🌙 IA — « Clôturer ma journée / mon mois » (backend : app/ai/closing.py).
 *
 * Journée : bilan automatique (visites réalisées, annulées ou reportées, médecins vus, produits présentés,
 * objectifs atteints ou non, observations importantes), ce qui reste à régler, et un rapport rédigé.
 * Le délégué MODIFIE le rapport puis le VALIDE : la clôture est enregistrée (et peut être revalidée).
 * Mois : les indicateurs du rapport mensuel (jours travaillés, calls, contacts, moyenne, couverture, CPA F1/F2).
 */
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CheckCircle2, CircleDashed, Copy, Loader2, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { aiApi, type ClosingReport } from "@/api/ai";
import { ErrorState } from "@/components/shared/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ClosingScope = "jour" | "mois";

const STATUS: Record<string, { label: string; dot: string }> = {
  realisee: { label: "Réalisée", dot: "bg-emerald-600" },
  annulee: { label: "Annulée", dot: "bg-rose-600" },
  reportee: { label: "Reportée", dot: "bg-amber-500" },
  planifiee: { label: "Prévue", dot: "bg-pine" },
};

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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Clôturer</DialogTitle>
          <DialogDescription>NOOR fait le bilan et rédige le rapport. Vous le relisez, le modifiez puis le validez.</DialogDescription>
        </DialogHeader>
        <Tabs value={tab} onValueChange={(v) => setTab(v as ClosingScope)}>
          <TabsList>
            <TabsTrigger value="jour">Ma journée</TabsTrigger>
            <TabsTrigger value="mois">Mon mois</TabsTrigger>
          </TabsList>
        </Tabs>
        {report.isLoading && <p className="text-muted-foreground text-sm">Préparation du bilan…</p>}
        {report.isError && <ErrorState error={report.error} onRetry={() => report.refetch()} />}
        {report.data && <ReportBody key={`${report.data.scope}-${report.data.title}`} r={report.data} onNavigate={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function ReportBody({ r, onNavigate }: { r: ClosingReport; onNavigate: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState(r.validated_report ?? r.report);
  const isDay = r.scope === "jour";

  const validate = useMutation({
    mutationFn: () => aiApi.validateDay(r.day!, text),
    onSuccess: (saved) => {
      queryClient.setQueryData(["closing", "jour"], saved);
      toast.success("Journée clôturée", { description: "Votre bilan est enregistré." });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    toast.success("Rapport copié : vous pouvez le coller dans un e-mail");
  };

  const f = r.figures;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-display text-ink text-base font-semibold first-letter:uppercase">{r.title}</h3>
        {r.validated_at && (
          <span className="flex items-center gap-1 text-xs font-medium text-emerald-800">
            <CheckCircle2 className="size-3.5" /> Clôturée le {formatDateTime(r.validated_at)}
          </span>
        )}
      </div>

      {isDay && (
        <>
          {/* Chiffres de la journée */}
          <div className="grid grid-cols-3 gap-2">
            <Figure label="Réalisées" value={f.realisees} sub={`sur ${f.prevues} prévues`} />
            <Figure label="Annulées ou reportées" value={f.annulees} />
            <Figure label="Échantillons remis" value={f.echantillons} />
          </div>

          {/* Objectifs atteints / non atteints */}
          {r.objectives.length > 0 && (
            <section>
              <h4 className="text-ink mb-1.5 text-sm font-semibold">Objectifs</h4>
              <ul className="space-y-1">
                {r.objectives.map((o) => (
                  <li key={o.label} className="flex items-start gap-2 text-[13px]">
                    {o.reached ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" aria-label="Atteint" />
                    ) : (
                      <CircleDashed className="mt-0.5 size-4 shrink-0 text-amber-700" aria-label="Non atteint" />
                    )}
                    <span>
                      <span className="text-ink font-medium">{o.label}</span>{" "}
                      <span className={o.reached ? "text-emerald-800" : "text-amber-800"}>{o.reached ? "atteint" : "non atteint"}</span>
                      <span className="text-muted-foreground"> : {o.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Médecins de la journée */}
          {r.visits.length > 0 && (
            <section>
              <h4 className="text-ink mb-1.5 text-sm font-semibold">Médecins de la journée</h4>
              <ul className="border-line divide-line max-h-48 divide-y overflow-y-auto rounded-lg border bg-white">
                {r.visits.map((v) => (
                  <li key={v.visit_id} className="flex items-center gap-3 px-3 py-1.5 text-[13px]">
                    <span className="tabular text-muted-foreground w-10 shrink-0">{v.time}</span>
                    <span className={cn("size-2 shrink-0 rounded-full", STATUS[v.status]?.dot)} aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <Link to={`/medecins/${v.doctor_id}`} onClick={onNavigate} className="text-ink font-medium underline-offset-4 hover:underline">
                        {v.doctor_name}
                      </Link>
                      {v.products.length > 0 && <span className="text-muted-foreground"> : {v.products.join(", ")}</span>}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">{v.note ?? STATUS[v.status]?.label}</span>
                  </li>
                ))}
              </ul>
              {r.products.length > 0 && <p className="text-muted-foreground mt-1.5 text-xs">Produits présentés : {r.products.join(", ")}.</p>}
            </section>
          )}

          {r.observations.length > 0 && (
            <section>
              <h4 className="text-ink mb-1.5 text-sm font-semibold">Observations importantes</h4>
              <ul className="text-ink list-disc space-y-0.5 pl-5 text-[13px]">
                {r.observations.map((o) => (
                  <li key={o}>{o}</li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* Ce qui reste à régler */}
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

      {/* Rapport rédigé par NOOR : modifiable par le délégué */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            {text === r.report ? "Rapport rédigé par NOOR, modifiable" : "Rapport modifié par vous"}
          </p>
          {text !== r.report && (
            <button type="button" onClick={() => setText(r.report)} className="text-pine flex cursor-pointer items-center gap-1 text-xs font-medium">
              <RotateCcw className="size-3" /> Revenir au texte de NOOR
            </button>
          )}
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} className="text-[13px] leading-relaxed" aria-label="Rapport de clôture" />
      </div>

      <div className="flex flex-wrap gap-2">
        {isDay && (
          <Button onClick={() => validate.mutate()} disabled={validate.isPending || text.trim().length < 10}>
            {validate.isPending ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {r.validated_at ? "Mettre à jour la clôture" : "Valider et clôturer ma journée"}
          </Button>
        )}
        <Button variant="outline" onClick={copy}>
          <Copy /> Copier le rapport
        </Button>
        {!isDay && (
          <p className="text-muted-foreground self-center text-xs">Rien n'est envoyé automatiquement.</p>
        )}
      </div>
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="border-line rounded-lg border bg-white px-3 py-2">
      <p className="font-display text-ink tabular text-2xl font-semibold">{value}</p>
      <p className="text-muted-foreground text-xs leading-tight">
        {label}
        {sub && <span className="block">{sub}</span>}
      </p>
    </div>
  );
}
