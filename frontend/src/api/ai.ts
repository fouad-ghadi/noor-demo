/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  POINT D'EXTENSION IA — appels aux routes /api/ai/...            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 * Modules implémentés : dictée, assistant produit, pharmacovigilance (côté serveur),
 * recommandations, scan de carte de visite + doublons.
 * Formats : voir backend/app/ai/schemas.py.
 */
import { apiRequest } from "./client";
import type { DoctorFields, TimeSlot, VisitReportInput } from "./types";

export interface AiStatus {
  // `vision` (carte de visite seulement) : le serveur lit lui-même les photos avec Claude
  [feature: string]: { implemented: boolean; module: string; vision?: boolean };
}

/** 📷 Champs lus sur une carte de visite (tous facultatifs). */
export interface CardFields {
  first_name: string;
  last_name: string;
  specialty: string | null;
  practice_type: string | null;
  address: string;
  city: string | null;
  district: string | null;
  phone: string | null;
  email: string | null;
}

/** 🔁 Médecin existant qui ressemble à la fiche en cours. */
export interface DuplicateMatch {
  doctor_id: number;
  doctor_name: string;
  specialty: string;
  city: string;
  district: string;
  phone: string | null;
  delegue_name: string;
  in_scope: boolean; // false : fiche d'un collègue (pas d'accès)
  score: number;
  level: "tres_probable" | "probable" | "possible";
  reasons: string[];
}

export interface CardScanResult {
  raw_text: string;
  doctor: CardFields;
  duplicates: DuplicateMatch[];
  method: "claude" | "regles" | "aucune";
  needs_ocr: boolean;
  uncertain_fields: string[];
}

export interface MergeProposal {
  doctor_id: number;
  fields: DoctorFields;
  changes: { field: string; label: string; old: string | null; new: string | null; action: "ajout" | "remplacement" | "conserve" }[];
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
  scanCard: (data: { image_base64?: string; media_type?: string; raw_text?: string }) =>
    post<CardScanResult>("/ai/card-scanner", data),
  /** 🔁 Doublons possibles d'une fiche en cours de saisie. */
  duplicates: (fields: Partial<CardFields> & { exclude_id?: number }) =>
    post<DuplicateMatch[]>("/ai/card-scanner/duplicates", fields),
  /** 🔁 Fiche existante complétée par la carte (rien n'est enregistré). */
  mergeCard: (doctor_id: number, card: CardFields) => post<MergeProposal>("/ai/card-scanner/merge", { doctor_id, card }),
};
