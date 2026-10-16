/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  POINT D'EXTENSION IA — « Assistant NOOR »                       ║
 * ║  Panneau latéral repliable, présent sur toutes les pages.        ║
 * ║  Aujourd'hui : simple placeholder « Bientôt disponible ».         ║
 * ║  Demain : chatbot produit (RAG avec citations, backend           ║
 * ║  /api/ai/assistant/ask) + suggestions selon le contexte.         ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * Le panneau reçoit en props le contexte de la page courante
 * (médecin affiché, visite en cours...) : voir AssistantContext.tsx.
 */
import { BookOpenText, Mic, ScanLine, ShieldAlert, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PageContext } from "./AssistantContext";

interface AssistantPanelProps {
  context: PageContext;
  onClose: () => void;
}

/** Fonctionnalités IA prévues (affichées pour la démo). */
const UPCOMING = [
  { icon: BookOpenText, title: "Questions produits", text: "Réponses issues uniquement des documents validés (RCP, notices), avec citations." },
  { icon: Mic, title: "Compte-rendu dicté", text: "Dictez votre visite en darija ou en français, NOOR remplit le formulaire." },
  { icon: ShieldAlert, title: "Pharmacovigilance", text: "Détection automatique des effets indésirables mentionnés dans les comptes-rendus." },
  { icon: ScanLine, title: "Scan de cartes de visite", text: "Création de fiches médecins avec détection des doublons." },
  { icon: Sparkles, title: "Recommandations", text: "Quels médecins voir, quand, et avec quels produits." },
];

/** Décrit le contexte en une phrase lisible (montre que le panneau « sait » où on est). */
function describeContext(ctx: PageContext): string {
  const parts = [ctx.title];
  if (ctx.doctorId) parts.push(`médecin #${ctx.doctorId}`);
  if (ctx.visitId) parts.push(`visite #${ctx.visitId}`);
  if (ctx.productId) parts.push(`produit #${ctx.productId}`);
  return parts.join(" · ");
}

export function AssistantPanel({ context, onClose }: AssistantPanelProps) {
  return (
    <div className="flex h-full flex-col bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-teal-600 to-teal-800 text-white">
            <Sparkles className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold">Assistant NOOR</p>
            <p className="text-muted-foreground text-xs">Intelligence artificielle</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fermer l'assistant">
          <X />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="rounded-lg border border-dashed border-teal-300 bg-teal-50/60 p-4 text-center">
          <Badge className="mb-2 bg-teal-700">Bientôt disponible</Badge>
          <p className="text-sm text-teal-900">
            L'assistant IA de NOOR est en cours de développement.
          </p>
        </div>

        <div className="rounded-md bg-muted px-3 py-2 text-xs">
          <span className="text-muted-foreground">Contexte transmis : </span>
          <span className="font-medium" data-testid="assistant-context">{describeContext(context)}</span>
        </div>

        <div className="space-y-3">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Fonctionnalités prévues</p>
          {UPCOMING.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <Icon className="mt-0.5 size-4 shrink-0 text-teal-700" />
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t p-3">
        <Input disabled placeholder="Posez une question sur un produit…" />
      </div>
    </div>
  );
}
