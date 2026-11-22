/**
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  POINT D'EXTENSION IA — appels aux routes /api/ai/...            ║
 * ╚══════════════════════════════════════════════════════════════════╝
 * Modules implémentés : dictée, assistant produit, pharmacovigilance (côté serveur),
 * recommandations, scan de carte de visite + doublons.
 * Formats : voir backend/app/ai/schemas.py.
 */
import { apiRequest } from "./client";
import type {
  DoctorFields,
  Feedback,
  Frequency,
  PrescriptionFeedback,
  Segment,
  TimeSlot,
  VisitReportInput,
} from "./types";

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

/** Source d'une réponse : RCP validés, guide d'utilisation du CRM, ou vos chiffres (calculés par des outils). */
export type AskKind = "produit" | "medical" | "guide" | "donnees";

export interface AskResponse {
  answer: string;
  citations: {
    document_id: number;
    document_title: string;
    page: number | null;
    section: string | null;
    excerpt: string;
    /** Page de l'application où vérifier l'information (réponses sur vos chiffres). */
    link: string | null;
  }[];
  refused: boolean;
  kind: AskKind;
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

/** 🅰️ Potentiel A/B/C proposé, avec le pourquoi (backend : app/ai/potential.py). */
export interface PotentialAssessment {
  doctor_id: number;
  doctor_name: string;
  score: number;
  current_segment: Segment;
  proposed_segment: Segment;
  current_frequency: Frequency | null;
  advised_frequency: Frequency | null;
  factors: { label: string; points: number; max_points: number; explanation: string }[];
  frequency_reason: string;
  summary: string;
  differs: boolean;
  next_targeting: string;
}

/** 📋 « Préparer la visite » (backend : app/ai/visit_prep.py). */
export interface ScoreFactor {
  label: string;
  points: number;
  explanation: string;
}
export interface ProductToPush {
  product_id: number;
  brand_name: string;
  molecule: string;
  channel: "pharmacie" | "parapharmacie";
  score: number;
  factors: ScoreFactor[];
  argument: string;
  argument_why: string;
  samples_quantity: number;
  sample_unit: string;
  sample_lot: string | null;
}
export interface VisitPreparation {
  doctor_id: number;
  doctor_name: string;
  specialty: string;
  segment: Segment;
  frequency: Frequency | null;
  patients_per_day: number | null;
  reception: string;
  visits_count: number;
  last_report: {
    visit_id: number;
    date: string;
    days_ago: number;
    feedback: Feedback | null;
    prescription_feedback: PrescriptionFeedback | null;
    notes: string | null;
    next_step: string | null;
    products: string[];
    objections: string[];
    samples: string[];
  } | null;
  products: ProductToPush[];
  reminders: string[];
  briefing: string;
}

/** 🗓️ « Remplir ma semaine » (backend : app/ai/week_planner.py). */
export interface PlannedProposal {
  doctor_id: number;
  doctor_name: string;
  specialty: string;
  segment: Segment;
  frequency: Frequency | null;
  district: string;
  planned_at: string;
  slot: TimeSlot;
  score: number;
  reasons: string[];
}
export interface DayPlan {
  day: string;
  zone: string[];
  zone_reason: string;
  capacity: number;
  already_planned: number;
  event: string | null;
  proposals: PlannedProposal[];
}
export interface WeekPlan {
  week_start: string;
  label: string;
  days: DayPlan[];
  total_proposed: number;
  not_placed: number;
  summary: string;
}

/** 📈 Ce que NOOR déduit des ventes (backend : app/ai/sales_insights.py). */
export interface SalesInsight {
  kind: "zone_a_prioriser" | "zone_a_surveiller" | "produit_en_croissance" | "medecin_a_revoir";
  title: string;
  why: string[];
  territory: string | null;
  product_id: number | null;
  doctor_id: number | null;
  impact: number;
}
export interface SalesInsights {
  period_label: string;
  summary: string;
  zones: SalesInsight[];
  growth: SalesInsight[];
  doctors: SalesInsight[];
}

/** 🌙 Clôturer ma journée / mon mois (backend : app/ai/closing.py). */
export interface ClosingReport {
  scope: "jour" | "mois";
  title: string;
  figures: Record<string, number>;
  to_fix: { label: string; link: string | null }[];
  report: string;
}

// Réutilise le client principal (en-tête X-User-Id, messages d'erreur en français)
const post = <T,>(path: string, body: unknown) => apiRequest<T>("POST", path, body);

export const aiApi = {
  /** Fonctionnalités IA disponibles (pour activer les boutons automatiquement). */
  status: () => apiRequest<AiStatus>("GET", "/ai/status"),
  /** 🎤 Dictée (texte transcrit par le navigateur) → brouillon de compte-rendu. */
  voiceReport: (visit_id: number, transcript: string) =>
    post<VoiceReportResult>("/ai/voice-report", { visit_id, transcript }),
  /** 💬 Question à l'assistant : produit (RCP), mode d'emploi du CRM ou vos chiffres. */
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
  /** 🅰️ Potentiel proposé d'un médecin (avec le pourquoi). */
  potential: (doctor_id: number) => apiRequest<PotentialAssessment>("GET", `/ai/potential/${doctor_id}`),
  /** ✅ Le délégué valide le potentiel et la fréquence. */
  applyPotential: (doctor_id: number, segment: Segment, frequency: Frequency | null) =>
    post<PotentialAssessment>(`/ai/potential/${doctor_id}/apply`, { segment, frequency }),
  /** 📋 Préparer la visite chez un médecin. */
  visitPrep: (doctor_id: number) => apiRequest<VisitPreparation>("GET", `/ai/visit-prep/${doctor_id}`),
  /** 🗓️ Proposition « Remplir ma semaine » (semaine donnée, ou première semaine avec des places libres). */
  weekPlan: (start?: string) => apiRequest<WeekPlan>("GET", `/ai/week-plan${start ? `?start=${start}` : ""}`),
  /** ✅ Visites cochées → ajoutées au planning. */
  confirmWeekPlan: (visits: { doctor_id: number; planned_at: string }[]) =>
    post<{ planned: number }>("/ai/week-plan/confirm", { visits }),
  /** 📈 Conclusions de l'analyse des ventes. */
  salesInsights: () => apiRequest<SalesInsights>("GET", "/ai/sales-insights"),
  /** 🌙 Clôture de la journée (date « 2026-11-23 », par défaut aujourd'hui) ou du mois. */
  closeDay: (day?: string) => apiRequest<ClosingReport>("GET", `/ai/closing/day${day ? `?day=${day}` : ""}`),
  closeMonth: () => apiRequest<ClosingReport>("GET", "/ai/closing/month"),
};
