/**
 * 📷 Outils pour la photo d'une carte de visite (utilisés par CardScanDialog).
 *
 * - `prepareImage` : réduit la photo du téléphone (souvent 4000 px, 5 Mo) à 1600 px en JPEG,
 *   pour un envoi rapide et une lecture plus fiable.
 * - `readCardText` : OCR DANS LE NAVIGATEUR avec Tesseract.js (gratuit, sans clé d'API).
 *   Utilisé seulement quand le serveur n'a pas de clé Claude. Le moteur et le français (≈ 4,6 Mo)
 *   sont servis par NOOR lui-même (dossier /ocr, copié par frontend/scripts/copier-ocr.mjs) :
 *   plus besoin du CDN jsdelivr, qui pouvait être lent ou bloqué sur certains réseaux.
 */

export interface PreparedImage {
  dataUrl: string; // pour l'aperçu et pour l'OCR
  base64: string; // pour l'envoi au serveur (sans le préfixe « data:image/jpeg;base64, »)
  mediaType: "image/jpeg";
}

const MAX_SIDE = 1600;

/** Charge une image (fichier choisi ou URL d'une carte d'exemple) et la réduit. */
export async function prepareImage(source: File | string): Promise<PreparedImage> {
  const url = typeof source === "string" ? source : URL.createObjectURL(source);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Image illisible : choisissez une photo (JPEG ou PNG)."));
      el.src = url;
    });
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Votre navigateur ne permet pas de traiter l'image.");
    ctx.fillStyle = "#fff"; // fond blanc si l'image est transparente
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    return { dataUrl, base64: dataUrl.split(",")[1], mediaType: "image/jpeg" };
  } finally {
    if (typeof source !== "string") URL.revokeObjectURL(url);
  }
}

/** Lit le texte de la carte (OCR français). `onProgress` reçoit un nombre entre 0 et 1. */
export async function readCardText(dataUrl: string, onProgress?: (p: number) => void): Promise<string> {
  // Import à la demande : la bibliothèque n'alourdit pas le chargement des autres pages
  const { createWorker } = await import("tesseract.js");
  const base = `${window.location.origin}/ocr`; // adresses complètes : le « worker » ne connaît pas la page
  const worker = await createWorker("fra", 1, {
    workerPath: `${base}/worker.min.js`,
    corePath: `${base}/core`,
    langPath: `${base}/lang`,
    logger: (m) => {
      if (m.status === "recognizing text") onProgress?.(m.progress);
    },
  });
  try {
    const { data } = await worker.recognize(dataUrl);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
