/** Liste des alertes ouvertes (gravité = icône + libellé, jamais la couleur seule). */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bell, Check, CircleAlert, Info } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { Alert } from "@/api/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const SEVERITY = {
  haute: { icon: AlertTriangle, label: "Haute", className: "text-rose-700 bg-rose-50" },
  moyenne: { icon: CircleAlert, label: "Moyenne", className: "text-amber-700 bg-amber-50" },
  faible: { icon: Info, label: "Faible", className: "text-slate-600 bg-secondary" },
};

const TYPE_LABEL: Record<Alert["type"], string> = {
  medecin_non_visite: "Médecin non visité",
  objectif_en_retard: "Objectif",
  compte_rendu_en_retard: "Compte-rendu",
  pharmacovigilance: "Pharmacovigilance",
};

export function AlertsList({ alerts, readOnly }: { alerts: Alert[]; readOnly?: boolean }) {
  const queryClient = useQueryClient();
  const resolve = useMutation({
    mutationFn: (id: number) => api.updateAlert(id, "traitee"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["alerts"] });
      toast.success("Alerte marquée comme traitée");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="size-4 text-pine" /> Alertes
        </CardTitle>
        <CardDescription>{alerts.length ? `${alerts.length} alerte(s) ouverte(s)` : "Aucune alerte"}</CardDescription>
      </CardHeader>
      <CardContent className="divide-line divide-y">
        {alerts.length === 0 && (
          <p className="text-muted-foreground border-line rounded-lg border border-dashed p-6 text-center text-sm">Rien à signaler.</p>
        )}
        {alerts.map((a) => {
          const S = SEVERITY[a.severity];
          const target = a.visit_id && a.type === "compte_rendu_en_retard"
            ? `/visites/${a.visit_id}/compte-rendu`
            : a.doctor_id
              ? `/medecins/${a.doctor_id}`
              : "/objectifs";
          return (
            <div key={a.id} className="group flex gap-3 py-3 first:pt-0 last:pb-0">
              <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full", S.className)}>
                <S.icon className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-muted-foreground text-xs">
                  <span className="text-foreground/80 font-medium">{TYPE_LABEL[a.type]}</span>, gravité {S.label.toLowerCase()},{" "}
                  {formatAgo(a.created_at)}
                </p>
                <Link to={target} className={cn("text-ink block text-sm hover:underline", a.status === "nouvelle" ? "font-semibold" : "font-medium")}>
                  {a.status === "nouvelle" && <span className="bg-pine mr-1.5 inline-block size-1.5 rounded-full align-middle" title="Nouvelle" />}
                  {a.title}
                </Link>
                {a.message && <p className="text-muted-foreground text-xs">{a.message}</p>}
              </div>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0"
                  title="Marquer comme traitée"
                  aria-label="Marquer comme traitée"
                  onClick={() => resolve.mutate(a.id)}
                >
                  <Check />
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
