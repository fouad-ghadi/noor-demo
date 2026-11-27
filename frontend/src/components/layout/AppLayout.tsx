/**
 * Mise en page de l'application connectée :
 *
 *  Ordinateur :  [ Sidebar | Contenu de la page | Assistant NOOR (repliable) ]
 *  Téléphone  :  [ Barre du haut ] / [ Contenu ] / [ Barre de navigation en bas ]
 *
 * Animations (toutes coupées si l'utilisateur réduit les animations) :
 *  - menu : motif zellige éclairé en fond, la pastille de l'onglet actif GLISSE d'une entrée à l'autre
 *    (`layoutId` de motion) ;
 *  - changement de page : la nouvelle page monte en fondu (courte, 0,35 s) ;
 *  - juste après la connexion : le voile vert pin du « rideau » s'efface sur le tableau de bord.
 */
import { useEffect, useState } from "react";
import { CloudOff, LogOut, Sparkles } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { SothemaLogo } from "@/components/brand/SothemaLogo";
import { ZelligeField } from "@/components/brand/ZelligeField";
import { OfflineBanner, SimulateOfflineToggle } from "@/components/layout/OfflineBanner";
import { offlineStore } from "@/lib/offline";
import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { useAssistant } from "@/components/assistant/AssistantContext";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { UserAvatar } from "@/components/shared/UserAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useCurrentUser, useAuth } from "@/auth/AuthContext";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { formatLongDay } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { NAV_ITEMS } from "./navigation";

const ROLE_LABEL = { delegue: "Délégué médical (VM)", superviseur: "Superviseur (DSM)" } as const;

function Sidebar() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside
      className="bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-30 hidden w-64 isolate flex-col overflow-hidden lg:flex"
      style={{ background: "linear-gradient(180deg, #11494A 0%, var(--pine) 45%, #0B3031 100%)" }}
    >
      <ZelligeField className="-z-10" intensity={0.4} />
      <div className="group w-fit px-5 pt-5 pb-4">
        <Logo light />
      </div>
      {/* La date du jour : le point safran signifie « maintenant », comme partout dans l'application */}
      <p className="text-sidebar-muted mx-5 mb-3 flex items-center gap-2 border-t border-white/10 pt-4 text-[13px]">
        <span className="now-pulse bg-saffron size-1.5 rounded-full" aria-hidden="true" />
        <span className="first-letter:uppercase">{formatLongDay(new Date())}</span>
      </p>
      <nav className="relative isolate flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS[user.role].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "group/nav relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-mint/60 focus-visible:outline-none",
                isActive ? "text-white" : "text-sidebar-muted hover:bg-white/5 hover:text-white",
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Pastille de l'onglet actif : un seul élément qui glisse d'une entrée à l'autre */}
                {isActive && (
                  <motion.span
                    layoutId="sidebar-active"
                    className="bg-sidebar-accent absolute inset-0 -z-10 rounded-lg ring-1 ring-white/10"
                    transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  >
                    <span className="bg-mint absolute inset-y-2 -left-3 w-1 rounded-r-full" />
                  </motion.span>
                )}
                <Icon className={cn("size-[18px] transition-transform duration-300", !isActive && "group-hover/nav:scale-110")} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        {user.role === "delegue" && <SimulateOfflineToggle onDark className="mb-1" />}
        <div className="flex items-center gap-3 rounded-lg px-2 py-2">
          <UserAvatar name={user.name} className="bg-mint text-pine" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="text-sidebar-muted truncate text-xs">
              {user.role === "delegue" ? user.region : ROLE_LABEL[user.role]}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="text-sidebar-muted hover:bg-sidebar-accent hover:text-white"
            onClick={() => {
              logout();
              navigate("/login");
            }}
            aria-label="Se déconnecter"
          >
            <LogOut />
          </Button>
        </div>
      </div>
    </aside>
  );
}

/** Barre du haut sur mobile : logo + bouton assistant + menu utilisateur. */
function MobileTopBar() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const { setOpen } = useAssistant();
  const navigate = useNavigate();
  return (
    <header className="bg-pine sticky top-0 z-30 flex items-center justify-between px-4 py-2.5 lg:hidden">
      <div className="group">
        <Logo light />
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="text-mint hover:bg-white/10 hover:text-white" onClick={() => setOpen(true)} aria-label="Ouvrir l'assistant NOOR">
          <Sparkles />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="cursor-pointer rounded-full focus-visible:ring-2 focus-visible:ring-mint focus-visible:outline-none" aria-label="Menu utilisateur">
              <UserAvatar name={user.name} className="bg-mint text-pine size-8 text-xs" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p>{user.name}</p>
              <p className="text-muted-foreground text-xs font-normal">
                {ROLE_LABEL[user.role]}, {user.region}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* Pages qui n'ont pas de place dans la barre du bas */}
            {NAV_ITEMS[user.role]
              .filter((item) => !item.mobile)
              .map(({ to, label, icon: Icon }) => (
                <DropdownMenuItem key={to} onClick={() => navigate(to)}>
                  <Icon /> {label}
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            {user.role === "delegue" && (
              <DropdownMenuItem onClick={() => offlineStore.setSimulated(!offlineStore.get().simulated)}>
                <CloudOff /> {offlineStore.get().simulated ? "Rétablir la connexion (démo)" : "Simuler une coupure réseau (démo)"}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              onClick={() => {
                logout();
                navigate("/login");
              }}
            >
              <LogOut /> Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

/** Barre de navigation en bas de l'écran sur mobile (usage terrain, au pouce). */
function MobileBottomNav() {
  const user = useCurrentUser();
  return (
    <nav className="pb-safe border-line fixed inset-x-0 bottom-0 z-30 border-t bg-white lg:hidden">
      <div className="grid grid-cols-5">
        {NAV_ITEMS[user.role].filter((item) => item.mobile).map(({ to, short, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium transition-colors",
                isActive ? "text-pine" : "text-muted-foreground",
              )
            }
          >
            {({ isActive }) => (
              <>
                {/* Onglet actif : pastille menthe derrière l'icône, qui glisse d'un onglet à l'autre */}
                <span className="relative flex h-7 w-12 items-center justify-center">
                  {isActive && (
                    <motion.span
                      layoutId="bottom-nav-active"
                      className="bg-mint absolute inset-0 rounded-full"
                      transition={{ type: "spring", stiffness: 500, damping: 38 }}
                    />
                  )}
                  <Icon className="relative size-5" />
                </span>
                {short}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/**
 * Voile d'entrée : prolonge le « rideau » de la page de connexion (même fond, même étoile),
 * puis s'efface pour laisser apparaître le tableau de bord. Affiché une seule fois par connexion
 * (drapeau `noor-entree` posé par LoginPage dans sessionStorage).
 */
function EntryVeil() {
  const [show, setShow] = useState(() => sessionStorage.getItem("noor-entree") === "1");
  useEffect(() => {
    if (!show) return;
    sessionStorage.removeItem("noor-entree");
    const t = setTimeout(() => setShow(false), 450);
    return () => clearTimeout(t);
  }, [show]);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="bg-pine fixed inset-0 z-50 flex items-center justify-center"
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          aria-hidden="true"
        >
          <motion.div exit={{ scale: 1.6, opacity: 0 }} transition={{ duration: 0.5 }}>
            <SothemaLogo imgClassName="h-14" />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function AppLayout() {
  const { context, open, setOpen } = useAssistant();
  const location = useLocation();
  const isWide = useMediaQuery("(min-width: 1280px)");
  const reduceMotion = useReducedMotion();

  return (
    <div className="min-h-dvh">
      <Sidebar />
      <MobileTopBar />

      <div className={cn("transition-[padding] lg:pl-64", open && isWide && "pr-96")}>
        {/* Bouton d'ouverture de l'assistant (ordinateur) */}
        {!open && (
          <Button
            onClick={() => setOpen(true)}
            className="bg-pine hover:bg-pine/90 fixed right-6 bottom-6 z-20 hidden rounded-full shadow-lg lg:inline-flex"
            size="lg"
          >
            <Sparkles /> Assistant NOOR
          </Button>
        )}
        <main className="mx-auto max-w-7xl px-4 pt-4 pb-24 sm:px-6 lg:px-8 lg:pt-8 lg:pb-12">
          {/* Une page qui plante n'emporte pas le menu : message clair à la place de la page.
              Le filet reste en place d'une page à l'autre (pas de « key ») : une erreur levée pendant
              qu'on QUITTE une page est rattrapée ici, et non par le filet global qui masque le menu. */}
          {/* Hors connexion : comptes-rendus gardés sur l'appareil, synchronisés au retour du réseau */}
          <OfflineBanner />
          <ErrorBoundary resetKey={location.pathname}>
            {/* Chaque page arrive en fondu (clé = adresse de la page) */}
            <motion.div
              key={location.pathname}
              initial={reduceMotion ? false : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, ease: [0.2, 0.7, 0.2, 1] }}
            >
              <Outlet />
            </motion.div>
          </ErrorBoundary>
        </main>
      </div>

      {/* Assistant : colonne fixe sur grand écran, panneau coulissant ailleurs */}
      {open && isWide && (
        <aside className="fixed inset-y-0 right-0 z-30 w-96 border-l shadow-xl">
          <ErrorBoundary compact title="L'assistant a rencontré un problème d'affichage.">
            <AssistantPanel context={context} onClose={() => setOpen(false)} />
          </ErrorBoundary>
        </aside>
      )}
      <Sheet open={open && !isWide} onOpenChange={setOpen}>
        <SheetContent side="right" className="p-0 [&>button:last-child]:hidden">
          <SheetTitle className="sr-only">Assistant NOOR</SheetTitle>
          <ErrorBoundary compact title="L'assistant a rencontré un problème d'affichage.">
            <AssistantPanel context={context} onClose={() => setOpen(false)} />
          </ErrorBoundary>
        </SheetContent>
      </Sheet>

      <MobileBottomNav />
      <EntryVeil />
    </div>
  );
}
