/**
 * Historique des visites d'un médecin, sous forme de frise verticale :
 * date, statut, produits présentés, retour du médecin, objections, échantillons, notes.
 */
import { Clock, FileText, MessageSquareWarning, Package, StickyNote } from "lucide-react";
import { Link } from "react-router-dom";

import type { Visit } from "@/api/types";
import { VisitStatusBadge } from "@/components/shared/badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatTime } from "@/lib/format";
import { FEEDBACK, PRESCRIPTION_FEEDBACK } from "@/lib/labels";
import { cn } from "@/lib/utils";

const DOT_COLOR: Record<Visit["status"], string> = {
  realisee: "bg-emerald-500",
  planifiee: "bg-sky-500",
  annulee: "bg-rose-400",
  reportee: "bg-amber-400",
};

export function VisitHistoryItem({ visit, readOnly = false }: { visit: Visit; readOnly?: boolean }) {
  const date = visit.actual_at ?? visit.planned_at;
  return (
    <li className="relative pb-6 pl-7 last:pb-0">
      {/* Trait vertical + pastille de la frise */}
      <span className="bg-line absolute top-2 bottom-0 left-[5px] w-0.5" aria-hidden />
      <span
        className={cn("absolute top-1.5 left-0 size-[11px] rounded-full ring-4 ring-white", DOT_COLOR[visit.status],
          visit.report_pending && "bg-orange-500")}
        aria-hidden
      />

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-medium">
          {formatDate(date)} <span className="text-muted-foreground font-normal">à {formatTime(date)}</span>
        </p>
        <VisitStatusBadge status={visit.status} pending={visit.report_pending} />
        {visit.report_source === "dictee" && <Badge variant="outline">🎤 Dicté</Badge>}
        {visit.feedback && (
          <span className={cn("text-xs font-medium", FEEDBACK[visit.feedback].className)}>
            {FEEDBACK[visit.feedback].emoji} {FEEDBACK[visit.feedback].label}
          </span>
        )}
      </div>

      {visit.status === "realisee" && (
        <div className="border-line mt-2 space-y-2 rounded-lg border bg-white p-3 text-sm">
          <div className="flex flex-wrap items-center gap-1.5">
            <Package className="text-muted-foreground size-3.5" />
            {visit.products.map((p) => (
              <Badge key={p.product_id} variant="secondary">
                {p.brand_name}
              </Badge>
            ))}
            {visit.duration_min && (
              <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
                <Clock className="size-3" /> {visit.duration_min} min
              </span>
            )}
          </div>

          {visit.prescription_feedback && (
            <p className="text-ink text-xs font-medium">{PRESCRIPTION_FEEDBACK[visit.prescription_feedback]}</p>
          )}

          {visit.objections.length > 0 && (
            <div className="space-y-1">
              {visit.objections.map((o, i) => (
                <p key={i} className="flex gap-2 text-xs">
                  <MessageSquareWarning className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                  <span>
                    <span className="font-medium text-amber-800">{o.label}</span>
                    {o.comment && <span className="text-muted-foreground"> — « {o.comment} »</span>}
                  </span>
                </p>
              ))}
            </div>
          )}

          {visit.notes && (
            <p className="flex gap-2 text-xs leading-relaxed">
              <StickyNote className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
              <span>{visit.notes}</span>
            </p>
          )}

          {(visit.samples.length > 0 || visit.next_step) && (
            <div className="text-muted-foreground border-line flex flex-wrap gap-x-4 gap-y-1 border-t pt-2 text-xs">
              {visit.samples.length > 0 && (
                <span>
                  Échantillons :{" "}
                  {visit.samples
                    .map((s) => `${s.brand_name} ×${s.quantity}${s.lot_number ? ` (lot ${s.lot_number})` : ""}`)
                    .join(", ")}
                </span>
              )}
              {visit.next_step && <span>Suite : {visit.next_step}</span>}
            </div>
          )}
        </div>
      )}

      {(visit.status === "annulee" || visit.status === "reportee") && visit.cancel_reason && (
        <p className="text-muted-foreground mt-1 text-xs">Motif : {visit.cancel_reason}</p>
      )}
      {visit.status === "planifiee" && visit.notes && (
        <p className="text-muted-foreground mt-1 text-xs">Objectif : {visit.notes}</p>
      )}

      {visit.report_pending && !readOnly && (
        <Button asChild size="sm" className="mt-2">
          <Link to={`/visites/${visit.id}/compte-rendu`}>
            <FileText /> Rédiger le compte-rendu
          </Link>
        </Button>
      )}
    </li>
  );
}

export function VisitHistory({ visits, readOnly }: { visits: Visit[]; readOnly?: boolean }) {
  return (
    <ol>
      {visits.map((v) => (
        <VisitHistoryItem key={v.id} visit={v} readOnly={readOnly} />
      ))}
    </ol>
  );
}
