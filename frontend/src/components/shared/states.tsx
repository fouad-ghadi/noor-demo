/** États génériques : chargement, erreur, liste vide. */
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { NoorMark } from "@/components/brand/NoorMark";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-8 w-1/3" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message =
    error instanceof Error ? error.message : "Une erreur est survenue. Vérifiez que le backend est démarré.";
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 p-8 text-center">
      <AlertTriangle className="size-8 text-rose-600" />
      <div>
        <p className="font-medium text-rose-900">Impossible de charger les données</p>
        <p className="text-sm text-rose-700">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Réessayer
        </Button>
      )}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="border-line flex flex-col items-center gap-2 rounded-xl border border-dashed bg-white/60 p-8 text-center">
      {/* L'étoile NOOR, en filigrane menthe */}
      <NoorMark className="size-9" color="#C9EDE5" core="#FFFFFF" />
      <p className="font-display text-ink text-[17px] font-semibold">{title}</p>
      {description && <p className="text-muted-foreground text-sm">{description}</p>}
      {action}
    </div>
  );
}
