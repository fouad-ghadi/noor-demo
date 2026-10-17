/**
 * Page de connexion (page d'accueil de l'application).
 *
 * À gauche : la tournée du jour d'un délégué, dessinée sur le plan de Casablanca.
 * À droite : choix d'un profil de démonstration (un clic), ou connexion par email.
 * Mot de passe de tous les comptes : « demo ».
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { User } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { NoorMark } from "@/components/brand/NoorMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RouteIllustration } from "./RouteIllustration";

/** Vert pin profond du panneau « tournée » (le safran est réservé à l'arrêt en cours). */
const PINE = "#0F3D3E";

function Wordmark({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <NoorMark className="size-9" color={light ? "#5EEAD4" : "#0D9488"} core={light ? PINE : "#FFFFFF"} />
      <span className={cn("font-display text-xl font-bold tracking-wide", light ? "text-white" : "text-[#0E2A2B]")}>NOOR</span>
    </div>
  );
}

/** Une ligne de profil cliquable : connexion en un clic. */
function ProfileRow({ user, onPick, disabled, loading }: {
  user: User;
  onPick: () => void;
  disabled: boolean;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      className="group flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#E6F4F1] focus-visible:bg-[#E6F4F1] focus-visible:outline-none disabled:cursor-wait"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#D5EFEA] text-sm font-semibold text-[#0F3D3E]">
        {initials(user.name)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-[#0E2A2B]">{user.name}</span>
        <span className="block text-sm text-[#0E2A2B]/60">
          {user.role === "superviseur" ? "Toute l'équipe, 4 régions" : user.region}
        </span>
      </span>
      {loading ? (
        <Loader2 className="size-4 animate-spin text-[#0D9488]" />
      ) : (
        <ChevronRight className="size-4 text-[#0E2A2B]/30 transition group-hover:translate-x-0.5 group-hover:text-[#0D9488]" />
      )}
    </button>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.login(email, password),
    onSuccess: (u: User) => {
      login(u);
      toast.success(`Bienvenue, ${u.name.split(" ")[0]}`);
      navigate(u.role === "superviseur" ? "/equipe" : "/tableau-de-bord");
    },
    onError: (e: Error) => toast.error(e.message),
    onSettled: () => setPendingEmail(null),
  });
  const pick = (u: User) => {
    setPendingEmail(u.email);
    loginMutation.mutate({ email: u.email, password: "demo" });
  };

  if (user) return <Navigate to="/" replace />;

  const supervisors = users.data?.filter((u) => u.role === "superviseur") ?? [];
  const delegates = users.data?.filter((u) => u.role === "delegue") ?? [];

  return (
    <div className="grid min-h-dvh bg-[#FAFBF9] lg:grid-cols-[1.4fr_1fr]">
      {/* ------------------------------------------------------------ */}
      {/* Panneau « tournée » (ordinateur : colonne gauche ; mobile : bandeau) */}
      {/* ------------------------------------------------------------ */}
      <section className="relative overflow-hidden px-5 lg:h-dvh lg:sticky lg:top-0 pt-6 pb-8 text-white sm:px-10 lg:flex lg:flex-col lg:px-14 lg:pt-10 lg:pb-8" style={{ background: PINE }}>
        <Wordmark light />
        <div className="mt-8 max-w-xl lg:mt-10">
          <h1 className="font-display text-[2rem] leading-[1.08] font-semibold tracking-[-0.02em] text-balance sm:text-[2.6rem] lg:text-[2.9rem]">
            Votre tournée, du premier cabinet au dernier compte-rendu.
          </h1>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[#CFEDE7] lg:text-base">
            Agenda, fiches médecins, comptes-rendus et objectifs, sur votre téléphone entre deux visites.
          </p>
        </div>

        {/* La tournée (masquée sur petit écran : le texte suffit) */}
        <div className="mt-6 hidden sm:block lg:mt-auto lg:pt-4">
          <RouteIllustration className="mx-auto max-w-[600px]" />
        </div>

        <p className="mt-6 text-xs text-white/45 lg:mt-2">
          Démonstration réalisée par des étudiants de l'École Centrale Casablanca. Toutes les données sont fictives.
        </p>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* Connexion                                                      */}
      {/* ------------------------------------------------------------ */}
      <section className="flex items-start justify-center px-5 py-8 sm:px-10 lg:items-center lg:py-12">
        <div className="w-full max-w-[25rem]">
          <h2 className="font-display text-[1.75rem] font-semibold tracking-[-0.01em] text-[#0E2A2B]">Connexion</h2>
          <p className="mt-1 text-[15px] text-[#0E2A2B]/65">Choisissez un profil pour entrer dans la démonstration.</p>

          {users.isLoading && (
            <p className="mt-8 flex items-center gap-2 text-sm text-[#0E2A2B]/60">
              <Loader2 className="size-4 animate-spin" /> Chargement des profils
            </p>
          )}
          {users.isError && (
            <div className="mt-8 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
              <p className="font-medium">Le serveur ne répond pas.</p>
              <p className="mt-1">
                Démarrez le backend : dans le dossier <code>backend</code>, lancez <code>uvicorn app.main:app --reload</code>, puis rechargez la page.
              </p>
            </div>
          )}

          {users.data && (
            <div className="mt-7 space-y-6">
              <div>
                <h3 className="mb-2 text-sm font-medium text-[#0E2A2B]/70">Superviseur</h3>
                <div className="divide-y divide-[#0E2A2B]/8 overflow-hidden rounded-xl border border-[#0E2A2B]/12 bg-white">
                  {supervisors.map((u) => (
                    <ProfileRow key={u.id} user={u} onPick={() => pick(u)} disabled={loginMutation.isPending} loading={pendingEmail === u.email} />
                  ))}
                </div>
              </div>
              <div>
                <h3 className="mb-2 text-sm font-medium text-[#0E2A2B]/70">Délégués médicaux</h3>
                <div className="divide-y divide-[#0E2A2B]/8 overflow-hidden rounded-xl border border-[#0E2A2B]/12 bg-white">
                  {delegates.map((u) => (
                    <ProfileRow key={u.id} user={u} onPick={() => pick(u)} disabled={loginMutation.isPending} loading={pendingEmail === u.email} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Connexion par email (repliée par défaut) */}
          <div className="mt-6 border-t border-[#0E2A2B]/10 pt-4">
            <button
              type="button"
              onClick={() => setShowEmail((v) => !v)}
              aria-expanded={showEmail}
              className="flex cursor-pointer items-center gap-1.5 rounded text-sm font-medium text-[#0D7F75] hover:text-[#0F3D3E] focus-visible:ring-2 focus-visible:ring-[#0D9488]/40 focus-visible:outline-none"
            >
              <ChevronDown className={cn("size-4 transition-transform", showEmail && "rotate-180")} />
              Se connecter avec un email
            </button>
            {showEmail && (
              <form
                className="mt-4 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  loginMutation.mutate({ email, password });
                }}
              >
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="username" placeholder="prenom.nom@noor-demo.ma" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  <p className="text-xs text-[#0E2A2B]/55">Pour la démonstration, le mot de passe est « demo ».</p>
                </div>
                <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                  {loginMutation.isPending && !pendingEmail && <Loader2 className="animate-spin" />}
                  Se connecter
                </Button>
              </form>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
