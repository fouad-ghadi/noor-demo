/**
 * Mise en page de l'application connectée :
 *
 *  Ordinateur :  [ Sidebar | Contenu de la page | Assistant NOOR (repliable) ]
 *  Téléphone  :  [ Barre du haut ] / [ Contenu ] / [ Barre de navigation en bas ]
 */
import { LogOut, Sparkles } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

import { AssistantPanel } from "@/components/assistant/AssistantPanel";
import { useAssistant } from "@/components/assistant/AssistantContext";
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
      <div className="px-5 py-5">
        <Logo light />
      </div>
      <nav className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS[user.role].map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-white shadow-sm"
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
          <UserAvatar name={user.name} className="bg-teal-500/20 text-teal-100" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{user.name}</p>
            <p className="text-sidebar-muted truncate text-xs">
              {ROLE_LABEL[user.role]} · {user.role === "delegue" ? user.region : "Équipe"}
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
    <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-white/95 px-4 py-2.5 backdrop-blur lg:hidden">
      <Logo />
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Ouvrir l'assistant NOOR">
          <Sparkles className="text-teal-700" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="cursor-pointer rounded-full" aria-label="Menu utilisateur">
              <UserAvatar name={user.name} className="size-8 text-xs" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p>{user.name}</p>
              <p className="text-muted-foreground text-xs font-normal">
                {ROLE_LABEL[user.role]} · {user.region}
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
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t bg-white lg:hidden">
      <div className="grid grid-cols-5">
        {NAV_ITEMS[user.role].map(({ to, short, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium",
                isActive ? "text-teal-700" : "text-muted-foreground",
              )
            }
          >
            <Icon className="size-5" />
            {short}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function AppLayout() {
  const { context, open, setOpen } = useAssistant();
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
          <Outlet />
        </main>
      </div>

      {/* Assistant : colonne fixe sur grand écran, panneau coulissant ailleurs */}
      {open && isWide && (
        <aside className="fixed inset-y-0 right-0 z-30 w-96 border-l shadow-xl">
          <AssistantPanel context={context} onClose={() => setOpen(false)} />
        </aside>
      )}
      <Sheet open={open && !isWide} onOpenChange={setOpen}>
        <SheetContent side="right" className="p-0 [&>button:last-child]:hidden">
          <SheetTitle className="sr-only">Assistant NOOR</SheetTitle>
          <AssistantPanel context={context} onClose={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      <MobileBottomNav />
    </div>
  );
}
