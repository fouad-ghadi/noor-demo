/**
 * Copie les fichiers de l'OCR (Tesseract.js) dans public/ocr, pour que le site les serve LUI-MÊME.
 *
 * Avant : le navigateur les téléchargeait sur le CDN jsdelivr au premier scan. Si ce site était
 * lent ou bloqué (wifi d'école, bloqueur de publicité, antivirus), le scan de carte échouait.
 * Lancé automatiquement avant `npm run dev` et `npm run build` (scripts « predev » / « prebuild »).
 * Le dossier public/ocr est généré : il n'est pas versionné (.gitignore).
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const modules = join(root, "node_modules");
const out = join(root, "public", "ocr");

const files = [
  // Le « chef d'orchestre » qui tourne en arrière-plan dans le navigateur
  ["tesseract.js/dist/worker.min.js", "worker.min.js"],
  // Le moteur (WebAssembly), en version « LSTM seulement » : le navigateur choisit la plus rapide qu'il supporte
  ["tesseract.js-core/tesseract-core-lstm.wasm.js", "core/tesseract-core-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-simd-lstm.wasm.js", "core/tesseract-core-simd-lstm.wasm.js"],
  ["tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js", "core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  // Les données de la langue française (700 ko)
  ["@tesseract.js-data/fra/4.0.0_best_int/fra.traineddata.gz", "lang/fra.traineddata.gz"],
];

for (const [from, to] of files) {
  mkdirSync(dirname(join(out, to)), { recursive: true });
  copyFileSync(join(modules, from), join(out, to));
}
console.log(`OCR : ${files.length} fichiers copiés dans public/ocr`);
