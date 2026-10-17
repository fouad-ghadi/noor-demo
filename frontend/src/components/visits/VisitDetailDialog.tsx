/**
 * Détail d'une visite (clic dans le planning ou l'agenda du jour) + actions :
 * rédiger le compte-rendu, déplacer, annuler / reporter, itinéraire, fiche médecin.
 */
import { CalendarClock, CalendarX2, FileText, MapPin, Navigation, Stethoscope } from "lucide-react";
import { Link } from "react-router-dom";

import type { Visit } from "@/api/types";
import { SegmentBadge, VisitStatusBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { daysFromToday, formatLongDay, formatTime } from "@/lib/format";
import { VisitHistoryItem } from "./VisitHistory";

interface Props {
  visit: Visit | null;
  readOnly?: boolean;
  onOpenChange: (open: boolean) => void;
  onMove: (v: Visit) => void;
  onCancel: (v: Visit) => void;
}

/** Lien d'itinéraire Google Maps vers le cabinet (pratique sur le terrain). */
export function directionsUrl(v: Pick<Visit, "doctor_latitude" | "doctor_longitude" | "doctor_address" | "doctor_city">) {
  const dest =
    v.doctor_latitude && v.doctor_longitude
      ? `${v.doctor_latitude},${v.doctor_longitude}`
      : encodeURIComponent(`${v.doctor_address}, ${v.doctor_city}`);
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

export function VisitDetailDialog({ visit, readOnly, onOpenChange, onMove, onCancel }: Props) {
  if (!visit) return null;
  const isPlanned = visit.status === "planifiee";
  // Compte-rendu possible pour une visite planifiée aujourd'hui ou dans le passé
  const canReport = isPlanned && daysFromToday(visit.planned_at) <= 0;

  return (
    <Dialog open={!!visit} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            {visit.doctor_name} <SegmentBadge segment={visit.doctor_segment} />
          </DialogTitle>
          <DialogDescription className="first-letter:uppercase">
            {formatLongDay(visit.planned_at)} à {formatTime(visit.planned_at)} · {visit.doctor_specialty}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2">
            <MapPin className="text-muted-foreground mt-0.5 size-4 shrink-0" />
            <span>
              {visit.doctor_address}
              <span className="text-muted-foreground">
                {" "}
                — {visit.doctor_district}, {visit.doctor_city}
              </span>
            </span>
          </div>
          {visit.status === "realisee" ? (
            <ol>
              <VisitHistoryItem visit={visit} readOnly />
            </ol>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <VisitStatusBadge status={visit.status} pending={visit.report_pending} />
              {visit.cancel_reason && <span className="text-muted-foreground text-xs">Motif : {visit.cancel_reason}</span>}
              {visit.notes && <p className="text-muted-foreground w-full text-xs">Objectif : {visit.notes}</p>}
            </div>
          )}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {!readOnly && (canReport || visit.status === "realisee") && (
            <Button asChild className="sm:col-span-2">
              <Link to={`/visites/${visit.id}/compte-rendu`}>
                <FileText /> {visit.status === "realisee" ? "Modifier le compte-rendu" : "Rédiger le compte-rendu"}
              </Link>
            </Button>
          )}
          {!readOnly && isPlanned && (
            <>
              <Button variant="outline" onClick={() => onMove(visit)}>
                <CalendarClock /> Déplacer
              </Button>
              <Button variant="outline" className="text-rose-700 hover:text-rose-800" onClick={() => onCancel(visit)}>
                <CalendarX2 /> Annuler / reporter
              </Button>
            </>
          )}
          <Button variant="outline" asChild>
            <Link to={`/medecins/${visit.doctor_id}`}>
              <Stethoscope /> Fiche médecin
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <a href={directionsUrl(visit)} target="_blank" rel="noreferrer">
              <Navigation /> Itinéraire
            </a>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
