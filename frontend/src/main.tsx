import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import { AssistantProvider } from "./components/assistant/AssistantContext";
import { TooltipProvider } from "./components/ui/tooltip";
import "./index.css";

/**
 * React Query gère les appels API : cache, rechargement, état de chargement.
 * Après une modification (ex. compte-rendu enregistré), on « invalide » les
 * requêtes concernées et les KPIs se mettent à jour automatiquement.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AssistantProvider>
            <TooltipProvider>
              <App />
              <Toaster position="top-center" richColors closeButton />
            </TooltipProvider>
          </AssistantProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
