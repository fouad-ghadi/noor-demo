/**
 * Calendrier « semaine » (ordinateur) : une colonne par jour, une ligne par heure.
 * Les visites planifiées peuvent être déplacées par glisser-déposer.
 */
import { useEffect, useState, type DragEvent } from "react";
import { addDays, format, isSameDay, parseISO } from "date-fns";
import { fr } from "date-fns/locale";

import type { Visit } from "@/api/types";
import { toApiDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { visitBlockClass } from "./visitStyle";

const START_HOUR = 8;
const END_HOUR = 19;
const HOUR_HEIGHT = 64; // pixels pour une heure
const BLOCK_MINUTES = 30; // hauteur affichée d'une visite

interface Props {
  weekStart: Date; // lundi
  visits: Visit[];
  readOnly?: boolean;
  onVisitClick: (v: Visit) => void;
  onMove: (v: Visit, newDate: string) => void;
  onDayClick: (day: Date) => void;
}

/** Position verticale (px) d'une heure de la journée. */
function topFor(date: Date): number {
  const minutes = (date.getHours() - START_HOUR) * 60 + date.getMinutes();
  return (minutes / 60) * HOUR_HEIGHT;
}

export function WeekCalendar({ weekStart, visits, readOnly, onVisitClick, onMove, onDayClick }: Props) {
  // Lundi → samedi (le dimanche n'est affiché que s'il contient des visites)
  const hasSunday = visits.some((v) => parseISO(v.planned_at).getDay() === 0);
  const days = Array.from({ length: hasSunday ? 7 : 6 }, (_, i) => addDays(weekStart, i));
  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
  const [dragOverDay, setDragOverDay] = useState<number | null>(null);

  // Ligne rouge « maintenant », rafraîchie chaque minute
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  function handleDrop(e: DragEvent<HTMLDivElement>, day: Date) {
    e.preventDefault();
    setDragOverDay(null);
    const id = Number(e.dataTransfer.getData("visit-id"));
    const grabOffset = Number(e.dataTransfer.getData("grab-offset")) || 0;
    const visit = visits.find((v) => v.id === id);
    if (!visit) return;
    // Position de la souris dans la colonne → heure, arrondie au quart d'heure
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top - grabOffset;
    let minutes = Math.round(((y / HOUR_HEIGHT) * 60) / 15) * 15;
    minutes = Math.max(0, Math.min(minutes, (END_HOUR - START_HOUR) * 60 - BLOCK_MINUTES));
    const target = new Date(day);
    target.setHours(START_HOUR, 0, 0, 0);
    target.setMinutes(target.getMinutes() + minutes);
    if (target.getTime() !== parseISO(visit.planned_at).getTime()) onMove(visit, toApiDateTime(target));
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      {/* En-têtes des jours */}
      <div className="grid border-b" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
        <div />
        {days.map((d) => {
          const today = isSameDay(d, now);
          const count = visits.filter((v) => isSameDay(parseISO(v.planned_at), d) && v.status !== "annulee" && v.status !== "reportee").length;
          return (
            <button
              key={d.toISOString()}
              onClick={() => onDayClick(d)}
              className="hover:bg-muted/50 flex cursor-pointer flex-col items-center gap-0.5 border-l py-2"
              title="Voir la journée"
            >
              <span className="text-muted-foreground text-xs uppercase">{format(d, "EEE", { locale: fr })}</span>
              <span
                className={cn(
                  "flex size-8 items-center justify-center rounded-full text-sm font-semibold",
                  today && "bg-teal-700 text-white",
                )}
              >
                {format(d, "d")}
              </span>
              <span className="text-muted-foreground text-[11px]">{count ? `${count} visite${count > 1 ? "s" : ""}` : "—"}</span>
            </button>
          );
        })}
      </div>

      {/* Grille horaire */}
      <div className="max-h-[calc(100dvh-300px)] min-h-96 overflow-y-auto">
        <div className="relative grid pt-2" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}>
          {/* Colonne des heures */}
          <div>
            {hours.map((h) => (
              <div key={h} className="text-muted-foreground relative pr-2 text-right text-[11px]" style={{ height: HOUR_HEIGHT }}>
                <span className="relative -top-2">{String(h).padStart(2, "0")}:00</span>
              </div>
            ))}
          </div>

          {days.map((day, i) => {
            const dayVisits = visits.filter((v) => isSameDay(parseISO(v.planned_at), day));
            const isToday = isSameDay(day, now);
            return (
              <div
                key={day.toISOString()}
                className={cn("relative border-l", isToday && "bg-teal-50/40", dragOverDay === i && "bg-sky-50")}
                style={{ height: hours.length * HOUR_HEIGHT }}
                onDragOver={(e) => {
                  if (readOnly) return;
                  e.preventDefault();
                  setDragOverDay(i);
                }}
                onDragLeave={() => setDragOverDay(null)}
                onDrop={(e) => handleDrop(e, day)}
              >
                {/* Lignes des heures */}
                {hours.map((h) => (
                  <div key={h} className="border-b border-dashed border-slate-100" style={{ height: HOUR_HEIGHT }} />
                ))}

                {isToday && now.getHours() >= START_HOUR && now.getHours() < END_HOUR && (
                  <div className="absolute inset-x-0 z-10 h-0.5 bg-rose-500" style={{ top: topFor(now) }}>
                    <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-rose-500" />
                  </div>
                )}

                {dayVisits.map((v) => {
                  const start = parseISO(v.planned_at);
                  const draggable = !readOnly && v.status === "planifiee";
                  return (
                    <button
                      key={v.id}
                      draggable={draggable}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("visit-id", String(v.id));
                        e.dataTransfer.setData("grab-offset", String(e.clientY - e.currentTarget.getBoundingClientRect().top));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onClick={() => onVisitClick(v)}
                      className={cn(
                        "absolute inset-x-1 z-[5] cursor-pointer overflow-hidden rounded-md border px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-xs transition hover:z-20 hover:shadow-md",
                        visitBlockClass(v),
                        draggable && "cursor-grab active:cursor-grabbing",
                      )}
                      style={{ top: topFor(start) + 1, height: (BLOCK_MINUTES / 60) * HOUR_HEIGHT - 2 }}
                      title={`${format(start, "HH:mm")} — ${v.doctor_name} (${v.doctor_specialty})`}
                    >
                      <span className="font-semibold">{format(start, "HH:mm")}</span> {v.doctor_name.replace("Dr ", "")}
                      <span className="block truncate opacity-70">{v.doctor_district}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
