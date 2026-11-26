/**
 * 📶 Bandeau du mode hors connexion (voir src/lib/offline.ts).
 *
 * - Hors connexion : « vos comptes-rendus sont gardés sur cet appareil (n en attente) ».
 * - Connexion retrouvée avec des comptes-rendus en attente : synchronisation automatique, une
 *   visite après l'autre (barre de progression), puis les indicateurs se mettent à jour.
 * L'interrupteur « Simuler une coupure réseau » sert à la démonstration.
 */
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, Loader2, RefreshCw, Wifi, WifiOff } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/api/client";
import { Button } from "@/components/ui/button";
import { invalidateVisitData } from "@/hooks/queries";
import { offlineStore, useOffline } from "@/lib/offline";
import { cn } from "@/lib/utils";

export function OfflineBanner() {
  const { offline, simulated, queue } = useOffline();
  const queryClient = useQueryClient();
  const [syncing, setSyncing] = useState<{ done: number; total: number } | null>(null);
  const running = useRef(false);

  const sync = async () => {
    if (running.current) return;
    const items = offlineStore.get().queue;
    if (!items.length) return;
    running.current = true;
    setSyncing({ done: 0, total: items.length });
    let ok = 0;
    for (const [i, item] of items.entries()) {
      try {
        await api.submitReport(item.visitId, item.payload);
        offlineStore.remove(item.visitId);
        ok += 1;
      } catch (e) {
        toast.error(`Compte-rendu de ${item.doctorName} non envoyé`, { description: (e as Error).message });
      }
      setSyncing({ done: i + 1, total: items.length });
      // Petite pause : la progression reste lisible pendant la démonstration
      await new Promise((r) => setTimeout(r, 450));
    }
    invalidateVisitData(queryClient);
    running.current = false;
    setSyncing(null);
    if (ok) toast.success(`${ok} compte${ok > 1 ? "s" : ""}-rendu${ok > 1 ? "s" : ""} synchronisé${ok > 1 ? "s" : ""}`, { description: "Les indicateurs sont à jour." });
  };

  // Retour de la connexion : on envoie automatiquement ce qui attend
  useEffect(() => {
    if (!offline && queue.length && !running.current) void sync();
  }, [offline]);

  if (!offline && !queue.length && !syncing) return null;

  return (
    <div
      role="status"
      className={cn(
        "noor-enter mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-4 py-3 text-sm",
        offline ? "border-ink/15 bg-ink text-white" : "border-mint bg-mint-wash text-ink",
      )}
    >
      {offline ? <WifiOff className="size-4 shrink-0" /> : syncing ? <Loader2 className="text-pine size-4 animate-spin" /> : <Wifi className="text-pine size-4" />}
      <p className="min-w-0 flex-1">
        {offline ? (
          <>
            <span className="font-medium">Hors connexion{simulated ? " (coupure simulée pour la démonstration)" : ""}.</span>{" "}
            Vos comptes-rendus sont gardés sur cet appareil
            {queue.length ? ` : ${queue.length} en attente d'envoi (${queue.map((q) => q.doctorName).join(", ")})` : ""}. Ils
            partiront dès le retour du réseau.
          </>
        ) : syncing ? (
          <>
            <span className="font-medium">Connexion retrouvée.</span> Synchronisation {syncing.done} sur {syncing.total}…
          </>
        ) : (
          <>
            <span className="font-medium">{queue.length} compte(s)-rendu(s) en attente d'envoi.</span>
          </>
        )}
      </p>
      {syncing && (
        <span className="bg-pine/15 h-1.5 w-28 overflow-hidden rounded-full" aria-hidden="true">
          <span className="bg-pine block h-full transition-[width] duration-300" style={{ width: `${(syncing.done / syncing.total) * 100}%` }} />
        </span>
      )}
      {simulated && (
        <Button size="sm" variant="outline" className="border-white/30 bg-white/5 text-white hover:bg-white/10 hover:text-white" onClick={() => offlineStore.setSimulated(false)}>
          <Wifi /> Rétablir la connexion
        </Button>
      )}
      {!offline && !syncing && queue.length > 0 && (
        <Button size="sm" onClick={() => void sync()}>
          <RefreshCw /> Synchroniser
        </Button>
      )}
    </div>
  );
}

/** Interrupteur de démonstration (menu) : couper / rétablir la connexion. */
export function SimulateOfflineToggle({ className, onDark }: { className?: string; onDark?: boolean }) {
  const { simulated } = useOffline();
  return (
    <button
      type="button"
      onClick={() => offlineStore.setSimulated(!simulated)}
      aria-pressed={simulated}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors",
        onDark ? "text-sidebar-muted hover:bg-white/5 hover:text-white" : "text-ink hover:bg-mint-wash",
        className,
      )}
    >
      {simulated ? <Wifi className="size-4" /> : <CloudOff className="size-4" />}
      {simulated ? "Rétablir la connexion (démo)" : "Simuler une coupure réseau (démo)"}
    </button>
  );
}
