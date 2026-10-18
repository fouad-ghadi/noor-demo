/**
 * Mise en page de l'application connectée :
 *
 *  Ordinateur :  [ Sidebar | Contenu de la page | Assistant NOOR (repliable) ]
 *  Téléphone  :  [ Barre du haut ] / [ Contenu ] / [ Barre de navigation en bas ]
 */
import { LogOut, Sparkles } from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

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

const ROLE_LABEL = { delegue: "Délégué médical", superviseur: "Superviseur" } as const;

function Sidebar() {
  const user = useCurrentUser();
  const { logout } = useAuth();
  const navigate = useNavigate();

  return (
    <aside className="bg-sidebar text-sidebar-foreground fixed inset-y-0 left-0 z-30 hidden w-64 flex-col lg:flex">
      <div className="px-5 pt-5 pb-4">
        <Logo light />
      </div>
      {/* La date du jour : le point safran signifie « maintenant », comme partout dans l'application */}
      <p className="text-sidebar-muted mx-5 mb-3 flex items-center gap-2 border-t border-white/10 pt-4 text-[13px]">
        <span className="bg-saffron size-1.5 rounded-full" aria-hidden="true" />
        <span className="first-letter:uppercase">{formatLongDay(new Date())}</span>
      </p>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS[user.role].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-mint/60 focus-visible:outline-none",
                isActive
                  ? "bg-sidebar-accent text-white before:bg-mint before:absolute before:inset-y-2 before:-left-3 before:w-1 before:rounded-r-full"
                  : "text-sidebar-muted hover:bg-sidebar-accent/60 hover:text-white",
              )
            }
          >
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
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
      <Logo light />
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
        {NAV_ITEMS[user.role].map(({ to, short, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "group flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-medium",
                isActive ? "text-pine" : "text-muted-foreground",
              )
            }
          >
            {/* Onglet actif : pastille menthe derrière l'icône */}
            <span className="group-aria-[current=page]:bg-mint flex h-7 w-12 items-center justify-center rounded-full transition-colors">
              <Icon className="size-5" />
            </span>
            {short}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function AppLayout() {
  const { context, open, setOpen } = useAssistant();
  const location = useLocation();
  const isWide = useMediaQuery("(min-width: 1280px)");

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
          {/* Une page qui plante n'emporte pas le menu : message clair à la place de la page */}
          <ErrorBoundary key={location.pathname}>
            <Outlet />
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
    </div>
  );
}
