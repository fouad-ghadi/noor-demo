/**
 * 📷 IA — Fenêtre « Scanner une carte de visite » (backend : app/ai/card_scanner.py).
 *
 * 1. Le délégué prend la carte en photo (téléphone), importe une image, ou choisit
 *    une carte d'exemple (démonstration au jury).
 * 2. Lecture :
 *    - si le serveur a une clé Claude : Claude lit directement la photo ;
 *    - sinon : le navigateur lit le texte (OCR Tesseract.js) et le serveur en tire les champs.
 * 3. Le serveur cherche les doublons. Le formulaire est pré-rempli : le délégué relit,
 *    et choisit de compléter la fiche existante ou de créer la nouvelle.
 */
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, ImageUp, Loader2, RotateCcw } from "lucide-react";

import { aiApi, type CardScanResult } from "@/api/ai";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { prepareImage, readCardText } from "@/lib/cardImage";
import { cn } from "@/lib/utils";

/**
 * Cartes fictives (frontend/public/demo-cards, générées par backend/scripts/generer_cartes_demo.py).
 * `text` = le texte imprimé sur la carte : filet de sécurité pour la démo, utilisé seulement si
 * la lecture automatique (OCR) échoue sur l'ordinateur du jury. Les règles du serveur en tirent
 * ensuite les champs, exactement comme pour une vraie photo.
 */
const DEMO_CARDS = [
  {
    file: "carte-elamrani.png", label: "Dr Mohamed Elamrani", hint: "Cardiologue à Casablanca, déjà en base sous « El Amrani »",
    text: "Dr Mohamed ELAMRANI\nCardiologue\nCabinet de cardiologie Zerktouni\n45, Bd Zerktouni\nMaârif - Casablanca\nTél : +212 522-251478\nGSM : 06 61 90 12 34",
  },
  {
    file: "carte-wazzani.png", label: "Dr Youssef Wazzani", hint: "Pneumologue à Rabat, déjà en base sous « Ouazzani »",
    text: "Dr Youssef WAZZANI\nPneumo-Allergologue\nCentre de pneumologie Agdal\n8, Av. de France\nAgdal - Rabat\nTél : 05 37 77 18 42\nSur rendez-vous",
  },
  {
    file: "carte-ettahiri.png", label: "Dr Saïd Ettahiri", hint: "Rhumatologue à Marrakech, déjà en base sous « Tahiri »",
    text: "Dr Saïd ETTAHIRI\nRhumatologue\nOstéoporose - Rhumatismes\n5, Rue Ibn Aïcha\nDaoudiate - Marrakech\nGSM : +212 668 127 730\ndr.ettahiri@gmail.com",
  },
  {
    file: "carte-bennis.png", label: "Dr Leïla Bennis", hint: "Pédiatre à Casablanca, nouvelle",
    text: "Dr Leïla BENNIS\nPédiatre\nClinique Les Orangers\nRésidence Anfa Place, Bd d'Anfa\nAnfa - Casablanca\nTél : 05 22 39 40 41\ndr.bennis.pediatre@gmail.com",
  },
];

type Phase = { step: "choose" } | { step: "reading"; message: string; progress?: number } | { step: "error"; message: string };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResult: (result: CardScanResult, imageDataUrl: string) => void;
}

export function CardScanDialog({ open, onOpenChange, onResult }: Props) {
  const [phase, setPhase] = useState<Phase>({ step: "choose" });
  const [preview, setPreview] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Le serveur sait-il lire les photos lui-même (clé Claude) ?
  const status = useQuery({ queryKey: ["ai-status"], queryFn: aiApi.status, staleTime: 5 * 60_000, enabled: open });
  const vision = status.data?.card_scanner?.vision ?? false;

  const reset = () => {
    setPhase({ step: "choose" });
    setPreview(null);
  };

  const scan = async (source: File | string, knownText?: string) => {
    try {
      setPhase({ step: "reading", message: "Préparation de la photo…" });
      const image = await prepareImage(source);
      setPreview(image.dataUrl);

      let result: CardScanResult | null = null;
      if (vision) {
        setPhase({ step: "reading", message: "Claude lit la carte…" });
        result = await aiApi.scanCard({ image_base64: image.base64, media_type: image.mediaType });
      }
      if (!result || result.needs_ocr) {
        // Sans clé (ou si Claude n'a pas répondu) : lecture du texte dans le navigateur
        setPhase({ step: "reading", message: "Lecture du texte de la carte…", progress: 0 });
        let text: string;
        try {
          // Au plus 60 s : sur un réseau très lent, on ne laisse pas le délégué attendre indéfiniment
          text = await Promise.race([
            readCardText(image.dataUrl, (p) =>
              setPhase({ step: "reading", message: "Lecture du texte de la carte…", progress: p }),
            ),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("délai dépassé")), 60_000)),
          ]);
        } catch {
          // Carte d'exemple : on connaît son texte, la démo continue même si l'OCR ne se charge pas
          if (!knownText) throw new Error("La lecture automatique n'a pas pu démarrer sur cet appareil. Réessayez, ou remplissez la fiche à la main.");
          text = knownText;
        }
        if (text.trim().length < 5 && knownText) text = knownText;
        if (text.trim().length < 5) throw new Error("Aucun texte lisible : reprenez la photo bien à plat, nette et éclairée.");
        setPhase({ step: "reading", message: "Recherche des doublons…" });
        result = await aiApi.scanCard({ raw_text: text });
      }
      onResult(result, image.dataUrl);
      onOpenChange(false);
      reset();
    } catch (e) {
      setPhase({ step: "error", message: (e as Error).message });
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // pour pouvoir choisir deux fois la même photo
    if (file) void scan(file);
  };

  const reading = phase.step === "reading";

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (reading) return; // on ne ferme pas pendant la lecture
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Scanner une carte de visite</DialogTitle>
          <DialogDescription>
            Prenez la carte bien à plat, sans reflet. NOOR remplit la fiche et vérifie que le médecin n'existe pas déjà.
          </DialogDescription>
        </DialogHeader>

        {/* Champs de fichier cachés : « capture » ouvre directement l'appareil photo sur mobile */}
        <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
        <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={onFile} data-testid="card-file" />

        {phase.step === "choose" && (
          <div className="space-y-5">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button type="button" className="h-11" onClick={() => cameraInput.current?.click()}>
                <Camera /> Prendre une photo
              </Button>
              <Button type="button" variant="outline" className="h-11" onClick={() => fileInput.current?.click()}>
                <ImageUp /> Importer une image
              </Button>
            </div>

            <div>
              <p className="text-ink mb-2 text-sm font-medium">Ou essayez avec une carte d'exemple</p>
              <div className="grid grid-cols-2 gap-2">
                {DEMO_CARDS.map((card) => (
                  <button
                    key={card.file}
                    type="button"
                    onClick={() => void scan(`/demo-cards/${card.file}`, card.text)}
                    className="border-line hover:border-pine focus-visible:ring-ring/50 group cursor-pointer rounded-lg border bg-white p-1.5 text-left transition-colors focus-visible:ring-2 focus-visible:outline-none"
                  >
                    <img src={`/demo-cards/${card.file}`} alt="" className="border-line aspect-[7/4] w-full rounded border object-cover" />
                    <span className="text-ink mt-1.5 block truncate px-0.5 text-xs font-medium">{card.label}</span>
                    <span className="text-muted-foreground block px-0.5 text-[11px] leading-snug">{card.hint}</span>
                  </button>
                ))}
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              {vision
                ? "La photo est lue par Claude, puis vous relisez la fiche."
                : "La photo est lue dans votre navigateur, sans être envoyée : seul le texte part au serveur."}
            </p>
          </div>
        )}

        {phase.step !== "choose" && (
          <div className="space-y-4">
            {preview && (
              <img src={preview} alt="Carte de visite photographiée" className="border-line max-h-56 w-full rounded-lg border object-contain" />
            )}
            {reading && (
              <div className="space-y-2" role="status" aria-live="polite">
                <p className="text-ink flex items-center gap-2 text-sm">
                  <Loader2 className="text-pine size-4 animate-spin" />
                  {phase.message}
                  {phase.progress !== undefined && phase.progress > 0 && ` ${Math.round(phase.progress * 100)} %`}
                </p>
                {phase.progress !== undefined && (
                  <div className="bg-mint-wash h-1.5 overflow-hidden rounded-full">
                    <div className="bg-pine h-full rounded-full transition-[width]" style={{ width: `${Math.max(4, phase.progress * 100)}%` }} />
                  </div>
                )}
              </div>
            )}
            {phase.step === "error" && (
              <div className="space-y-3">
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{phase.message}</p>
                <div className={cn("flex flex-wrap justify-end gap-2")}>
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Remplir à la main
                  </Button>
                  <Button type="button" onClick={reset}>
                    <RotateCcw /> Réessayer
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
