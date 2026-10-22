/**
 * Types TypeScript des données renvoyées par l'API.
 * Ils reprennent les schémas Pydantic du backend (backend/app/schemas/).
 */

export type Role = "delegue" | "superviseur";
export type Segment = "A" | "B" | "C";
export type VisitStatus = "planifiee" | "realisee" | "annulee" | "reportee";
export type PrescribingStatus = "non_prescripteur" | "occasionnel" | "regulier";
export type TimeSlot = "matin" | "midi" | "apres_midi";
export type Feedback = "tres_favorable" | "favorable" | "neutre" | "reserve" | "defavorable";
export type PracticeType = "cabinet" | "clinique" | "hopital_public";
export type AlertSeverity = "faible" | "moyenne" | "haute";
export type AlertStatus = "nouvelle" | "vue" | "traitee";
export type ProgressStatus = "en_avance" | "dans_les_temps" | "en_retard";
/** Ciblage : F1 = 1 visite par mois, F2 = 2 visites par mois ; null = hors cible. */
export type Frequency = "F1" | "F2";
export type PrescriptionFeedback =
  | "prescrit_regulierement"
  | "prescrit_parmi_autres"
  | "promesse_prescrire"
  | "ne_prescrit_pas";
export type EventType =
  | "reunion_equipe"
  | "formation"
  | "congres"
  | "staff"
  | "table_ronde"
  | "administratif"
  | "conge_annuel"
  | "conge_maladie"
  | "fete"
  | "autre";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  region: string;
  phone: string | null;
  supervisor_id: number | null;
}

export interface Meta {
  specialties: string[];
  cities: string[];
  districts: Record<string, { name: string; latitude: number; longitude: number }[]>;
  objection_categories: Record<string, string>;
  territories: string[];
}

// --- Produits -----------------------------------------------------------
export interface DocumentInfo {
  id: number;
  product_id: number;
  title: string;
  doc_type: "rcp" | "notice" | "support_promotionnel";
  file_path: string | null;
  version: string | null;
  created_at: string;
}

export interface Product {
  id: number;
  brand_name: string;
  molecule: string;
  therapeutic_class: string;
  form_dosage: string;
  description: string | null;
  indications: string[];
  key_messages: string[];
  target_specialties: string[];
  documents: DocumentInfo[];
}

export interface ProductDetail extends Product {
  stats: {
    prescribers: Record<PrescribingStatus, number>;
    presentations_last_30d: number;
    samples_last_30d: number;
  };
}

// --- Visites ------------------------------------------------------------
export interface Objection {
  category: string;
  comment: string | null;
  product_id: number | null;
  label?: string;
}

export interface Sample {
  product_id: number;
  quantity: number;
  lot_number?: string | null;
  brand_name?: string;
}

export interface Visit {
  id: number;
  delegue_id: number;
  doctor_id: number;
  doctor_name: string;
  doctor_specialty: string;
  doctor_segment: Segment;
  doctor_frequency: Frequency | null;
  doctor_city: string;
  doctor_district: string;
  doctor_address: string;
  doctor_latitude: number | null;
  doctor_longitude: number | null;
  planned_at: string;
  actual_at: string | null;
  status: VisitStatus;
  duration_min: number | null;
  feedback: Feedback | null;
  prescription_feedback: PrescriptionFeedback | null;
  notes: string | null;
  next_step: string | null;
  next_visit_date: string | null;
  cancel_reason: string | null;
  report_source: "manuel" | "dictee" | null;
  reported_at: string | null;
  products: { product_id: number; brand_name: string }[];
  samples: Sample[];
  objections: Objection[];
  report_pending: boolean;
}

export interface VisitReportInput {
  actual_at?: string | null;
  duration_min: number;
  product_ids: number[];
  feedback: Feedback;
  prescription_feedback?: PrescriptionFeedback | null;
  objections: Objection[];
  samples: Sample[];
  notes?: string | null;
  next_step?: string | null;
  next_visit_date?: string | null;
  plan_next_visit?: boolean;
  report_source?: "manuel" | "dictee";
}

// --- Médecins -----------------------------------------------------------
export interface DoctorFields {
  first_name: string;
  last_name: string;
  specialty: string;
  practice_type: PracticeType;
  address: string;
  city: string;
  district: string;
  phone: string | null;
  email: string | null;
  latitude: number | null;
  longitude: number | null;
  segment: Segment;
  frequency: Frequency | null;
  preferred_slot: TimeSlot | null;
  notes: string | null;
}

export interface Doctor extends DoctorFields {
  id: number;
  territory: string;
  delegue_id: number;
  source: "manuel" | "carte_de_visite" | "import";
  created_at: string;
}

export interface DoctorListItem extends Doctor {
  delegue_name: string;
  last_visit_date: string | null;
  days_since_last_visit: number | null;
  next_visit_at: string | null;
  visits_count: number;
  regular_products: string[];
}

export interface Prescription {
  product_id: number;
  brand_name: string;
  molecule: string;
  status: PrescribingStatus;
}

export interface DoctorDetail extends Doctor {
  delegue_name: string;
  prescriptions: Prescription[];
  visits: Visit[];
  next_visit: Visit | null;
  last_visit_date: string | null;
  days_since_last_visit: number | null;
  visits_count: number;
  slot_stats: { slot: TimeSlot; visits: number; favorable_rate: number }[];
}

export interface DoctorInput extends DoctorFields {
  delegue_id?: number | null;
  source?: string;
  prescriptions?: { product_id: number; status: PrescribingStatus }[];
}

// --- Objectifs, alertes, statistiques ----------------------------------
export interface ObjectiveProgress {
  delegue_id: number;
  period: string;
  label: string;
  is_current: boolean;
  target_visits: number;
  done_visits: number;
  visits_pct: number;
  expected_pct: number;
  target_coverage_a: number;
  coverage_a: number;
  a_doctors_total: number;
  a_doctors_visited: number;
  products: { product_id: number; brand_name: string; target: number; done: number; pct: number }[];
  status: ProgressStatus;
}

export interface Alert {
  id: number;
  type: "medecin_non_visite" | "objectif_en_retard" | "compte_rendu_en_retard" | "pharmacovigilance";
  severity: AlertSeverity;
  status: AlertStatus;
  title: string;
  message: string | null;
  delegue_id: number;
  doctor_id: number | null;
  doctor_name: string | null;
  visit_id: number | null;
  created_at: string;
}

export interface CountItem {
  key: string;
  label: string;
  count: number;
}

export interface Dashboard {
  delegue_id: number;
  delegue_name: string;
  region: string;
  today: string;
  today_visits: Visit[];
  kpis: {
    visits_done: number;
    visits_target: number;
    visits_expected_to_date: number;
    visits_planned_remaining: number;
    coverage_a: number;
    coverage_a_target: number;
    pending_reports: number;
    late_reports: number;
    cancelled_month: number;
  };
  activity: ActivityRow;
  objective: ObjectiveProgress | null;
  visits_per_week: { week_start: string; done: number; cancelled: number }[];
  doctors_to_revisit: {
    doctor_id: number;
    doctor_name: string;
    specialty: string;
    segment: Segment;
    frequency: Frequency | null;
    city: string;
    district: string;
    last_visit_date: string | null;
    days_since_last_visit: number | null;
    next_visit_at: string | null;
  }[];
  doctors_to_revisit_total: number;
  alerts: Alert[];
  top_objections: CountItem[];
}

export interface MonthPoint {
  period: string;
  label: string;
  done: number;
  target: number;
  pct: number;
}

export interface TeamMember {
  delegue_id: number;
  name: string;
  region: string;
  doctors_count: number;
  visits_done: number;
  visits_target: number;
  achievement_pct: number;
  expected_pct: number;
  coverage_a: number;
  coverage_a_target: number;
  cancelled: number;
  cancel_rate: number;
  pending_reports: number;
  late_reports: number;
  status: ProgressStatus;
  history: MonthPoint[];
}

export interface Team {
  supervisor_name: string;
  period: string;
  period_label: string;
  members: TeamMember[];
  regions: {
    region: string;
    delegue_name: string;
    doctors: number;
    coverage_by_segment: Record<Segment, number>;
    visits_by_month: MonthPoint[];
  }[];
  totals: Record<string, number>;
  top_objections: CountItem[];
}

// --- Activité terrain (statistiques) -----------------------------------
/** Une ligne du tableau « Couverture / Moyenne de visites par jour ». */
export interface ActivityRow {
  delegue_id: number | null; // null = ligne « Équipe »
  name: string;
  region: string;
  period_days: number;
  event_days: number;
  worked_days: number;
  targeted: number;
  targeted_f1: number;
  targeted_f2: number;
  calls: number;
  contacts: number;
  targeted_visited: number;
  f1_ok: number;
  f2_ok: number;
  avg_visits_per_day: number;
  coverage_pct: number;
  cpa_pct: number;
  cpa_f1_pct: number;
  cpa_f2_pct: number;
}

export interface Activity {
  period: string;
  period_label: string;
  is_current: boolean;
  through: string;
  rows: ActivityRow[];
  total: ActivityRow | null;
  breakdown: { key: "terrain" | EventType; days: number }[];
  trend: { period: string; label: string; avg_visits_per_day: number; coverage_pct: number; cpa_pct: number }[];
  periods: string[];
}

export interface AgendaEvent {
  id: number;
  delegue_id: number;
  delegue_name: string;
  day: string;
  type: EventType;
  duration_days: number;
  half: "matin" | "apres_midi" | null;
  comment: string | null;
}

export interface AgendaEventInput {
  day: string;
  type: EventType;
  half?: "matin" | "apres_midi" | null;
  comment?: string | null;
  delegue_id?: number | null;
}

// --- Analyse des ventes (marché type IMS) -------------------------------
export interface SalesMetrics {
  value: number;
  value_prev: number;
  market_value: number;
  market_value_prev: number;
  qp: number | null;
  qm: number | null;
  pm: number | null;
  pm_prev: number | null;
  ie: number | null;
  ip: number | null;
  evol: number | null;
  evol_market: number | null;
}

export interface TerritorySales extends SalesMetrics {
  territory: string;
}

export interface DelegateSales extends SalesMetrics {
  delegue_id: number;
  name: string;
  region: string;
  territories: TerritorySales[];
}

export interface Sales {
  product_id: number | null;
  product_name: string;
  market_name: string;
  period: string;
  period_label: string;
  compare_label: string;
  last_month: string;
  national: SalesMetrics;
  scope_label: string;
  scope: SalesMetrics;
  delegates: DelegateSales[];
  competitors: {
    name: string;
    laboratory: string;
    market_name: string;
    is_ours: boolean;
    value: number;
    pm: number | null;
    evol: number | null;
    ie: number | null;
  }[];
  monthly: { period: string; label: string; value: number; market_value: number; pm: number | null }[];
  months: string[];
  products: { id: number; name: string; market_name: string }[];
}
