/**
 * 🎤 IA — Fenêtre « Dicter le compte-rendu » (backend : app/ai/voice_report.py).
 *
 * 1. Le délégué parle : la reconnaissance vocale du navigateur (Chrome) transcrit
 *    en français ou en arabe marocain. Le texte reste modifiable (on peut aussi le
 *    taper ou le coller, ou charger un exemple en darija pour la démonstration).
 * 2. « Remplir le formulaire » : NOOR extrait produits, accueil, objections,
 *    échantillons, durée et suite à donner.
 * 3. Le formulaire est pré-rempli : le délégué relit et valide lui-même.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Mic, Square, Wand2 } from "lucide-react";

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

/** Exemple de dictée en darija mélangée de français (pour la démonstration au jury). */
const EXAMPLE =
  "L'docteur kan mzyan, 3jbo Cardiovex bzzaf, walakin gal lia prix ghali chwiya l'patients dyalo. " +
  "3titou jouj boites d'échantillons dyal Cardiovex. Dqayq 15. Ghadi nrj3 l'semaine jaya m3a l'étude.";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visitId: number;
  onDraft: (result: VoiceReportResult) => void;
}

export function VoiceDictationDialog({ open, onOpenChange, visitId, onDraft }: Props) {
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [lang, setLang] = useState("fr-FR");
  const [listening, setListening] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const recognizer = useRef<SpeechRecognizer | null>(null);

  // Fermeture de la fenêtre : on coupe le micro
  useEffect(() => {
    if (!open) recognizer.current?.stop();
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
            readOnly={listening}
            rows={6}
            placeholder="Le texte dicté apparaît ici. Vous pouvez aussi l'écrire ou le corriger."
            aria-label="Texte du compte-rendu dicté"
          />
          <button
            type="button"
            onClick={() => setTranscript(EXAMPLE)}
            className="cursor-pointer text-xs text-[#0D7F75] underline-offset-4 hover:underline"
          >
            Charger un exemple en darija
          </button>
        </div>
        {extract.isError && <p className="text-sm text-rose-700">{(extract.error as Error).message}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={transcript.trim().length < 3 || listening || extract.isPending} onClick={() => extract.mutate()}>
            {extract.isPending ? <Loader2 className="animate-spin" /> : <Wand2 />}
            Remplir le formulaire
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
