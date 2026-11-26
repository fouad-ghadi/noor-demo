/**
 * 📶 Mode hors connexion (démonstration).
 *
 * Sur le terrain, le réseau coupe souvent (sous-sol d'une clinique, zone rurale). NOOR garde alors les
 * comptes-rendus sur l'appareil (localStorage), puis les envoie au serveur quand la connexion revient.
 *
 * Deux façons d'être « hors connexion » :
 *   - vraie coupure : le navigateur le signale (navigator.onLine = false) ;
 *   - coupure SIMULÉE pour la démonstration : interrupteur dans le menu (le reste de l'application
 *     continue de lire le serveur, seuls les comptes-rendus passent par la file d'attente).
 *
 * Limite assumée du prototype : seuls les comptes-rendus sont gardés hors connexion ; les pages
 * affichent les dernières données chargées. Une version complète utiliserait un « service worker ».
 */
import { useSyncExternalStore } from "react";

import type { VisitReportInput } from "@/api/types";

export interface QueuedReport {
  visitId: number;
  doctorName: string;
  payload: VisitReportInput;
  savedAt: string; // ISO
}

const QUEUE_KEY = "noor-hors-connexion";
const SIMULATED_KEY = "noor-coupure-simulee";

function readQueue(): QueuedReport[] {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as QueuedReport[];
  } catch {
    return [];
  }
}

let state = {
  queue: readQueue(),
  simulated: localStorage.getItem(SIMULATED_KEY) === "1",
  browserOnline: typeof navigator === "undefined" ? true : navigator.onLine,
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function set(next: Partial<typeof state>) {
  state = { ...state, ...next };
  localStorage.setItem(QUEUE_KEY, JSON.stringify(state.queue));
  localStorage.setItem(SIMULATED_KEY, state.simulated ? "1" : "0");
  emit();
}

window.addEventListener("online", () => set({ browserOnline: true }));
window.addEventListener("offline", () => set({ browserOnline: false }));

export const offlineStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get: () => state,
  isOffline: () => state.simulated || !state.browserOnline,
  setSimulated: (simulated: boolean) => set({ simulated }),
  /** Garde un compte-rendu sur l'appareil (remplace un éventuel brouillon de la même visite). */
  enqueue(item: QueuedReport) {
    set({ queue: [...state.queue.filter((q) => q.visitId !== item.visitId), item] });
  },
  remove(visitId: number) {
    set({ queue: state.queue.filter((q) => q.visitId !== visitId) });
  },
};

/** État du mode hors connexion, pour les composants React. */
export function useOffline() {
  const s = useSyncExternalStore(offlineStore.subscribe, offlineStore.get);
  return { offline: s.simulated || !s.browserOnline, simulated: s.simulated, queue: s.queue };
}
