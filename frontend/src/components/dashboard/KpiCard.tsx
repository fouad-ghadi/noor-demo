/**
 * Tuile d'indicateur clé (KPI) : libellé, valeur principale, détail, et
 * optionnellement une barre de progression et un statut (icône + texte, jamais la couleur seule).
 */
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert, type LucideIcon } from "lucide-react";

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ProgressWithMarker } from "./ProgressWithMarker";

export type KpiStatus = "good" | "warning" | "critical";

const STATUS = {
  good: { icon: CheckCircle2, className: "text-emerald-700" },
  warning: { icon: CircleAlert, className: "text-amber-700" },
  critical: { icon: AlertTriangle, className: "text-rose-700" },
};

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
  const S = status ? STATUS[status.level] : null;
  return (
    <Card
      className={cn("gap-2 px-4 py-4 lg:px-5", onClick && "cursor-pointer transition hover:border-teal-300")}
      onClick={onClick}
    >
      <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium">
        <Icon className="size-4" /> {label}
      </div>
      <p className="tabular text-2xl font-semibold tracking-tight lg:text-3xl">
        {value}
        {suffix && <span className="text-muted-foreground ml-1 text-base font-normal">{suffix}</span>}
      </p>
      {progress && (
        <ProgressWithMarker value={progress.value} expected={progress.expected} tone={status?.level ?? "neutral"} />
      )}
      {(status || detail) && (
        <div className="space-y-0.5 text-xs">
          {status && S && (
            <p className={cn("flex items-center gap-1 font-medium", S.className)}>
              <S.icon className="size-3.5" /> {status.text}
            </p>
          )}
          {detail && <p className="text-muted-foreground">{detail}</p>}
        </div>
      )}
    </Card>
  );
}
