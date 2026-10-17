/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  POINT D'EXTENSION IA — appels aux routes /api/ai/...            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 * Ces fonctions sont prêtes ; tant que le backend n'implémente pas le module,
 * elles échouent avec une ApiError de statut 501 (« Bientôt disponible »).
 * Formats : voir backend/app/ai/schemas.py.
 */
import { apiRequest } from "./client";
import type { VisitReportInput } from "./types";

export interface AiStatus {
  [feature: string]: { implemented: boolean; module: string };
}

export interface AskResponse {
  answer: string;
  citations: { document_id: number; document_title: string; page: number | null; excerpt: string }[];
  refused: boolean;
}

export interface VoiceReportResult {
  transcript: string;
  draft: VisitReportInput;
  uncertain_fields: string[];
}

// Réutilise le client principal (en-tête X-User-Id, messages d'erreur en français)
const post = <T,>(path: string, body: unknown) => apiRequest<T>("POST", path, body);

export const aiApi = {
  /** Fonctionnalités IA disponibles (pour activer les boutons automatiquement). */
  status: () => apiRequest<AiStatus>("GET", "/ai/status"),
  /** 🎤 Dictée → brouillon de compte-rendu. */
  voiceReport: (visit_id: number, audio_base64: string, language_hint = "darija") =>
    post<VoiceReportResult>("/ai/voice-report", { visit_id, audio_base64, language_hint }),
  /** 💬 Question produit (RAG avec citations). */
  ask: (question: string, context?: Record<string, unknown>) => post<AskResponse>("/ai/assistant/ask", { question, context }),
  /** 📷 Carte de visite → fiche médecin + doublons. */
  scanCard: (image_base64: string) => post<unknown>("/ai/card-scanner", { image_base64 }),
};
