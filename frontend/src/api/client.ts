/**
 * Client HTTP minimal pour l'API FastAPI.
 *
 * - Toutes les URLs commencent par /api (Vite redirige vers http://localhost:8000).
 * - L'identifiant de l'utilisateur connecté est envoyé dans l'en-tête X-User-Id
 *   (démo : pas de vraie authentification).
 */
import type {
  Activity,
  AgendaEvent,
  AgendaEventInput,
  Alert,
  Dashboard,
  DoctorDetail,
  DoctorInput,
  DoctorListItem,
  Doctor,
  Meta,
  ObjectiveProgress,
  Product,
  ProductDetail,
  Sales,
  Team,
  User,
  Visit,
  VisitReportInput,
} from "./types";

const USER_KEY = "noor.user";

/** Erreur renvoyée par l'API, avec le message français du backend. */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function currentUserId(): string | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? String((JSON.parse(raw) as User).id) : null;
  } catch {
    return null;
  }
}

export async function apiRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const userId = currentUserId();
  if (userId) headers["X-User-Id"] = userId;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Erreur ${res.status}`;
    try {
      const data = await res.json();
      if (typeof data.detail === "string") message = data.detail;
      else if (Array.isArray(data.detail)) message = "Certains champs sont invalides";
    } catch {
      /* réponse non JSON */
    }
    throw new ApiError(res.status, message);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

/** Construit une query string en ignorant les valeurs vides. */
function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") search.set(k, String(v));
  });
  const s = search.toString();
  return s ? `?${s}` : "";
}

export interface DoctorFilters {
  search?: string;
  city?: string;
  specialty?: string;
  segment?: string;
  frequency?: string; // "F1" | "F2" | "cible" | "hors_cible"
  territory?: string;
  product_id?: number;
  prescribing_status?: string;
  last_visit?: string;
  delegue_id?: number;
}

export interface VisitFilters {
  start?: string;
  end?: string;
  status?: string;
  doctor_id?: number;
  delegue_id?: number;
  pending_report?: boolean;
}

/** Toutes les fonctions d'appel à l'API, regroupées par ressource. */
export const api = {
  storageKey: USER_KEY,

  // Utilisateurs
  login: (email: string, password: string) => apiRequest<User>("POST", "/auth/login", { email, password }),
  users: () => apiRequest<User[]>("GET", "/users"),
  team: () => apiRequest<User[]>("GET", "/users/team"),
  meta: () => apiRequest<Meta>("GET", "/meta"),

  // Médecins
  doctors: (filters: DoctorFilters = {}) => apiRequest<DoctorListItem[]>("GET", `/doctors${qs({ ...filters })}`),
  doctor: (id: number) => apiRequest<DoctorDetail>("GET", `/doctors/${id}`),
  createDoctor: (data: DoctorInput) => apiRequest<Doctor>("POST", "/doctors", data),
  updateDoctor: (id: number, data: DoctorInput) => apiRequest<Doctor>("PUT", `/doctors/${id}`, data),

  // Visites
  visits: (filters: VisitFilters = {}) => apiRequest<Visit[]>("GET", `/visits${qs({ ...filters })}`),
  visit: (id: number) => apiRequest<Visit>("GET", `/visits/${id}`),
  planVisit: (doctor_id: number, planned_at: string, notes?: string) =>
    apiRequest<Visit>("POST", "/visits", { doctor_id, planned_at, notes }),
  rescheduleVisit: (id: number, planned_at: string) =>
    apiRequest<Visit>("PATCH", `/visits/${id}/reschedule`, { planned_at }),
  cancelVisit: (id: number, reason: string, postpone = false, new_planned_at?: string) =>
    apiRequest<Visit>("POST", `/visits/${id}/cancel`, { reason, postpone, new_planned_at }),
  submitReport: (id: number, data: VisitReportInput) => apiRequest<Visit>("PUT", `/visits/${id}/report`, data),

  // Produits, objectifs, alertes, statistiques
  products: () => apiRequest<Product[]>("GET", "/products"),
  product: (id: number) => apiRequest<ProductDetail>("GET", `/products/${id}`),
  objectives: (delegue_id?: number) => apiRequest<ObjectiveProgress[]>("GET", `/objectives${qs({ delegue_id })}`),
  alerts: (delegue_id?: number) => apiRequest<Alert[]>("GET", `/alerts${qs({ delegue_id })}`),
  updateAlert: (id: number, status: string) => apiRequest<Alert>("PATCH", `/alerts/${id}`, { status }),
  dashboard: (delegue_id?: number) => apiRequest<Dashboard>("GET", `/stats/dashboard${qs({ delegue_id })}`),
  teamStats: () => apiRequest<Team>("GET", "/stats/team"),

  // Activité terrain, événements d'agenda, analyse des ventes
  activity: (period?: string, delegue_id?: number) =>
    apiRequest<Activity>("GET", `/activity${qs({ period, delegue_id })}`),
  events: (start: string, end: string, delegue_id?: number) =>
    apiRequest<AgendaEvent[]>("GET", `/events${qs({ start, end, delegue_id })}`),
  createEvent: (data: AgendaEventInput) => apiRequest<AgendaEvent>("POST", "/events", data),
  deleteEvent: (id: number) => apiRequest<void>("DELETE", `/events/${id}`),
  sales: (params: { product_id?: number; period?: string; delegue_id?: number } = {}) =>
    apiRequest<Sales>("GET", `/sales${qs(params)}`),
};
