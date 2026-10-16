/**
 * Routes de l'application (URLs en français).
 * Toutes les pages sauf /login nécessitent d'être connecté.
 */
import { Navigate, Route, Routes } from "react-router-dom";

import { useAuth } from "@/auth/AuthContext";
import { AppLayout } from "@/components/layout/AppLayout";
import { ComingSoonPage } from "@/pages/ComingSoonPage";
import { DoctorDetailPage } from "@/pages/doctors/DoctorDetailPage";
import { DoctorFormPage } from "@/pages/doctors/DoctorFormPage";
import { DoctorsPage } from "@/pages/doctors/DoctorsPage";
import { LoginPage } from "@/pages/LoginPage";

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
        <Route path="tableau-de-bord" element={<ComingSoonPage title="Tableau de bord" step={4} />} />
        <Route path="medecins" element={<DoctorsPage />} />
        <Route path="medecins/nouveau" element={<DoctorFormPage />} />
        <Route path="medecins/:id" element={<DoctorDetailPage />} />
        <Route path="medecins/:id/modifier" element={<DoctorFormPage />} />
        <Route path="planning" element={<ComingSoonPage title="Planning" step={3} />} />
        <Route path="visites/:id/compte-rendu" element={<ComingSoonPage title="Compte-rendu de visite" step={3} />} />
        <Route path="produits" element={<ComingSoonPage title="Produits" step={4} />} />
        <Route path="objectifs" element={<ComingSoonPage title="Objectifs" step={4} />} />
        <Route path="equipe" element={<ComingSoonPage title="Vue équipe" step={4} />} />
        <Route path="*" element={<HomeRedirect />} />
      </Route>
    </Routes>
  );
}
