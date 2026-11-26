/**
 * 📝 Écran de vérification du compte-rendu (backend : app/ai/report_writer.py).
 *
 * Après la saisie rapide (puces, phrases prédéfinies, dictée), NOOR rédige un compte-rendu structuré
 * (contexte, produits, réaction, objections, échantillons, observations, suite) et signale ce qui
 * mérite d'être vérifié (n° de lot manquant, objection sans suite, possible effet indésirable).
 * Le délégué corrige librement le texte, puis valide : rien n'est enregistré avant.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Loader2 } from "lucide-react";

import type { StructuredReport } from "@/api/ai";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface Props {
  report: StructuredReport | null;
  /** Texte déjà validé (modification d'un compte-rendu) : il est proposé tel quel. */
  initialSummary?: string | null;
  saving: boolean;
  isEdit: boolean;
  onBack: () => void;
  onConfirm: (summary: string) => void;
}

export function ReportReviewDialog({ report, initialSummary, saving, isEdit, onBack, onConfirm }: Props) {
  const [summary, setSummary] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (report) {
      setSummary(report.summary);
      setTouched(false);
    }
  }, [report]);

  return (
    <Dialog open={report !== null} onOpenChange={(o) => !o && !saving && onBack()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Vérifier le compte-rendu</DialogTitle>
          <DialogDescription>
            NOOR a mis en forme votre saisie. Relisez, corrigez si besoin, puis validez : c'est ce texte qui sera enregistré.
          </DialogDescription>
        </DialogHeader>

        {report && (
          <div className="space-y-4">
            {/* Points à vérifier */}
            <ul className="space-y-1.5">
              {report.checks.map((c) => (
                <li
                  key={c.text}
                  className={cn(
                    "flex gap-2 rounded-lg border px-3 py-2 text-[13px]",
                    c.level === "attention" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-mint bg-mint-wash/60 text-ink",
                  )}
                >
                  {c.level === "attention" ? <AlertTriangle className="mt-0.5 size-4 shrink-0" /> : <Info className="text-pine mt-0.5 size-4 shrink-0" />}
                  {c.text}
                </li>
              ))}
            </ul>

            {/* Aperçu structuré (lecture), rubrique par rubrique */}
            <dl className="border-line divide-line divide-y rounded-lg border bg-white">
              {report.sections.map((s) => (
                <div key={s.label} className="grid gap-1 px-3 py-2 sm:grid-cols-[10rem_1fr] sm:gap-3">
                  <dt className="text-muted-foreground text-xs font-medium sm:pt-0.5">{s.label}</dt>
                  <dd className="text-ink text-[13px] leading-relaxed">{s.text}</dd>
                </div>
              ))}
            </dl>

            <div className="space-y-1.5">
              <Label htmlFor="report-summary">Texte final (modifiable)</Label>
              <Textarea
                id="report-summary"
                rows={7}
                value={summary}
                onChange={(e) => {
                  setSummary(e.target.value);
                  setTouched(true);
                }}
              />
              <p className="text-muted-foreground text-xs">
                {touched ? "Texte modifié par vous." : "Texte rédigé par NOOR à partir de votre saisie."}
                {isEdit && initialSummary && !touched && " Il remplacera le texte enregistré précédemment."}
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onBack} disabled={saving}>
            <ArrowLeft /> Modifier la saisie
          </Button>
          <Button onClick={() => onConfirm(summary.trim())} disabled={saving || summary.trim().length < 10}>
            {saving ? <Loader2 className="animate-spin" /> : <CheckCircle2 />}
            {isEdit ? "Valider et enregistrer" : "Valider la visite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
