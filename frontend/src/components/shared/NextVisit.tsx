/**
 * Date de la prochaine visite d'un médecin.
 * Si c'est aujourd'hui : point safran (« maintenant », la seule utilisation du safran).
 */
import { isToday, parseISO } from "date-fns";

import { formatRelativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export function NextVisit({ at, className }: { at: string | null; className?: string }) {
  if (!at) return <span className={cn("text-muted-foreground", className)}>Non planifiée</span>;
  const today = isToday(parseISO(at));
  return (
    <span className={cn("inline-flex items-center gap-1.5", today && "text-saffron-ink font-medium", className)}>
      {today && <span className="bg-saffron size-1.5 rounded-full" aria-hidden="true" />}
      {formatRelativeDay(at)}
    </span>
  );
}
