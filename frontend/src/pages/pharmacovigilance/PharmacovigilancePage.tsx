/**
 * Pharmacovigilance : liste des cas repérés par l'IA dans les comptes-rendus
 * (effets indésirables et situations particulières), à déclarer sous 24 h.
 * Délégué : ses cas. Superviseur : les cas de son équipe (lecture seule).
 */
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, X } from "lucide-react";
import { Link } from "react-router-dom";

import { api } from "@/api/client";
import type { PvCase } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { usePageContext } from "@/components/assistant/AssistantContext";
import { PvDeadlineBadge } from "@/components/pharmacovigilance/PvDeadlineBadge";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/shared/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { capitalize, formatDate } from "@/lib/format";
import { PV_KIND, PV_SITUATION } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function PharmacovigilancePage() {
  const { isSupervisor } = useAuth();
  const cases = useQuery({ queryKey: ["pv-cases"], queryFn: () => api.pvCases() });
  usePageContext({ page: "pharmacovigilance", title: "Pharmacovigilance" });

  const list = cases.data ?? [];
  const toDeclare = list.filter((c) => c.status === "a_declarer");
  const declared = list.filter((c) => c.status === "declaree");

  return (
    <>
      <PageHeader
        title="Pharmacovigilance"
        description="Effets indésirables et situations particulières repérés dans les comptes-rendus, à déclarer sous 24 h."
      />

      <ProcedureCard />

      {cases.isLoading && <LoadingState />}
      {cases.isError && <ErrorState error={cases.error} onRetry={() => cases.refetch()} />}

      {cases.data && (
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>À déclarer</CardTitle>
              <CardDescription>
                {toDeclare.length ? `${toDeclare.length} cas, l'échéance la plus proche en premier` : "Aucun cas en attente"}
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-line divide-y">
              {toDeclare.length === 0 && <EmptyState title="Rien à déclarer" description="Tous les cas ont été transmis." />}
              {toDeclare.map((c) => (
                <CaseRow key={c.id} c={c} showDelegue={isSupervisor} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Déjà déclarés</CardTitle>
              <CardDescription>{declared.length} cas transmis à l'équipe de pharmacovigilance</CardDescription>
            </CardHeader>
            <CardContent className="divide-line divide-y">
              {declared.length === 0 && <p className="text-muted-foreground text-sm">Aucun cas déclaré pour l'instant.</p>}
              {declared.map((c) => (
                <CaseRow key={c.id} c={c} showDelegue={isSupervisor} />
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

/** Rappel de la procédure (utile au délégué comme au jury). */
function ProcedureCard() {
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>La procédure en bref</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm sm:grid-cols-3">
        <div>
          <p className="text-ink font-medium">Quoi déclarer</p>
          <p className="text-muted-foreground">
            Tout effet indésirable, et aussi les situations particulières même sans effet : grossesse ou allaitement,
            surdosage, mésusage, erreur médicamenteuse, manque d'efficacité.
          </p>
        </div>
        <div>
          <p className="text-ink font-medium">Les 4 informations minimales</p>
          <p className="text-muted-foreground">
            Le produit, l'effet ou la situation, un patient identifiable (âge, sexe ou initiales), un notificateur
            identifiable (le médecin). À défaut, déclarer au moins les deux premières.
          </p>
        </div>
        <div>
          <p className="text-ink font-medium">Quand</p>
          <p className="text-muted-foreground">
            Dans les 24 heures qui suivent la visite, par e-mail à l'équipe de pharmacovigilance. NOOR prépare le texte,
            vous le relisez et l'envoyez.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CaseRow({ c, showDelegue }: { c: PvCase; showDelegue: boolean }) {
  return (
    <Link to={`/pharmacovigilance/${c.id}`} className="group flex items-start gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground text-xs">
          {PV_KIND[c.kind]}
          {c.seriousness === "grave" && <span className="font-semibold text-rose-700">, grave</span>}
          {c.kind === "effet_indesirable" && c.situations.length > 0 && `, ${c.situations.map((s) => PV_SITUATION[s].toLowerCase()).join(", ")}`}
        </p>
        <p className="text-ink text-sm font-semibold group-hover:underline">
          {capitalize(c.event)}
          {c.product_name && ` sous ${c.product_name}`}
        </p>
        <p className="text-muted-foreground text-xs">
          {c.doctor_name}, visite du {formatDate(c.deadline.known_at)}
          {showDelegue && `, ${c.delegue_name}`}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <PvDeadlineBadge deadline={c.deadline} />
          <MinimumInfoDots c={c} />
        </div>
      </div>
      <ChevronRight className="text-muted-foreground mt-1 size-4 shrink-0" />
    </Link>
  );
}

/** Les 4 informations minimales en un coup d'œil (icône + libellé, jamais la couleur seule). */
export function MinimumInfoDots({ c }: { c: PvCase }) {
  const SHORT: Record<string, string> = { produit: "Produit", evenement: "Effet", patient: "Patient", notificateur: "Médecin" };
  return (
    <span className="inline-flex flex-wrap gap-1.5" aria-label="Informations minimales">
      {c.minimum_info.map((i) => (
        <span
          key={i.key}
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
            i.found ? "border-line text-ink bg-white" : "border-rose-200 bg-rose-50 text-rose-800",
          )}
          title={i.found ? `${i.label} : ${i.value}` : `${i.label} : manquant`}
        >
          {i.found ? <Check className="size-3 text-emerald-600" /> : <X className="size-3" />}
          {SHORT[i.key]}
        </span>
      ))}
    </span>
  );
}
