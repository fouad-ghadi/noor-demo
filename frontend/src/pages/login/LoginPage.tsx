/**
 * Page de connexion (page d'accueil de l'application).
 *
 * À gauche : le panneau « lumière » : motif zellige éclairé (la lumière suit la souris),
 * titre révélé ligne par ligne, et la tournée du jour d'un délégué dessinée sur Casablanca.
 * À droite : choix d'un profil de délégué (un clic), ou connexion par email.
 * Au clic, un « rideau » vert pin s'ouvre depuis le profil choisi et l'étoile NOOR tourne
 * pendant la connexion : on entre dans l'application sans écran blanc.
 * La démonstration ne montre que les délégués (le compte superviseur existe toujours en base,
 * mais n'est plus proposé ici). Mot de passe de tous les comptes : « demo ».
 */
import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Navigate, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { api } from "@/api/client";
import type { User } from "@/api/types";
import { useAuth } from "@/auth/AuthContext";
import { SothemaLogo } from "@/components/brand/SothemaLogo";
import { ZelligeField } from "@/components/brand/ZelligeField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { RouteIllustration } from "./RouteIllustration";

/** Vert pin profond du panneau « tournée » (le safran est réservé à l'arrêt en cours). */
const PINE = "#0F3D3E";
/** Durée minimale du rideau d'entrée (ms) : assez pour le voir, pas assez pour attendre. */
const CURTAIN_MS = 1100;
/** Les 3 lignes du titre, révélées l'une après l'autre. */
const HEADLINE = ["Votre tournée,", "du premier cabinet", "au dernier compte-rendu."];

/** Étoile à 8 branches en clip-path (pour les monogrammes des profils). */
const STAR_CLIP =
  "polygon(50.0% 0.0%, 64.6% 14.6%, 85.4% 14.6%, 85.4% 35.4%, 100.0% 50.0%, 85.4% 64.6%, 85.4% 85.4%, 64.6% 85.4%, 50.0% 100.0%, 35.4% 85.4%, 14.6% 85.4%, 14.6% 64.6%, 0.0% 50.0%, 14.6% 35.4%, 14.6% 14.6%, 35.4% 14.6%)";

/** Tuile de profil : monogramme dans une étoile, nom, ville. Connexion en un clic. */
function ProfileTile({ user, onPick, disabled, loading, index }: {
  user: User;
  onPick: (e: React.MouseEvent) => void;
  disabled: boolean;
  loading: boolean;
  index: number;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      style={{ animationDelay: `${0.35 + index * 0.08}s` }}
      className="noor-enter group relative flex w-full cursor-pointer items-center gap-3.5 overflow-hidden rounded-2xl border border-[#0E2A2B]/12 bg-white p-3.5 text-left transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-[#0F3D3E]/40 hover:shadow-[0_10px_30px_-12px_rgb(15_61_62/0.35)] focus-visible:ring-2 focus-visible:ring-[#0D9488]/50 focus-visible:outline-none active:translate-y-0 disabled:cursor-wait sm:flex-col sm:items-start sm:gap-4 sm:p-5"
    >
      {/* Monogramme dans une étoile : elle tourne d'un huitième de tour au survol */}
      <span className="relative flex size-12 shrink-0 items-center justify-center sm:size-14">
        <span
          className="absolute inset-0 bg-[#E6F4F1] transition-[transform,background-color] duration-700 ease-[cubic-bezier(0.3,1.4,0.4,1)] group-hover:rotate-45 group-hover:bg-[#0F3D3E]"
          style={{ clipPath: STAR_CLIP }}
        />
        <span className="relative text-sm font-semibold text-[#0F3D3E] transition-colors duration-300 group-hover:text-[#9FE3D6]">
          {loading ? <Loader2 className="size-4 animate-spin" /> : initials(user.name)}
        </span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[17px] font-semibold leading-tight text-[#0E2A2B]">{user.name}</span>
        <span className="mt-0.5 block text-sm text-[#0E2A2B]/60">{user.region}</span>
      </span>
      <span className="pointer-events-none absolute right-4 bottom-4 hidden text-xs font-medium text-[#0D7F75] opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100 sm:block sm:-translate-x-1">
        Entrer
      </span>
    </button>
  );
}

/** Rideau d'entrée : un cercle vert pin s'ouvre depuis le profil choisi. */
function EntryCurtain({ origin, name }: { origin: { x: number; y: number }; name: string }) {
  const at = `${origin.x}px ${origin.y}px`;
  return (
    <motion.div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center text-white"
      style={{ background: PINE }}
      initial={{ clipPath: `circle(0px at ${at})` }}
      animate={{ clipPath: `circle(150vmax at ${at})` }}
      transition={{ duration: 0.75, ease: [0.65, 0, 0.35, 1] }}
      role="status"
      aria-live="polite"
    >
      <ZelligeField interactive={false} />
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.2, 0.7, 0.2, 1], delay: 0.15 }}
      >
        <SothemaLogo imgClassName="h-14" />
      </motion.div>
      <motion.p
        className="font-display relative mt-6 text-2xl font-semibold tracking-[-0.01em]"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45, duration: 0.5 }}
      >
        Bonjour {name}
      </motion.p>
      <motion.p
        className="relative mt-1 text-sm text-[#CFEDE7]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
      >
        Préparation de votre tournée
      </motion.p>
    </motion.div>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const reduceMotion = useReducedMotion();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showEmail, setShowEmail] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  // Rideau d'entrée : point de départ (clic) et prénom affiché
  const [curtain, setCurtain] = useState<{ x: number; y: number; name: string } | null>(null);
  const startedAt = useRef(0);

  const users = useQuery({ queryKey: ["users"], queryFn: api.users });
  const loginMutation = useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => api.login(email, password),
    onSuccess: async (u: User) => {
      // On laisse le rideau finir de s'ouvrir avant d'entrer (sauf si animations réduites)
      const wait = reduceMotion ? 0 : Math.max(0, CURTAIN_MS - (Date.now() - startedAt.current));
      if (wait) await new Promise((r) => setTimeout(r, wait));
      // Le tableau de bord prolonge le rideau puis l'efface (voir EntryVeil dans AppLayout)
      if (!reduceMotion) sessionStorage.setItem("noor-entree", "1");
      login(u);
      navigate(u.role === "superviseur" ? "/equipe" : "/tableau-de-bord");
    },
    onError: (e: Error) => {
      setCurtain(null);
      toast.error(e.message);
    },
    onSettled: () => setPendingEmail(null),
  });

  /** Lance la connexion et ouvre le rideau depuis le point cliqué (ou le centre de l'écran). */
  const start = (creds: { email: string; password: string }, name: string, origin?: { x: number; y: number }) => {
    startedAt.current = Date.now();
    if (!reduceMotion) {
      setCurtain({ ...(origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }), name });
    }
    loginMutation.mutate(creds);
  };
  const pick = (u: User, e: React.MouseEvent) => {
    setPendingEmail(u.email);
    // Clic clavier (Entrée) : pas de coordonnées, on part du centre du bouton
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const origin = e.clientX || e.clientY ? { x: e.clientX, y: e.clientY } : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    start({ email: u.email, password: "demo" }, u.name.split(" ")[0], origin);
  };

  if (user) return <Navigate to="/" replace />;

  // Démonstration centrée sur les délégués : le profil superviseur n'est pas proposé
  const delegates = users.data?.filter((u) => u.role === "delegue") ?? [];

  return (
    <div className="grid min-h-dvh bg-[#FAFBF9] lg:grid-cols-[1.35fr_1fr]">
      {/* ------------------------------------------------------------ */}
      {/* Panneau « lumière » (ordinateur : colonne gauche ; mobile : bandeau) */}
      {/* ------------------------------------------------------------ */}
      <section
        className="relative isolate overflow-hidden px-5 pt-6 pb-8 text-white sm:px-10 lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:px-14 lg:pt-10 lg:pb-8"
        style={{ background: `radial-gradient(120% 90% at 85% 10%, #175354 0%, ${PINE} 55%, #0B3031 100%)` }}
      >
        <ZelligeField className="-z-10" />
        <div className="group noor-enter w-fit">
          <div className="flex items-center gap-3">
            <SothemaLogo imgClassName="h-9 sm:h-11" />
            <span className="h-8 w-px bg-white/25" aria-hidden="true" />
            <span className="font-display text-xl font-bold tracking-wide text-white">NOOR</span>
          </div>
        </div>
        <div className="mt-8 max-w-2xl lg:mt-12">
          <h1 className="font-display text-[1.85rem] leading-[1.04] font-semibold tracking-[-0.03em] sm:text-[2.9rem] lg:text-[3.6rem]">
            {HEADLINE.map((line, i) => (
              <span key={line} className="line-mask">
                <span className="line-reveal" style={{ animationDelay: `${0.15 + i * 0.12}s` }}>
                  {line}
                </span>
              </span>
            ))}
          </h1>
          <p className="noor-enter mt-5 max-w-md text-[15px] leading-relaxed text-[#CFEDE7] lg:text-base" style={{ animationDelay: "0.6s" }}>
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
        <div className="w-full max-w-[30rem]">
          <h2 className="noor-enter font-display text-[1.9rem] font-semibold tracking-[-0.02em] text-[#0E2A2B]" style={{ animationDelay: "0.2s" }}>
            Qui part en tournée ?
          </h2>
          <p className="noor-enter mt-1 text-[15px] text-[#0E2A2B]/65" style={{ animationDelay: "0.28s" }}>
            Choisissez un délégué pour entrer dans la démonstration.
          </p>

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
            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {delegates.map((u, i) => (
                <ProfileTile
                  key={u.id}
                  user={u}
                  index={i}
                  onPick={(e) => pick(u, e)}
                  disabled={loginMutation.isPending}
                  loading={pendingEmail === u.email}
                />
              ))}
            </div>
          )}

          {/* Connexion par email (repliée par défaut) */}
          <div className="noor-enter mt-7 border-t border-[#0E2A2B]/10 pt-4" style={{ animationDelay: "0.7s" }}>
            <button
              type="button"
              onClick={() => setShowEmail((v) => !v)}
              aria-expanded={showEmail}
              className="flex cursor-pointer items-center gap-1.5 rounded text-sm font-medium text-[#0D7F75] hover:text-[#0F3D3E] focus-visible:ring-2 focus-visible:ring-[#0D9488]/40 focus-visible:outline-none"
            >
              <ChevronDown className={cn("size-4 transition-transform", showEmail && "rotate-180")} />
              Se connecter avec un email
            </button>
            <AnimatePresence initial={false}>
              {showEmail && (
                <motion.form
                  key="email-form"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.2, 0.7, 0.2, 1] }}
                  className="overflow-hidden"
                  onSubmit={(e) => {
                    e.preventDefault();
                    start({ email, password }, email.split(/[.@]/)[0].replace(/^./, (c) => c.toUpperCase()));
                  }}
                >
                  <div className="space-y-4 px-0.5 pt-4 pb-1">
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
                  </div>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </div>
      </section>

      <AnimatePresence>{curtain && <EntryCurtain origin={curtain} name={curtain.name} />}</AnimatePresence>
    </div>
  );
}
