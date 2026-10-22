/** Médecins ciblés non vus depuis plus d'un cycle (F2 : 21 jours, F1 : 35 jours), avec bouton « Planifier ». */
import { useState } from "react";
import { CalendarCheck, CalendarPlus, UserRoundSearch } from "lucide-react";
import { Link } from "react-router-dom";

import type { Dashboard } from "@/api/types";
import { FrequencyBadge, SegmentBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PlanVisitDialog } from "@/components/visits/PlanVisitDialog";
import { formatShortDate } from "@/lib/format";

type Row = Dashboard["doctors_to_revisit"][number];

export function DoctorsToRevisit({ rows, total, readOnly }: { rows: Row[]; total: number; readOnly?: boolean }) {
  const [planning, setPlanning] = useState<Row | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserRoundSearch className="size-4 text-pine" /> Médecins à revoir
        </CardTitle>
        <CardDescription>Médecins ciblés non vus depuis plus d'un cycle : 21 jours en F2, 35 jours en F1</CardDescription>
        {total > rows.length && (
          <CardAction>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/medecins?last_visit=gt30&frequency=cible">Tout voir ({total})</Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground border-line rounded-lg border border-dashed p-6 text-center text-sm">
            Tous vos médecins ciblés ont été vus à leur rythme.
          </p>
        ) : (
          <div className="divide-line divide-y">
            {rows.map((r) => (
              <div key={r.doctor_id} className="flex items-center gap-3 py-2.5">
                <SegmentBadge segment={r.segment} />
                <Link to={`/medecins/${r.doctor_id}`} className="min-w-0 flex-1 hover:underline">
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{r.doctor_name}</span>
                    <FrequencyBadge frequency={r.frequency} />
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {r.specialty}, {r.district}
                  </p>
                </Link>
                <span className="tabular shrink-0 text-right text-xs font-medium text-rose-700">
                  {r.days_since_last_visit === null ? "Jamais vu" : `${r.days_since_last_visit} j`}
                </span>
                {r.next_visit_at ? (
                  <span className="flex w-24 shrink-0 items-center justify-end gap-1 text-xs text-pine">
                    <CalendarCheck className="size-3.5" /> {formatShortDate(r.next_visit_at)}
                  </span>
                ) : !readOnly ? (
                  <Button size="sm" variant="outline" className="w-24 shrink-0" onClick={() => setPlanning(r)}>
                    <CalendarPlus /> Planifier
                  </Button>
                ) : (
                  <span className="text-muted-foreground w-24 shrink-0 text-right text-xs">Non planifié</span>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <PlanVisitDialog
        open={!!planning}
        onOpenChange={(o) => !o && setPlanning(null)}
        doctor={planning ? { id: planning.doctor_id, name: planning.doctor_name, preferred_slot: null } : undefined}
      />
    </Card>
  );
}
