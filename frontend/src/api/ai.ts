/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  POINT D'EXTENSION IA — appels aux routes /api/ai/...            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 * Modules implémentés : dictée, assistant produit, pharmacovigilance (côté serveur),
 * recommandations. Le scan de carte de visite n'est pas implémenté : sa route répond
 * 501 (« Bientôt disponible »).
 * Formats : voir backend/app/ai/schemas.py.
 */
import { apiRequest } from "./client";
import type { TimeSlot, VisitReportInput } from "./types";

export interface AiStatus {
  [feature: string]: { implemented: boolean; module: string };
}

export interface AskResponse {
  answer: string;
  citations: { document_id: number; document_title: string; page: number | null; section: string | null; excerpt: string }[];
  refused: boolean;
}

/** ✨ Une visite recommandée, avec ses raisons. */
export interface VisitRecommendation {
  doctor_id: number;
  doctor_name: string;
  suggested_date: string;
  suggested_slot: TimeSlot;
  product_ids: number[];
  reasons: string[];
  score: number;
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
  /** 🎤 Dictée (texte transcrit par le navigateur) → brouillon de compte-rendu. */
  voiceReport: (visit_id: number, transcript: string) =>
    post<VoiceReportResult>("/ai/voice-report", { visit_id, transcript }),
  /** 💬 Question produit (RAG avec citations). */
  ask: (question: string, context?: Record<string, unknown>) => post<AskResponse>("/ai/assistant/ask", { question, context }),
  /** ✨ Visites recommandées (délégué connecté, ou délégué choisi par le superviseur). */
  recommendations: (delegue_id?: number, limit = 5) =>
    apiRequest<VisitRecommendation[]>(
      "GET",
      `/ai/recommendations?limit=${limit}${delegue_id !== undefined ? `&delegue_id=${delegue_id}` : ""}`,
    ),
  /** 📷 Carte de visite → fiche médecin + doublons. */
  scanCard: (image_base64: string) => post<unknown>("/ai/card-scanner", { image_base64 }),
};
