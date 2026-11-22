/**
 * Délai de déclaration de 24 h d'un cas de pharmacovigilance.
 * Pour un cas à déclarer, le temps restant est recalculé chaque minute (compte à rebours).
 */
import { useEffect, useState } from "react";
import { Clock } from "lucide-react";

import type { PvDeadline, PvDeadlineState } from "@/api/types";
import { formatDateTime } from "@/lib/format";
import { PV_DEADLINE } from "@/lib/labels";
import { cn } from "@/lib/utils";

const URGENT_MINUTES = 6 * 60; // même seuil que le backend (pharmacovigilance_service.py)

/** 1 230 minutes → « 20 h 30 min » ; 3 000 → « 2 j 2 h ». */
export function formatDuration(minutes: number): string {
  const m = Math.abs(Math.round(minutes));
  const days = Math.floor(m / 1440);
  const hours = Math.floor((m % 1440) / 60);
  const mins = m % 60;
  if (days > 0) return hours ? `${days} j ${hours} h` : `${days} j`;
  if (hours > 0) return `${hours} h ${String(mins).padStart(2, "0")} min`;
  return `${mins} min`;
}

/** État du délai, recalculé en direct pour un cas encore à déclarer. */
export function useLiveDeadline(deadline: PvDeadline): { state: PvDeadlineState; minutesLeft: number } {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const live = deadline.state === "a_temps" || deadline.state === "urgent" || deadline.state === "en_retard";
  useEffect(() => {
    if (!live) return;
    const timer = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [live]);
  if (!live) return { state: deadline.state, minutesLeft: 0 };
  const minutesLeft = Math.floor((new Date(deadline.deadline_at).getTime() - nowMs) / 60_000);
  const state: PvDeadlineState = minutesLeft < 0 ? "en_retard" : minutesLeft < URGENT_MINUTES ? "urgent" : "a_temps";
  return { state, minutesLeft };
}

/** Phrase courte : « Reste 20 h 30 min », « En retard de 2 j », « Déclarée dans les 24 h ». */
export function deadlineText(state: PvDeadlineState, minutesLeft: number): string {
  if (state === "a_temps" || state === "urgent") return `Reste ${formatDuration(minutesLeft)} pour déclarer`;
  if (state === "en_retard") return `Délai de 24 h dépassé de ${formatDuration(minutesLeft)}`;
  return PV_DEADLINE[state].label;
}

export function PvDeadlineBadge({ deadline, className, showDate }: { deadline: PvDeadline; className?: string; showDate?: boolean }) {
  const { state, minutesLeft } = useLiveDeadline(deadline);
  const tone = {
    a_temps: "border-sky-200 bg-sky-50 text-sky-900",
    urgent: "border-orange-200 bg-orange-50 text-orange-900",
    en_retard: "border-rose-200 bg-rose-50 text-rose-900",
    declaree_a_temps: "border-emerald-200 bg-emerald-50 text-emerald-900",
    declaree_en_retard: "border-line bg-white text-ink",
  }[state];
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", tone, className)}
      title={`Échéance : ${formatDateTime(deadline.deadline_at)}`}
    >
      <Clock className="size-3.5" aria-hidden="true" />
      {deadlineText(state, minutesLeft)}
      {showDate && (state === "a_temps" || state === "urgent") && <span className="font-normal">, avant le {formatDateTime(deadline.deadline_at)}</span>}
    </span>
  );
}
