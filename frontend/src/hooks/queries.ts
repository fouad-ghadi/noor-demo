/**
 * Requêtes partagées (React Query). Les « queryKey » servent aussi à invalider
 * le cache après une modification : voir `invalidateVisitData`.
 */
import { useQuery, type QueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";

/** Listes de référence (spécialités, villes, catégories d'objections...). */
export const useMeta = () => useQuery({ queryKey: ["meta"], queryFn: api.meta, staleTime: Infinity });

export const useProducts = () => useQuery({ queryKey: ["products"], queryFn: api.products, staleTime: Infinity });

/** Délégués visibles (pour un superviseur : son équipe). */
export const useTeamUsers = () => useQuery({ queryKey: ["team-users"], queryFn: api.team, staleTime: Infinity });

/**
 * Après toute modification d'une visite, on recharge tout ce qui en dépend :
 * planning, fiche médecin, tableau de bord (KPIs), objectifs, alertes.
 */
export function invalidateVisitData(queryClient: QueryClient) {
  for (const key of ["visits", "visit", "doctor", "doctors", "dashboard", "objectives", "alerts", "team-stats", "product", "recommendations"]) {
    queryClient.invalidateQueries({ queryKey: [key] });
  }
}
