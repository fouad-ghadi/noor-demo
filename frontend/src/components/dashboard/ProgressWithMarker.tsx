/**
 * Barre de progression avec un repère « attendu à date ».
 * Ex. : 34 visites sur 62 (55 %) alors que 54 % étaient attendus aujourd'hui.
 */
import { cn } from "@/lib/utils";

interface Props {
  value: number; // % réalisé (peut dépasser 100)
  expected?: number; // % attendu à date (repère vertical)
  tone?: "good" | "warning" | "critical" | "neutral";
  className?: string;
}

const TONE = {
  good: "bg-teal-600",
  warning: "bg-amber-500",
  critical: "bg-rose-500",
  neutral: "bg-teal-600",
};

export function ProgressWithMarker({ value, expected, tone = "neutral", className }: Props) {
  return (
    <div className={cn("relative h-2 w-full rounded-full bg-slate-100", className)}>
      <div
        className={cn("h-full rounded-full transition-all", TONE[tone])}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
      {expected !== undefined && expected > 0 && expected < 100 && (
        <div
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-slate-700"
          style={{ left: `calc(${expected}% - 1px)` }}
          title={`Attendu à date : ${Math.round(expected)} %`}
        />
      )}
    </div>
  );
}

/** Ton (couleur) selon le rapport réalisé / attendu. */
export function paceTone(value: number, expected: number): "good" | "warning" | "critical" {
  if (expected <= 0) return "good";
  const ratio = value / expected;
  if (ratio >= 0.95) return "good";
  if (ratio >= 0.8) return "warning";
  return "critical";
}
