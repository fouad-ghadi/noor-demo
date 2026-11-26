/**
 * 🎤 IA — Fenêtre « Dicter le compte-rendu » (backend : app/ai/voice_report.py).
 *
 * 1. Le délégué parle : la reconnaissance vocale du navigateur (Chrome) transcrit
 *    en français ou en arabe marocain. Le texte reste modifiable (on peut aussi le
 *    taper ou le coller, ou charger un exemple en darija pour la démonstration).
 * 2. « Remplir le formulaire » : NOOR extrait produits, accueil, objections,
 *    échantillons, durée et suite à donner.
 * 3. Le formulaire est pré-rempli : le délégué relit et valide lui-même.
 *
 * « Simuler une dictée » (démonstration) : le texte d'une dictée type s'écrit mot à mot, comme si le
 * délégué parlait. Utile devant un jury (pas de micro, salle bruyante, navigateur sans reconnaissance vocale).
 * Rien n'est caché : la fenêtre indique clairement qu'il s'agit d'une simulation.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Mic, PlayCircle, Square, Wand2 } from "lucide-react";

import { aiApi, type VoiceReportResult } from "@/api/ai";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* Reconnaissance vocale du navigateur (API Web Speech, non typée par TypeScript) */
interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechResultEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognizerClass = new () => SpeechRecognizer;
const Recognizer: RecognizerClass | undefined =
  (window as unknown as { SpeechRecognition?: RecognizerClass; webkitSpeechRecognition?: RecognizerClass }).SpeechRecognition ??
  (window as unknown as { webkitSpeechRecognition?: RecognizerClass }).webkitSpeechRecognition;

const LANGUAGES = [
  { code: "fr-FR", label: "Français" },
  { code: "ar-MA", label: "Darija (arabe marocain)" },
];

/** Dictées types pour la simulation ({p1}, {p2} = produits conseillés pour ce médecin). */
const SIMULATIONS = [
  {
    label: "Simuler en français",
    text:
      "Visite d'environ quinze minutes, le docteur était très réceptif. J'ai présenté {p1} et {p2}. " +
      "Il trouve {p1} intéressant mais il dit que le prix est un peu élevé pour ses patients. " +
      "Il promet de prescrire {p1} à ses prochains patients. J'ai laissé deux boîtes d'échantillons de {p1}. " +
      "Je reviens dans deux semaines avec l'étude clinique.",
  },
  {
    label: "Simuler en darija",
    text:
      "L'docteur kan mzyan, 3jbo {p1} bzzaf, walakin gal lia prix ghali chwiya l'patients dyalo. " +
      "3titou jouj boites d'échantillons dyal {p1}. Hdert m3ah 3la {p2} tani. Dqayq 15. " +
      "Ghadi nrj3 l'semaine jaya m3a l'étude.",
  },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: number;
  onDraft: (result: VoiceReportResult) => void;
  /** Produits conseillés pour ce médecin (pour une simulation crédible). */
  productNames?: string[];
}

export function VoiceDictationDialog({ open, onOpenChange, visitId, onDraft, productNames = [] }: Props) {
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [lang, setLang] = useState("fr-FR");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognizer = useRef<SpeechRecognizer | null>(null);

  // Simulation : le texte s'écrit mot à mot (comme une transcription en direct)
  const [simulating, setSimulating] = useState(false);
  const timer = useRef<number | null>(null);
  const stopSimulation = () => {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    setSimulating(false);
  };
  const simulate = (template: string) => {
    stopSimulation();
    const [p1 = "Amoxira", p2 = "Calmapyr"] = productNames;
    const words = template.replaceAll("{p1}", p1).replaceAll("{p2}", p2).split(" ");
    // Mouvement réduit demandé par le système : le texte apparaît d'un coup
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTranscript(words.join(" "));
      return;
    }
    setTranscript("");
    setSimulating(true);
    let i = 0;
    timer.current = window.setInterval(() => {
      i += 1;
      setTranscript(words.slice(0, i).join(" "));
      if (i >= words.length) stopSimulation();
    }, 90);
  };

  // Fermeture de la fenêtre : on coupe le micro et la simulation
  useEffect(() => {
    if (!open) {
      recognizer.current?.stop();
      stopSimulation();
    }
  }, [open]);

  const start = () => {
    if (!Recognizer) return;
    setMicError(null);
    const r = new Recognizer();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let finalText = "";
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) finalText += res[0].transcript;
        else partial += res[0].transcript;
      }
      if (finalText) setTranscript((t) => `${t}${t && !t.endsWith(" ") ? " " : ""}${finalText.trim()}.`);
      setInterim(partial);
    };
    r.onerror = (e) =>
      setMicError(e.error === "not-allowed" ? "Accès au micro refusé : autorisez-le dans le navigateur." : "La dictée s'est interrompue.");
    r.onend = () => {
      setListening(false);
      setInterim("");
    };
    recognizer.current = r;
    r.start();
    setListening(true);
  };

  const extract = useMutation({
    mutationFn: () => aiApi.voiceReport(visitId, transcript),
    onSuccess: (result) => {
      onDraft(result);
      onOpenChange(false);
      setTranscript("");
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Dicter le compte-rendu</DialogTitle>
          <DialogDescription>
            Parlez naturellement, en darija ou en français. NOOR remplit le formulaire, vous relisez avant de valider.
          </DialogDescription>
        </DialogHeader>

        {Recognizer ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={listening ? () => recognizer.current?.stop() : start}
              className={cn(listening && "bg-rose-600 hover:bg-rose-700")}
            >
              {listening ? <Square /> : <Mic />}
              {listening ? "Arrêter" : "Parler"}
            </Button>
            <div className="bg-secondary flex rounded-lg p-[3px]" role="radiogroup" aria-label="Langue de la dictée">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  type="button"
                  role="radio"
                  aria-checked={lang === l.code}
                  disabled={listening}
                  onClick={() => setLang(l.code)}
                  className={cn(
                    "cursor-pointer rounded-md px-2.5 py-1 text-xs font-medium",
                    lang === l.code ? "bg-pine text-white" : "text-muted-foreground hover:text-ink",
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
            {listening && (
              <span className="flex items-center gap-1.5 text-xs text-rose-700">
                <span className="size-2 animate-pulse rounded-full bg-rose-600" /> Écoute en cours
              </span>
            )}
          </div>
        ) : (
          <p className="bg-paper border-line text-muted-foreground rounded-lg border px-3 py-2 text-sm">
            La dictée vocale n'est pas disponible dans ce navigateur (utilisez Chrome). Vous pouvez taper ou coller le texte.
          </p>
        )}
        {micError && <p className="text-sm text-rose-700">{micError}</p>}

        <div className="space-y-1.5">
          <Textarea
            value={transcript + (interim ? ` ${interim}` : "")}
            onChange={(e) => setTranscript(e.target.value)}
            readOnly={listening || simulating}
            rows={6}
            placeholder="Le texte dicté apparaît ici. Vous pouvez aussi l'écrire ou le corriger."
            aria-label="Texte du compte-rendu dicté"
          />
        </div>
        {/* Démonstration : dictée simulée (texte écrit mot à mot), clairement signalée comme telle */}
        <div className="border-line bg-paper flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2">
          <span className="text-muted-foreground mr-auto text-xs">Démonstration sans micro :</span>
          {SIMULATIONS.map((sim) => (
            <Button key={sim.label} type="button" size="sm" variant="outline" disabled={listening || simulating} onClick={() => simulate(sim.text)}>
              <PlayCircle /> {sim.label}
            </Button>
          ))}
          {simulating && (
            <span className="text-pine flex w-full items-center gap-1.5 text-xs" aria-live="polite">
              <span className="flex h-3 items-end gap-0.5" aria-hidden="true">
                {[0, 1, 2, 3].map((b) => (
                  <span key={b} className="bg-pine w-0.5 animate-pulse rounded-full" style={{ height: `${6 + ((b * 5) % 7)}px`, animationDelay: `${b * 120}ms` }} />
                ))}
              </span>
              Dictée simulée en cours…
            </span>
          )}
        </div>
        {extract.isError && <p className="text-sm text-rose-700">{(extract.error as Error).message}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={transcript.trim().length < 3 || listening || simulating || extract.isPending} onClick={() => extract.mutate()}>
            {extract.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
            Remplir le formulaire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
