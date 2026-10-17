/**
 * Indicateurs clés (KPIs).
 *
 * Les KPIs ne sont plus des cartes séparées : ils partagent UN panneau (`KpiStrip`),
 * découpé en cases par de fines lignes. Chaque case (`KpiCard`) affiche un libellé,
 * la valeur principale, un détail, et optionnellement une barre de progression et
 * un statut (icône + texte, jamais la couleur seule).
 */
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { ProgressWithMarker } from "./ProgressWithMarker";

export type KpiStatus = "good" | "warning" | "critical";

export const KPI_STATUS = {
  good: { icon: CheckCircle2, className: "text-emerald-700", onDark: "text-mint" },
  warning: { icon: CircleAlert, className: "text-amber-700", onDark: "text-amber-200" },
  critical: { icon: AlertTriangle, className: "text-rose-700", onDark: "text-rose-200" },
};

/** Panneau commun : les cases sont séparées par 1 px de bordure (astuce du « gap » sur fond bordure). */
export function KpiStrip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("bg-border grid gap-px overflow-hidden rounded-xl border", className)}>{children}</div>
  );
}

/** Ligne de statut : icône + texte. */
export function KpiStatusLine({ status, onDark = false }: { status: { level: KpiStatus; text: string }; onDark?: boolean }) {
  const S = KPI_STATUS[status.level];
  return (
    <span className={cn("flex items-center gap-1 font-medium", onDark ? S.onDark : S.className)}>
      <S.icon className="size-3.5 shrink-0" /> {status.text}
    </span>
  );
}

interface Props {
  label: string;
  icon: LucideIcon;
  value: ReactNode;
  suffix?: ReactNode; // ex. "/ 62"
  detail?: ReactNode;
  progress?: { value: number; expected?: number };
  status?: { level: KpiStatus; text: string };
  onClick?: () => void;
}

export function KpiCard({ label, icon: Icon, value, suffix, detail, progress, status, onClick }: Props) {
  const content = (
    <>
      <span className="text-muted-foreground flex items-center gap-2 text-sm">
        <Icon className="size-4" /> {label}
      </span>
      <span className="font-display tabular text-ink block text-3xl font-semibold tracking-tight">
        {value}
        {suffix && <span className="text-muted-foreground ml-1.5 font-sans text-base font-normal">{suffix}</span>}
      </span>
      {progress && (
        <ProgressWithMarker value={progress.value} expected={progress.expected} tone={status?.level ?? "neutral"} />
      )}
      {(status || detail) && (
        <span className="block space-y-0.5 text-xs">
          {status && <KpiStatusLine status={status} />}
          {detail && <span className="text-muted-foreground block">{detail}</span>}
        </span>
      )}
    </>
  );
  const cell = "bg-card flex flex-col gap-2 px-4 py-4 text-left lg:px-5";
  // Case cliquable = vrai bouton (clavier, lecteur d'écran)
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(cell, "hover:bg-accent/50 focus-visible:ring-ring cursor-pointer focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset")}
    >
      {content}
    </button>
  ) : (
    <div className={cell}>{content}</div>
  );
}
