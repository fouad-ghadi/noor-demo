/**
 * 🔁 Doublons possibles, affichés dans le formulaire « Nouveau médecin » AVANT l'enregistrement
 * (après un scan de carte de visite, ou pendant la saisie à la main).
 *
 * Pour chaque fiche proche : niveau (très probable / probable / possible), raisons lisibles
 * (« même téléphone », « nom proche : Wazzani / Ouazzani »), et le choix du délégué :
 * compléter la fiche existante, ou indiquer que ce n'est pas le même médecin.
 * Une fiche suivie par un collègue est signalée sans lien (pas d'accès).
 */
import { ExternalLink, GitMerge, X } from "lucide-react";
import { Link } from "react-router-dom";

import type { DuplicateMatch } from "@/api/ai";
import { StatusPill } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LEVEL: Record<DuplicateMatch["level"], { label: string; dot: string }> = {
  tres_probable: { label: "Très probablement le même médecin", dot: "bg-rose-500" },
  probable: { label: "Probablement le même médecin", dot: "bg-amber-400" },
  possible: { label: "Ressemblance possible", dot: "bg-slate-400" },
};

interface Props {
  matches: DuplicateMatch[];
  onMerge: (match: DuplicateMatch) => void;
  onDismiss: () => void;
  className?: string;
}

export function DuplicatePanel({ matches, onMerge, onDismiss, className }: Props) {
  if (matches.length === 0) return null;
  const strong = matches.some((m) => m.level !== "possible");
  return (
    <section
      aria-labelledby="duplicates-title"
      className={cn("rounded-xl border bg-white", strong ? "border-rose-300" : "border-line", className)}
    >
      <div className={cn("border-b px-5 py-4", strong ? "border-rose-200 bg-rose-50/60" : "border-line")}>
        <h2 id="duplicates-title" className="font-display text-ink text-[17px] font-semibold">
          {matches.length === 1 ? "Ce médecin existe peut-être déjà" : `Ce médecin existe peut-être déjà (${matches.length} fiches proches)`}
        </h2>
        <p className="text-muted-foreground mt-0.5 text-[13px]">
          Vérifiez avant de créer une nouvelle fiche : un doublon fausse le ciblage et les statistiques.
        </p>
      </div>

      <ul className="divide-line divide-y">
        {matches.map((m) => (
          <li key={m.doctor_id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-ink font-semibold">{m.doctor_name}</p>
                <StatusPill dot={LEVEL[m.level].dot} label={LEVEL[m.level].label} />
              </div>
              <p className="text-muted-foreground text-sm">
                {m.specialty} à {m.city}, {m.district}
                {m.phone && <>. Tél. {m.phone}</>}
              </p>
              <ul className="text-ink space-y-0.5 text-sm">
                {m.reasons.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span aria-hidden className="bg-pine mt-2 size-1 shrink-0 rounded-full" />
                    <span>{r[0].toUpperCase() + r.slice(1)}</span>
                  </li>
                ))}
              </ul>
              {!m.in_scope && (
                <p className="text-muted-foreground text-sm">
                  Fiche suivie par {m.delegue_name}. Prévenez votre superviseur plutôt que de la recréer.
                </p>
              )}
            </div>
            {m.in_scope && (
              <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-stretch">
                <Button type="button" size="sm" onClick={() => onMerge(m)}>
                  <GitMerge /> Compléter cette fiche
                </Button>
                <Button type="button" size="sm" variant="outline" asChild>
                  <Link to={`/medecins/${m.doctor_id}`} target="_blank" rel="noreferrer">
                    <ExternalLink /> Voir la fiche
                  </Link>
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="border-line flex justify-end border-t px-5 py-3">
        <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
          <X /> Ce n'est pas le même médecin
        </Button>
      </div>
    </section>
  );
}
