/**
 * 💬 IA — « Assistant NOOR » : questions produits avec citations (RAG).
 * Backend : app/ai/rag_assistant.py (route POST /api/ai/assistant/ask).
 *
 * Panneau latéral présent sur toutes les pages. Il reçoit en props le contexte de la
 * page courante (médecin, visite, produit affichés : voir AssistantContext.tsx) et
 * l'envoie avec chaque question : sur la fiche d'un produit, l'assistant cherche
 * d'abord dans les documents de ce produit.
 *
 * Règle d'or : l'assistant ne répond qu'à partir des documents validés et cite
 * toujours sa source. S'il ne trouve pas, il le dit (réponse « refused »).
 */
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileText, Info, Loader2, SendHorizontal, X } from "lucide-react";

import { aiApi, type AskResponse } from "@/api/ai";
import { NoorMark } from "@/components/brand/NoorMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useProducts } from "@/hooks/queries";
import { cn } from "@/lib/utils";
import type { PageContext } from "./AssistantContext";

interface AssistantPanelProps {
  context: PageContext;
  onClose: () => void;
}

interface Exchange {
  question: string;
  response?: AskResponse;
  error?: string;
}

export function AssistantPanel({ context, onClose }: AssistantPanelProps) {
  const [question, setQuestion] = useState("");
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const products = useProducts();
  const product = products.data?.find((p) => p.id === context.productId);

  // Questions d'exemple : adaptées au produit affiché, sinon génériques
  const suggestions = product
    ? [`Posologie de ${product.brand_name} chez l'enfant ?`, `Contre-indications de ${product.brand_name} ?`, `${product.brand_name} pendant la grossesse ?`]
    : ["Peut-on donner Amoxira à un enfant de moins de 6 ans ?", "Artrinol avec un anticoagulant ?", "Effets indésirables de Glucanor ?"];

  const ask = useMutation({
    mutationFn: (q: string) =>
      aiApi.ask(q, {
        page: context.page,
        doctor_id: context.doctorId,
        visit_id: context.visitId,
        product_id: context.productId,
      }),
    onSuccess: (response) =>
      setExchanges((list) => list.map((e, i) => (i === list.length - 1 ? { ...e, response } : e))),
    onError: (err: Error) =>
      setExchanges((list) => list.map((e, i) => (i === list.length - 1 ? { ...e, error: err.message } : e))),
  });

  const send = (q: string) => {
    const text = q.trim();
    if (text.length < 2 || ask.isPending) return;
    setExchanges((list) => [...list, { question: text }]);
    setQuestion("");
    ask.mutate(text);
  };

  // Faire défiler jusqu'à la dernière réponse
  useEffect(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), [exchanges]);

  return (
    <div className="flex h-full flex-col bg-white">
      <div className="bg-pine flex items-center justify-between px-4 py-3.5 text-white">
        <div className="flex items-center gap-2.5">
          <NoorMark className="size-8" color="#9FE3D6" core="#0F3D3E" />
          <div>
            <p className="font-display text-[17px] font-semibold">Assistant NOOR</p>
            <p className="text-xs text-[#CFEDE7]">Questions produits, réponses sourcées</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="text-mint hover:bg-white/10 hover:text-white" onClick={onClose} aria-label="Fermer l'assistant">
          <X />
        </Button>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto p-4" aria-live="polite">
        {exchanges.length === 0 && (
          <div className="space-y-4">
            <p className="text-ink text-sm leading-relaxed">
              Posez une question sur un produit : posologie, contre-indications, interactions, grossesse… NOOR répond
              uniquement à partir des documents validés du laboratoire et cite toujours sa source.
            </p>
            <div className="space-y-2">
              <p className="text-muted-foreground text-xs">Exemples{product ? ` pour ${product.brand_name}` : ""} :</p>
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => send(s)}
                  className="border-line hover:bg-mint-wash/60 text-ink block w-full cursor-pointer rounded-lg border px-3 py-2 text-left text-sm transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {exchanges.map((e, i) => (
          <div key={i} className="space-y-2">
            {/* Question du délégué */}
            <p className="bg-pine ml-8 rounded-2xl rounded-br-md px-3.5 py-2 text-sm text-white">{e.question}</p>

            {/* Réponse */}
            {!e.response && !e.error && (
              <p className="text-muted-foreground flex items-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" /> Recherche dans les documents validés…
              </p>
            )}
            {e.error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-800">{e.error}</p>}
            {e.response && (
              <div className={cn("mr-4 space-y-2.5 rounded-2xl rounded-bl-md border px-3.5 py-3", e.response.refused ? "border-line bg-paper" : "border-mint bg-mint-wash/50")}>
                <p className={cn("text-sm leading-relaxed", e.response.refused ? "text-muted-foreground flex gap-2" : "text-ink")}>
                  {e.response.refused && <Info className="mt-0.5 size-4 shrink-0" />}
                  {e.response.answer}
                </p>
                {e.response.citations.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-muted-foreground text-xs">Sources</p>
                    {e.response.citations.map((c, j) => (
                      <figure key={j} className="border-line rounded-lg border bg-white p-2.5">
                        <figcaption className="text-ink flex items-center gap-1.5 text-xs font-medium">
                          <FileText className="text-pine size-3.5 shrink-0" />
                          {c.document_title}
                          {c.page !== null && <span className="text-muted-foreground font-normal">{`, section ${c.page}`}</span>}
                        </figcaption>
                        {c.section && <p className="text-muted-foreground mt-0.5 text-xs">{c.section}</p>}
                        {/* L'extrait n'est pas répété s'il figure déjà mot pour mot dans la réponse */}
                        {!e.response!.answer.includes(c.excerpt) && (
                          <blockquote className="border-mint text-ink/80 mt-1.5 border-l-2 pl-2 text-xs leading-relaxed">
                            {c.excerpt}
                          </blockquote>
                        )}
                      </figure>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form
        className="border-line flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(question);
        }}
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Posez une question sur un produit…"
          aria-label="Question pour l'assistant"
          disabled={ask.isPending}
        />
        <Button type="submit" size="icon" disabled={ask.isPending || question.trim().length < 2} aria-label="Envoyer la question">
          <SendHorizontal />
        </Button>
      </form>
    </div>
  );
}
