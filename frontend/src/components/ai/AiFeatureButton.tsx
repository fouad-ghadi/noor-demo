/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  POINT D'EXTENSION IA — bouton de fonctionnalité IA à venir      ║
 * ╚══════════════════════════════════════════════════════════════════╝
 * Bouton désactivé, marqué « IA », avec une infobulle qui explique la future
 * fonctionnalité. Pour l'activer plus tard : passer `enabled` et `onClick`
 * (ex. en lisant GET /api/ai/status via aiApi.status()).
 */
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Props {
  icon: ReactNode; // ex. "🎤" ou une icône lucide
  label: string;
  description: string; // texte de l'infobulle
  enabled?: boolean;
  onClick?: () => void;
  className?: string;
}

export function AiFeatureButton({ icon, label, description, enabled = false, onClick, className }: Props) {
  const button = (
    <Button
      type="button"
      variant="outline"
      disabled={!enabled}
      onClick={onClick}
      className={cn("border-mint text-pine bg-white hover:bg-mint-wash disabled:opacity-80", className)}
      data-ai-extension-point
    >
      <span aria-hidden>{icon}</span>
      {label}
      <span className="bg-pine text-mint rounded px-1.5 py-px text-[10px] font-semibold">IA</span>
    </Button>
  );
  if (enabled) return button;
  // Un bouton désactivé ne déclenche pas d'événements : on l'enveloppe pour afficher l'infobulle
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none">
          {button}
        </span>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-semibold">Bientôt disponible</p>
        <p>{description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
