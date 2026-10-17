/**
 * Badges réutilisés partout (segment, statut de visite, prescription...).
 *
 * Statuts : pastille ronde blanche, point de couleur + libellé (jamais la couleur seule).
 * Segment : petite tuile carrée A / B / C, du pin plein (A) au contour (C).
 */
import type { AlertSeverity, PrescribingStatus, ProgressStatus, Segment, VisitStatus } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { PRESCRIBING, PROGRESS_STATUS, SEGMENT, SEVERITY, VISIT_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function SegmentBadge({ segment, className }: { segment: Segment; className?: string }) {
  return (
    <span
      title={SEGMENT[segment].label}
      aria-label={SEGMENT[segment].label}
      className={cn(
        "font-display inline-flex size-6 shrink-0 items-center justify-center rounded-md border text-xs font-bold",
        SEGMENT[segment].className,
        className,
      )}
    >
      {segment}
    </span>
  );
}

/** Pastille de statut : point de couleur + libellé. */
export function StatusPill({ dot, label, className }: { dot: string; label: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-line text-ink gap-1.5 bg-white font-medium", className)}>
      <span className={cn("size-1.5 rounded-full", dot)} />
      {label}
    </Badge>
  );
}

export function VisitStatusBadge({ status, pending }: { status: VisitStatus; pending?: boolean }) {
  if (pending) return <StatusPill dot="bg-orange-500" label="Compte-rendu à faire" />;
  return <StatusPill dot={VISIT_STATUS[status].dot} label={VISIT_STATUS[status].label} />;
}

export function PrescribingBadge({ status }: { status: PrescribingStatus }) {
  return <StatusPill dot={PRESCRIBING[status].dot} label={PRESCRIBING[status].label} />;
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return <StatusPill dot={SEVERITY[severity].dot} label={SEVERITY[severity].label} />;
}

export function ProgressStatusBadge({ status }: { status: ProgressStatus }) {
  return <StatusPill dot={PROGRESS_STATUS[status].dot} label={PROGRESS_STATUS[status].label} />;
}
