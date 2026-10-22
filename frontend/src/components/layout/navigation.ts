/** Entrées du menu selon le rôle de l'utilisateur. */
import {
  BarChart3,
  CalendarDays,
  LayoutDashboard,
  LineChart,
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
  // Affiché dans la barre du bas sur mobile (5 places) ; les autres sont dans le menu utilisateur
  mobile?: boolean;
}

export const NAV_ITEMS: Record<Role, NavItem[]> = {
  delegue: [
    { to: "/tableau-de-bord", label: "Tableau de bord", short: "Accueil", icon: LayoutDashboard, mobile: true },
    { to: "/medecins", label: "Médecins", short: "Médecins", icon: Stethoscope, mobile: true },
    { to: "/planning", label: "Planning", short: "Planning", icon: CalendarDays, mobile: true },
    { to: "/statistiques", label: "Statistiques", short: "Stats", icon: BarChart3, mobile: true },
    { to: "/ventes", label: "Analyse des ventes", short: "Ventes", icon: LineChart },
    { to: "/produits", label: "Produits", short: "Produits", icon: Package, mobile: true },
    { to: "/objectifs", label: "Objectifs", short: "Objectifs", icon: Target },
  ],
  superviseur: [
    { to: "/equipe", label: "Vue équipe", short: "Équipe", icon: Users, mobile: true },
    { to: "/statistiques", label: "Statistiques", short: "Stats", icon: BarChart3, mobile: true },
    { to: "/ventes", label: "Analyse des ventes", short: "Ventes", icon: LineChart, mobile: true },
    { to: "/medecins", label: "Médecins", short: "Médecins", icon: Stethoscope, mobile: true },
    { to: "/planning", label: "Planning", short: "Planning", icon: CalendarDays, mobile: true },
    { to: "/produits", label: "Produits", short: "Produits", icon: Package },
    { to: "/objectifs", label: "Objectifs", short: "Objectifs", icon: Target },
  ],
};
