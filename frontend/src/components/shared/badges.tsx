/** Badges colorés réutilisés partout (segment, statut de visite, prescription...). */
import type { AlertSeverity, PrescribingStatus, ProgressStatus, Segment, VisitStatus } from "@/api/types";
import { Badge } from "@/components/ui/badge";
import { PRESCRIBING, PROGRESS_STATUS, SEGMENT, SEVERITY, VISIT_STATUS } from "@/lib/labels";
import { cn } from "@/lib/utils";

export function SegmentBadge({ segment, className }: { segment: Segment; className?: string }) {
  return (
    <Badge
      variant="outline"
      title={SEGMENT[segment].label}
      className={cn("w-6 justify-center px-0 font-semibold", SEGMENT[segment].className, className)}
    >
      {segment}
    </Badge>
  );
}

export function VisitStatusBadge({ status, pending }: { status: VisitStatus; pending?: boolean }) {
  if (pending) {
    return (
      <Badge variant="outline" className="border-orange-200 bg-orange-50 text-orange-700">
        Compte-rendu à faire
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className={VISIT_STATUS[status].className}>
      {VISIT_STATUS[status].label}
    </Badge>
  );
}

export function PrescribingBadge({ status }: { status: PrescribingStatus }) {
  return (
    <Badge variant="outline" className={PRESCRIBING[status].className}>
      <span className={cn("size-1.5 rounded-full", PRESCRIBING[status].dot)} />
      {PRESCRIBING[status].label}
    </Badge>
  );
}

export function SeverityBadge({ severity }: { severity: AlertSeverity }) {
  return (
    <Badge variant="outline" className={SEVERITY[severity].className}>
      {SEVERITY[severity].label}
    </Badge>
  );
}

export function ProgressStatusBadge({ status }: { status: ProgressStatus }) {
  return (
    <Badge variant="outline" className={PROGRESS_STATUS[status].className}>
      {PROGRESS_STATUS[status].label}
    </Badge>
  );
}
