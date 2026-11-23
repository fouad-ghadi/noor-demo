/**
 * 📋 IA — « Préparer la visite » (backend : app/ai/visit_prep.py).
 *
 * Panneau ouvert juste avant d'entrer chez le médecin : dernier compte-rendu, produits
 * à pousser (score + pourquoi : habitude, objectif, marché, saison, marge, pharmacie / parapharmacie),
 * argument conseillé et échantillons à remettre avec le dernier n° de lot.
 * Rien n'est enregistré : le délégué lit, puis fait sa visite.
 */
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, MessageSquareQuote, Package } from "lucide-react";

import { aiApi, type ProductToPush } from "@/api/ai";
import { FrequencyBadge, SegmentBadge, StatusPill } from "@/components/shared/badges";
import { ErrorState } from "@/components/shared/states";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatDate, formatDaysAgo } from "@/lib/format";
import { FEEDBACK, PRESCRIPTION_FEEDBACK } from "@/lib/labels";

interface Props {
  doctorId: number | null;
  onOpenChange: (open: boolean) => void;
}

export function VisitPrepSheet({ doctorId, onOpenChange }: Props) {
  const prep = useQuery({
    queryKey: ["visit-prep", doctorId],
    queryFn: () => aiApi.visitPrep(doctorId!),
    enabled: doctorId !== null,
  });
  const p = prep.data;

  return (
    <Sheet open={doctorId !== null} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-line border-b px-5 pt-5 pb-4">
          <p className="text-pine text-xs font-medium">Préparer la visite</p>
          <SheetTitle className="font-display text-ink text-xl">{p?.doctor_name ?? "Chargement…"}</SheetTitle>
          {p && (
            <SheetDescription asChild>
              <div className="space-y-2">
                <p className="flex flex-wrap items-center gap-2 text-[13px]">
                  <SegmentBadge segment={p.segment} />
                  <FrequencyBadge frequency={p.frequency} />
                  <span>
                    {p.specialty}
                    {p.patients_per_day !== null && `, ${p.patients_per_day} patients par jour`}
                  </span>
                </p>
                <p className="text-[13px] first-letter:uppercase">{p.reception}</p>
                <p className="bg-mint-wash/70 border-mint text-ink rounded-lg border px-3 py-2 text-sm">{p.briefing}</p>
              </div>
            </SheetDescription>
          )}
        </SheetHeader>

        {prep.isError && <ErrorState error={prep.error} onRetry={() => prep.refetch()} />}
        {prep.isLoading && <p className="text-muted-foreground px-5 text-sm">NOOR prépare la fiche…</p>}

        {p && (
          <div className="space-y-6 px-5 pb-8">
            {p.reminders.length > 0 && (
              <ul className="space-y-1.5">
                {p.reminders.map((r) => (
                  <li key={r} className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {r}
                  </li>
                ))}
              </ul>
            )}

            {/* 1. Dernier compte-rendu */}
            <section>
              <h3 className="font-display text-ink mb-2 text-base font-semibold">Dernier compte-rendu</h3>
              {!p.last_report ? (
                <p className="text-muted-foreground text-sm">Aucun compte-rendu : c'est une première visite.</p>
              ) : (
                <div className="border-line space-y-1.5 rounded-lg border bg-white p-3 text-[13px]">
                  <p className="text-ink font-medium">
                    {formatDate(p.last_report.date)}, {formatDaysAgo(p.last_report.days_ago)}
                    {p.last_report.feedback && (
                      <span className={FEEDBACK[p.last_report.feedback].className}>
                        {" "}: accueil {FEEDBACK[p.last_report.feedback].label.toLowerCase()}
                      </span>
                    )}
                  </p>
                  {p.last_report.prescription_feedback && (
                    <p className="text-muted-foreground">{PRESCRIPTION_FEEDBACK[p.last_report.prescription_feedback]}</p>
                  )}
                  {p.last_report.notes && <p className="text-ink/90 italic">« {p.last_report.notes} »</p>}
                  {p.last_report.products.length > 0 && (
                    <p className="text-muted-foreground">Présentés : {p.last_report.products.join(", ")}</p>
                  )}
                  {p.last_report.objections.length > 0 && (
                    <p className="text-muted-foreground">Objections : {p.last_report.objections.join(", ")}</p>
                  )}
                  {p.last_report.samples.length > 0 && (
                    <p className="text-muted-foreground">Échantillons remis : {p.last_report.samples.join(", ")}</p>
                  )}
                </div>
              )}
            </section>

            {/* 2. Produits à pousser */}
            <section>
              <h3 className="font-display text-ink mb-1 text-base font-semibold">Produits à pousser</h3>
              <p className="text-muted-foreground mb-3 text-xs">Classés par score. Chaque point du score est expliqué.</p>
              <ol className="space-y-3">
                {p.products.map((prod, i) => (
                  <ProductBlock key={prod.product_id} rank={i + 1} product={prod} />
                ))}
              </ol>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ProductBlock({ rank, product: p }: { rank: number; product: ProductToPush }) {
  return (
    <li className="border-line overflow-hidden rounded-xl border bg-white">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className="bg-pine text-mint font-display flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-semibold">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-ink font-medium">{p.brand_name}</p>
          <p className="text-muted-foreground text-xs">
            {p.molecule}
          </p>
        </div>
        <StatusPill
          dot={p.channel === "parapharmacie" ? "bg-violet-400" : "bg-teal-500"}
          label={p.channel === "parapharmacie" ? "Parapharmacie" : "Pharmacie"}
        />
        <span className="font-display tabular text-ink text-lg font-semibold">{p.score}</span>
      </div>
      <ul className="border-line space-y-1 border-t px-3.5 py-2.5">
        {p.factors.map((f) => (
          <li key={f.label} className="flex gap-2 text-xs">
            <span className={f.points < 0 ? "text-rose-700 tabular w-7 shrink-0" : "text-pine tabular w-7 shrink-0 font-medium"}>
              {f.points > 0 ? `+${f.points}` : f.points}
            </span>
            <span className="text-muted-foreground">
              <span className="text-ink">{f.label}</span> : {f.explanation}
            </span>
          </li>
        ))}
      </ul>
      <div className="bg-paper border-line space-y-2 border-t px-3.5 py-3 text-[13px]">
        <p className="flex gap-2">
          <MessageSquareQuote className="text-pine mt-0.5 size-4 shrink-0" />
          <span>
            <span className="text-ink font-medium">Argument conseillé : </span>
            {p.argument}
            <span className="text-muted-foreground block text-xs">Pourquoi : {p.argument_why}</span>
          </span>
        </p>
        <p className="flex gap-2">
          <Package className="text-pine mt-0.5 size-4 shrink-0" />
          <span>
            <span className="text-ink font-medium">Échantillons : </span>
            {p.samples_quantity} × {p.sample_unit}
            {p.sample_lot && <span className="text-muted-foreground"> (dernier lot remis : {p.sample_lot})</span>}
          </span>
        </p>
      </div>
    </li>
  );
}
