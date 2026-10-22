/**
 * Contexte de la page courante, transmis au panneau « Assistant NOOR ».
 *
 * Chaque page déclare ce qu'elle affiche avec `usePageContext(...)` :
 *   usePageContext({ page: "doctor_detail", title: "Dr Bennani", doctorId: 12 })
 *
 * Le panneau assistant (AssistantPanel) reçoit ce contexte en props. Plus tard,
 * l'assistant IA s'en servira pour répondre « dans le contexte » : par exemple
 * proposer les produits adaptés au médecin affiché, ou pré-remplir un compte-rendu.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type PageName =
  | "dashboard"
  | "team"
  | "doctors"
  | "doctor_detail"
  | "doctor_form"
  | "planning"
  | "visit_report"
  | "products"
  | "product_detail"
  | "objectives"
  | "stats"
  | "sales"
  | "other";

export interface PageContext {
  page: PageName;
  title: string;
  doctorId?: number;
  visitId?: number;
  productId?: number;
  delegueId?: number;
}

interface AssistantState {
  context: PageContext;
  setContext: (ctx: PageContext) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const DEFAULT_CONTEXT: PageContext = { page: "other", title: "NOOR" };
const AssistantCtx = createContext<AssistantState | null>(null);

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<PageContext>(DEFAULT_CONTEXT);
  const [open, setOpen] = useState(false);
  return <AssistantCtx.Provider value={{ context, setContext, open, setOpen }}>{children}</AssistantCtx.Provider>;
}

export function useAssistant(): AssistantState {
  const ctx = useContext(AssistantCtx);
  if (!ctx) throw new Error("useAssistant doit être utilisé dans <AssistantProvider>");
  return ctx;
}

/** À appeler dans chaque page pour déclarer le contexte courant. */
export function usePageContext(ctx: PageContext) {
  const { setContext } = useAssistant();
  const { page, title, doctorId, visitId, productId, delegueId } = ctx;
  useEffect(() => {
    setContext({ page, title, doctorId, visitId, productId, delegueId });
  }, [setContext, page, title, doctorId, visitId, productId, delegueId]);
}
