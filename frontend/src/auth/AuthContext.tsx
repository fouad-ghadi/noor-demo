/**
 * Utilisateur connecté (connexion simulée).
 *
 * L'utilisateur est gardé dans le localStorage du navigateur : on reste connecté
 * après un rechargement de page. Le client API lit cet utilisateur pour envoyer
 * l'en-tête X-User-Id au backend.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { api } from "@/api/client";
import type { User } from "@/api/types";

interface AuthState {
  user: User | null;
  isSupervisor: boolean;
  login: (user: User) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function readStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(api.storageKey);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(readStoredUser);
  const queryClient = useQueryClient();

  const login = useCallback(
    (u: User) => {
      localStorage.setItem(api.storageKey, JSON.stringify(u));
      queryClient.clear(); // on vide le cache de l'utilisateur précédent
      setUser(u);
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(api.storageKey);
    queryClient.clear();
    setUser(null);
  }, [queryClient]);

  const value = useMemo(
    () => ({ user, isSupervisor: user?.role === "superviseur", login, logout }),
    [user, login, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Accès à l'utilisateur connecté depuis n'importe quel composant. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth doit être utilisé dans <AuthProvider>");
  return ctx;
}

/** Variante qui garantit un utilisateur (pages protégées). */
export function useCurrentUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error("Aucun utilisateur connecté");
  return user;
}
