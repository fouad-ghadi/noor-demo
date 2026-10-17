/** Agenda du jour : visites d'aujourd'hui dans l'ordre de la tournée. */
import { CalendarDays, CalendarPlus, FileText, Navigation } from "lucide-react";
import { Link } from "react-router-dom";

import type { Visit } from "@/api/types";
import { SegmentBadge, VisitStatusBadge } from "@/components/shared/badges";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { directionsUrl } from "@/components/visits/VisitDetailDialog";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Props {
  visits: Visit[];
  readOnly?: boolean;
  onVisitClick: (v: Visit) => void;
  onPlan?: () => void;
}

export function TodayAgenda({ visits, readOnly, onVisitClick, onPlan }: Props) {
  const active = visits.filter((v) => v.status !== "annulee" && v.status !== "reportee");
  const done = active.filter((v) => v.status === "realisee").length;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarDays className="size-4 text-teal-700" /> Agenda du jour
        </CardTitle>
        <CardDescription>
          {active.length === 0 ? "Aucune visite prévue aujourd'hui" : `${done} / ${active.length} visite(s) réalisée(s)`}
        </CardDescription>
        <CardAction>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/planning?vue=jour">Voir la carte</Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {visits.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-6 text-center">
            <p className="text-muted-foreground text-sm">Pas de visite aujourd'hui.</p>
            {!readOnly && onPlan && (
              <Button size="sm" variant="outline" onClick={onPlan}>
                <CalendarPlus /> Planifier une visite
              </Button>
            )}
          </div>
        ) : (
          <ol className="relative space-y-1">
            {visits.map((v) => {
              const cancelled = v.status === "annulee" || v.status === "reportee";
              return (
                <li
                  key={v.id}
                  onClick={() => onVisitClick(v)}
                  className={cn(
                    "hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2.5",
                    cancelled && "opacity-55",
                  )}
                >
                  <span
                    className={cn(
                      "tabular w-12 shrink-0 text-sm font-semibold",
                      v.status === "realisee" && "text-muted-foreground line-through decoration-emerald-500",
                    )}
                  >
                    {formatTime(v.planned_at)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className={cn("truncate text-sm font-medium", cancelled && "line-through")}>{v.doctor_name}</p>
                      <SegmentBadge segment={v.doctor_segment} className="h-5" />
                    </div>
                    <p className="text-muted-foreground truncate text-xs">
                      {v.doctor_specialty} · {v.doctor_district}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {v.report_pending && !readOnly ? (
                      <Button asChild size="sm">
                        <Link to={`/visites/${v.id}/compte-rendu`}>
                          <FileText /> <span className="hidden sm:inline">Compte-rendu</span>
                        </Link>
                      </Button>
                    ) : v.status === "planifiee" ? (
                      <Button asChild size="icon" variant="ghost" aria-label="Itinéraire">
                        <a href={directionsUrl(v)} target="_blank" rel="noreferrer">
                          <Navigation className="text-teal-700" />
                        </a>
                      </Button>
                    ) : (
                      <VisitStatusBadge status={v.status} />
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
