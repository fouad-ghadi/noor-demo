/**
 * Routes de l'application (URLs en français).
 * Toutes les pages sauf /login nécessitent d'être connecté.
 */
import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { DashboardPage } from "@/pages/dashboard/DashboardPage";
import { DoctorDetailPage } from "@/pages/doctors/DoctorDetailPage";
import { DoctorFormPage } from "@/pages/doctors/DoctorFormPage";
import { DoctorsPage } from "@/pages/doctors/DoctorsPage";
import { LoginPage } from "@/pages/LoginPage";
import { ObjectivesPage } from "@/pages/objectives/ObjectivesPage";
import { PlanningPage } from "@/pages/planning/PlanningPage";
import { ProductDetailPage } from "@/pages/products/ProductDetailPage";
import { ProductsPage } from "@/pages/products/ProductsPage";
import { TeamPage } from "@/pages/team/TeamPage";
import { VisitReportPage } from "@/pages/visits/VisitReportPage";

/** Redirige vers /login si personne n'est connecté. */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

/** Page d'accueil selon le rôle. */
function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === "superviseur" ? "/equipe" : "/tableau-de-bord"} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="tableau-de-bord" element={<DashboardPage />} />
        <Route path="medecins" element={<DoctorsPage />} />
        <Route path="medecins/nouveau" element={<DoctorFormPage />} />
        <Route path="medecins/:id" element={<DoctorDetailPage />} />
        <Route path="medecins/:id/modifier" element={<DoctorFormPage />} />
        <Route path="planning" element={<PlanningPage />} />
        <Route path="visites/:id/compte-rendu" element={<VisitReportPage />} />
        <Route path="produits" element={<ProductsPage />} />
        <Route path="produits/:id" element={<ProductDetailPage />} />
        <Route path="objectifs" element={<ObjectivesPage />} />
        <Route path="equipe" element={<TeamPage />} />
        <Route path="equipe/:delegueId" element={<DashboardPage />} />
        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  );
}
