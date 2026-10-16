/**
 * Connexion simulée : on choisit un profil de démo, ou on saisit email + mot de passe.
 * Mot de passe de tous les comptes : « demo ».
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowRight, Loader2, MapPin, ShieldCheck } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { User } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { Logo } from "@/components/layout/Logo";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.login(email, password),
    onSuccess: (u: User) => {
      login(u);
      toast.success(`Bienvenue, ${u.name.split(" ")[0]} !`);
      navigate(u.role === "superviseur" ? "/equipe" : "/tableau-de-bord");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (user) return <Navigate to="/" replace />;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panneau de marque (ordinateur uniquement) */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-teal-800 via-teal-700 to-cyan-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <Logo light />
        <div className="relative z-10 max-w-md space-y-5">
          <h1 className="text-4xl leading-tight font-semibold">
            Le CRM des délégués médicaux, pensé pour le terrain.
          </h1>
          <p className="text-teal-100">
            Planifiez vos visites, rédigez vos comptes-rendus en quelques secondes et suivez vos objectifs —
            depuis votre téléphone, chez le médecin.
          </p>
          <div className="grid grid-cols-3 gap-4 pt-4">
            {[
              ["Agenda", "visites du jour et de la semaine"],
              ["Comptes-rendus", "objections, échantillons, suites"],
              ["Objectifs", "suivi en temps réel"],
            ].map(([n, l]) => (
              <div key={n} className="rounded-xl bg-white/10 p-4 backdrop-blur">
                <p className="font-semibold">{n}</p>
                <p className="text-xs text-teal-100">{l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs text-teal-200">
          <ShieldCheck className="size-4" /> Version de démonstration — données fictives
        </p>
        <div className="absolute -right-24 -bottom-24 size-96 rounded-full bg-white/5" />
        <div className="absolute top-20 -right-10 size-56 rounded-full bg-white/5" />
      </div>

      {/* Formulaire */}
      <div className="flex items-center justify-center bg-white px-5 py-10 sm:px-10">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden">
            <Logo />
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Connexion</h2>
            <p className="text-muted-foreground text-sm">Choisissez un profil de démonstration.</p>
          </div>

          <div className="space-y-2">
            {users.isLoading && <p className="text-muted-foreground text-sm">Chargement des profils…</p>}
            {users.isError && (
              <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">
                Le backend ne répond pas. Lancez <code>uvicorn app.main:app --reload</code> dans le dossier backend.
              </p>
            )}
            {users.data?.map((u) => (
              <button
                key={u.id}
                disabled={loginMutation.isPending}
                onClick={() => loginMutation.mutate({ email: u.email, password: "demo" })}
                className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3 text-left transition hover:border-teal-300 hover:bg-teal-50/50"
              >
                <UserAvatar name={u.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{u.name}</p>
                  <p className="text-muted-foreground flex items-center gap-1 text-xs">
                    {u.role === "superviseur" ? (
                      "Superviseur · toute l'équipe"
                    ) : (
                      <>
                        <MapPin className="size-3" /> Délégué médical · {u.region}
                      </>
                    )}
                  </p>
                </div>
                <ArrowRight className="text-muted-foreground size-4 transition group-hover:translate-x-0.5 group-hover:text-teal-700" />
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-muted-foreground text-xs">ou avec votre email</span>
            <Separator className="flex-1" />
          </div>

          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              loginMutation.mutate({ email, password });
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                placeholder="prenom.nom@noor-demo.ma"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mot de passe</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="demo"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
              {loginMutation.isPending && <Loader2 className="animate-spin" />}
              Se connecter
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
