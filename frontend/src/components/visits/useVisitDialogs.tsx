/**
 * Regroupe les fenêtres liées à une visite (détail, déplacer, annuler/reporter, préparer la visite).
 * Usage dans une page :
 *   const { openVisit, dialogs } = useVisitDialogs();
 *   ... onClick={() => openVisit(visit)} ...
 *   return <>{...}{dialogs}</>;
 */
import { useState } from "react";

import type { Visit } from "@/api/types";
import { CancelVisitDialog } from "./CancelVisitDialog";
import { RescheduleDialog } from "./RescheduleDialog";
import { VisitDetailDialog } from "./VisitDetailDialog";
import { VisitPrepSheet } from "./VisitPrepSheet";

export function useVisitDialogs({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [detail, setDetail] = useState<Visit | null>(null);
  const [moving, setMoving] = useState<Visit | null>(null);
  const [cancelling, setCancelling] = useState<Visit | null>(null);
  const [preparing, setPreparing] = useState<number | null>(null); // médecin dont on prépare la visite

  const dialogs = (
    <>
      <VisitDetailDialog
        visit={detail}
        readOnly={readOnly}
        onOpenChange={(o) => !o && setDetail(null)}
        onMove={(v) => {
          setDetail(null);
          setMoving(v);
        }}
        onCancel={(v) => {
          setDetail(null);
          setCancelling(v);
        }}
        onPrepare={(v) => {
          setDetail(null);
          setPreparing(v.doctor_id);
        }}
      />
      <VisitPrepSheet doctorId={preparing} onOpenChange={(o) => !o && setPreparing(null)} />
      <RescheduleDialog visit={moving} onOpenChange={(o) => !o && setMoving(null)} />
      <CancelVisitDialog visit={cancelling} onOpenChange={(o) => !o && setCancelling(null)} />
    </>
  );

  return { openVisit: setDetail, dialogs };
}
