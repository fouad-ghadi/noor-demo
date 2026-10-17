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
 *
 * Pour brancher le chatbot : activer le champ de saisie en bas, puis appeler
 *   aiApi.ask(question, { page, doctor_id, visit_id, product_id })   (src/api/ai.ts)
 * et afficher `answer` + la liste `citations` (titre du document, page, extrait).
 */
import { BookOpenText, Mic, ScanLine, ShieldAlert, Sparkles, X } from "lucide-react";

import { NoorMark } from "@/components/brand/NoorMark";
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
      <div className="bg-pine flex items-center justify-between px-4 py-3.5 text-white">
        <div className="flex items-center gap-2.5">
          <NoorMark className="size-8" color="#9FE3D6" core="#0F3D3E" />
          <div>
            <p className="font-display text-[17px] font-semibold">Assistant NOOR</p>
            <p className="text-xs text-[#CFEDE7]">Questions sur les produits, avec sources</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-mint hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Fermer l'assistant">
          <X />
        </Button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <div className="border-mint bg-mint-wash/60 rounded-xl border p-4">
          <p className="font-display text-ink font-semibold">Bientôt disponible</p>
          <p className="text-ink/80 mt-1 text-sm">L'assistant IA de NOOR est en cours de développement.</p>
        </div>

        <div className="bg-paper border-line rounded-lg border px-3 py-2 text-xs">
          <span className="text-muted-foreground">Contexte transmis : </span>
          <span className="font-medium" data-testid="assistant-context">{describeContext(context)}</span>
        </div>

        <div className="space-y-3">
          <p className="font-display text-ink text-[15px] font-semibold">Ce que l'assistant saura faire</p>
          {UPCOMING.map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex gap-3">
              <Icon className="mt-0.5 size-4 shrink-0 text-pine" />
              <div>
                <p className="text-sm font-medium">{title}</p>
                <p className="text-muted-foreground text-xs leading-relaxed">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="border-line border-t p-3">
        <Input disabled placeholder="Posez une question sur un produit…" />
      </div>
    </div>
  );
}
