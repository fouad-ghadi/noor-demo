/**
 * Regroupe les 3 fenêtres liées à une visite (détail, déplacer, annuler/reporter).
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

export function useVisitDialogs({ readOnly = false }: { readOnly?: boolean } = {}) {
  const [detail, setDetail] = useState<Visit | null>(null);
  const [moving, setMoving] = useState<Visit | null>(null);
  const [cancelling, setCancelling] = useState<Visit | null>(null);

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
      />
      <RescheduleDialog visit={moving} onOpenChange={(o) => !o && setMoving(null)} />
      <CancelVisitDialog visit={cancelling} onOpenChange={(o) => !o && setCancelling(null)} />
    </>
  );

  return { openVisit: setDetail, dialogs };
}
