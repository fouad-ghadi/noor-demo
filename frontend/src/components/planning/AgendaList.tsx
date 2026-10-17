/**
 * Liste chronologique des visites, groupées par jour.
 * Utilisée pour la vue « jour », et pour la vue « semaine » sur mobile.
 */
import { isSameDay, isToday, parseISO } from "date-fns";
import { ChevronRight, FileText } from "lucide-react";
import { Link } from "react-router-dom";

import type { Visit } from "@/api/types";
import { SegmentBadge, VisitStatusBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { formatRelativeDay, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  days: Date[];
  visits: Visit[];
  readOnly?: boolean;
  onVisitClick: (v: Visit) => void;
  numbered?: boolean; // numérotation (correspond aux marqueurs de la carte)
}

export function AgendaList({ days, visits, readOnly, onVisitClick, numbered }: Props) {
  return (
    <div className="space-y-5">
      {days.map((day) => {
        const dayVisits = visits.filter((v) => isSameDay(parseISO(v.planned_at), day));
        if (days.length > 1 && dayVisits.length === 0) return null;
        let n = 0;
        return (
          <section key={day.toISOString()}>
            {days.length > 1 && (
              <h3 className={cn("font-display text-ink mb-2 flex items-center gap-2 text-[15px] font-semibold first-letter:uppercase", isToday(day) && "text-saffron-ink")}>
                {isToday(day) && <span className="bg-saffron size-2 rounded-full" aria-hidden="true" />}
                {formatRelativeDay(day)}
              </h3>
            )}
            {dayVisits.length === 0 && (
              <p className="text-muted-foreground border-line rounded-xl border border-dashed p-6 text-center text-sm">
                Aucune visite ce jour-là.
              </p>
            )}
            <div className="divide-line border-line divide-y overflow-hidden rounded-xl border bg-white">
              {dayVisits.map((v) => {
                const active = v.status !== "annulee" && v.status !== "reportee";
                if (active) n += 1;
                return (
                  <div
                    key={v.id}
                    onClick={() => onVisitClick(v)}
                    className={cn(
                      "hover:bg-mint-wash/50 flex cursor-pointer items-center gap-3 px-3 py-3 transition-colors",
                      !active && "opacity-60",
                    )}
                  >
                    <div className="w-12 shrink-0 text-center">
                      <p className="tabular text-sm font-semibold">{formatTime(v.planned_at)}</p>
                      {numbered && active && (
                        <span className="bg-pine mx-auto mt-0.5 flex size-5 items-center justify-center rounded-full text-[10px] font-bold text-white">
                          {n}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className={cn("truncate text-sm font-medium", !active && "line-through")}>{v.doctor_name}</p>
                        <SegmentBadge segment={v.doctor_segment} className="size-5 text-[10px]" />
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        {v.doctor_specialty}, {v.doctor_district}
                      </p>
                      <div className="mt-1">
                        <VisitStatusBadge status={v.status} pending={v.report_pending} />
                      </div>
                    </div>
                    {v.report_pending && !readOnly ? (
                      <Button asChild size="sm" onClick={(e) => e.stopPropagation()}>
                        <Link to={`/visites/${v.id}/compte-rendu`}>
                          <FileText /> <span className="hidden sm:inline">Compte-rendu</span>
                        </Link>
                      </Button>
                    ) : (
                      <ChevronRight className="text-muted-foreground size-4 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
