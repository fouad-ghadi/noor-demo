/** Entrées du menu selon le rôle de l'utilisateur. */
import {
  CalendarDays,
  LayoutDashboard,
  Package,
  Stethoscope,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { Role } from "@/api/types";

export interface NavItem {
  to: string;
  label: string;
  short: string; // libellé court pour la barre mobile
  icon: LucideIcon;
}

export const NAV_ITEMS: Record<Role, NavItem[]> = {
  delegue: [
    { to: "/tableau-de-bord", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard },
    { to: "/medecins", label: "Médecins", short: "Médecins", icon: Stethoscope },
    { to: "/planning", label: "Planning", short: "Planning", icon: CalendarDays },
    { to: "/produits", label: "Produits", short: "Produits", icon: Package },
    { to: "/objectifs", label: "Objectifs", short: "Objectifs", icon: Target },
  ],
  superviseur: [
    { to: "/equipe", label: "Vue équipe", short: "Équipe", icon: Users },
    { to: "/medecins", label: "Médecins", short: "Médecins", icon: Stethoscope },
    { to: "/planning", label: "Planning", short: "Planning", icon: CalendarDays },
    { to: "/produits", label: "Produits", short: "Produits", icon: Package },
    { to: "/objectifs", label: "Objectifs", short: "Objectifs", icon: Target },
  ],
};
