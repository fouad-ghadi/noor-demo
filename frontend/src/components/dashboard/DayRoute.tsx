/**
 * La tournée du jour, dessinée comme un trajet (dans le bandeau vert pin).
 *
 * Même langage visuel que l'illustration de la page de connexion :
 *  - arrêts déjà faits : pastille menthe pleine, trait plein jusqu'à l'arrêt suivant ;
 *  - arrêt en cours (la prochaine visite planifiée) : la SEULE touche safran ;
 *  - arrêts à venir : pastille creuse, trait en pointillés ;
 *  - visites annulées / reportées : barrées, en retrait.
 * Clic sur un arrêt → fiche de la visite. Actions à droite : compte-rendu ou itinéraire.
 */
import { CalendarPlus, Check, FileText, Navigation, X } from "lucide-react";
import { Link } from "react-router-dom";

import type { Visit } from "@/api/types";
import { Button } from "@/components/ui/button";
import { directionsUrl } from "@/components/visits/VisitDetailDialog";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

type StopState = "done" | "current" | "next" | "cancelled";

interface Props {
  visits: Visit[];
  readOnly?: boolean;
  onVisitClick: (v: Visit) => void;
  onPlan?: () => void;
}

/** État de chaque arrêt : « fait » = visite réalisée OU passée (compte-rendu à rédiger). */
function stopStates(visits: Visit[]): StopState[] {
  const currentIndex = visits.findIndex((v) => v.status === "planifiee" && !v.report_pending);
  return visits.map((v, i) => {
    if (v.status === "annulee" || v.status === "reportee") return "cancelled";
    if (i === currentIndex) return "current";
    if (v.status === "realisee" || v.report_pending) return "done";
    return "next";
  });
}

export function DayRoute({ visits, readOnly, onVisitClick, onPlan }: Props) {
  const states = stopStates(visits);
  const active = states.filter((s) => s !== "cancelled").length;
  const done = states.filter((s) => s === "done").length;
  const currentIndex = states.indexOf("current");

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Tournée du jour</h2>
        <Link
          to="/planning?vue=jour"
          className="text-mint rounded text-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
        >
          Voir la carte
        </Link>
      </div>
      <p className="mt-0.5 text-sm text-white/60">
        {active === 0
          ? "Aucune visite prévue aujourd'hui."
          : done === active
            ? `Les ${active} visites du jour sont faites.`
            : `${done} visite${done > 1 ? "s" : ""} faite${done > 1 ? "s" : ""} sur ${active}`}
      </p>

      {visits.length === 0 ? (
        !readOnly &&
        onPlan && (
          <Button size="sm" variant="outline" className="mt-4 border-white/25 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={onPlan}>
            <CalendarPlus /> Planifier une visite
          </Button>
        )
      ) : (
        <ol className="mt-4">
          {visits.map((v, i) => {
            const state = states[i];
            const isLast = i === visits.length - 1;
            // Le trait vers l'arrêt suivant est « parcouru » tant qu'on n'a pas atteint l'arrêt en cours
            const travelled = currentIndex === -1 ? state !== "next" : i < currentIndex;
            return (
              <li key={v.id} className="relative flex items-start gap-3">
                {/* Rail : pastille + trait vers l'arrêt suivant */}
                {!isLast && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-[1.125rem] -bottom-[1.125rem] left-[4.25rem] w-0 -translate-x-px border-l-2",
                      travelled ? "border-mint" : "border-dashed border-white/30",
                    )}
                  />
                )}
                <button
                  type="button"
                  onClick={() => onVisitClick(v)}
                  className="group flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-lg py-2 text-left focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
                >
                  <span
                    className={cn(
                      "tabular w-12 shrink-0 pt-px text-sm font-semibold",
                      state === "current" ? "text-saffron" : state === "next" ? "text-white" : "text-white/55",
                    )}
                  >
                    {formatTime(v.planned_at)}
                  </span>
                  <StopDot state={state} />
                  <span className={cn("min-w-0 flex-1", state === "cancelled" && "opacity-50")}>
                    <span className={cn("block truncate text-[15px] font-medium group-hover:underline", state === "cancelled" && "line-through")}>
                      {v.doctor_name}
                      <span className="ml-2 align-middle text-xs font-normal text-white/50" title={`Segment ${v.doctor_segment}`}>
                        {v.doctor_segment}
                      </span>
                    </span>
                    <span className="block truncate text-[13px] text-white/60">
                      {state === "current" && <span className="text-saffron font-medium">Prochaine visite, </span>}
                      {state === "cancelled" ? (v.status === "annulee" ? "Annulée" : "Reportée") : `${v.doctor_specialty}, ${v.doctor_district}`}
                    </span>
                  </span>
                </button>
                <span className="flex shrink-0 items-center self-center">
                  <StopAction visit={v} state={state} readOnly={readOnly} />
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/** Pastille de l'arrêt (forme + couleur, et un pictogramme pour les états terminés). */
function StopDot({ state }: { state: StopState }) {
  return (
    <span className="relative z-10 mt-0.5 flex size-4 shrink-0 items-center justify-center" aria-hidden="true">
      {state === "done" && (
        <span className="bg-mint text-pine flex size-4 items-center justify-center rounded-full">
          <Check className="size-3" strokeWidth={3} />
        </span>
      )}
      {state === "current" && <span className="bg-saffron ring-saffron/30 size-4 rounded-full ring-4" />}
      {state === "next" && <span className="bg-pine size-3.5 rounded-full border-2 border-white/70" />}
      {state === "cancelled" && (
        <span className="bg-pine flex size-4 items-center justify-center rounded-full border border-white/40 text-white/60">
          <X className="size-2.5" strokeWidth={3} />
        </span>
      )}
    </span>
  );
}

function StopAction({ visit, state, readOnly }: { visit: Visit; state: StopState; readOnly?: boolean }) {
  if (visit.report_pending) {
    return readOnly ? (
      <span className="text-xs text-amber-200">Compte-rendu à faire</span>
    ) : (
      <Button asChild size="sm" className="text-pine bg-white hover:bg-white/90">
        <Link to={`/visites/${visit.id}/compte-rendu`}>
          <FileText /> <span className="hidden sm:inline">Compte-rendu</span>
          <span className="sr-only sm:hidden">Rédiger le compte-rendu</span>
        </Link>
      </Button>
    );
  }
  if (state === "current" || state === "next") {
    return (
      <Button asChild size="icon" variant="ghost" className="text-mint hover:bg-white/10 hover:text-white" aria-label={`Itinéraire vers ${visit.doctor_name}`}>
        <a href={directionsUrl(visit)} target="_blank" rel="noreferrer">
          <Navigation />
        </a>
      </Button>
    );
  }
  if (state === "done") return <span className="text-mint/80 pr-1 text-xs">Faite</span>;
  return null;
}
