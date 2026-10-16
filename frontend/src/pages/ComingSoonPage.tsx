import { Construction } from "lucide-react";

import { usePageContext } from "@/components/assistant/AssistantContext";
import { PageHeader } from "@/components/shared/PageHeader";

/** Page temporaire pour les écrans pas encore construits. */
export function ComingSoonPage({ title, step }: { title: string; step: number }) {
  usePageContext({ page: "other", title });
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-white p-12 text-center">
        <Construction className="size-8 text-teal-700" />
        <p className="font-medium">Écran en construction</p>
        <p className="text-muted-foreground text-sm">Prévu à l'étape {step} du projet.</p>
      </div>
    </>
  );
}
