/**
 * Client HTTP minimal pour l'API FastAPI.
 *
 * - Toutes les URLs commencent par /api (Vite redirige vers http://localhost:8000).
 * - L'identifiant de l'utilisateur connecté est envoyé dans l'en-tête X-User-Id
 *   (démo : pas de vraie authentification).
 */
import type {
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
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
  login: (email: string, password: string) => request<User>("POST", "/auth/login", { email, password }),
  users: () => request<User[]>("GET", "/users"),
  team: () => request<User[]>("GET", "/users/team"),
  meta: () => request<Meta>("GET", "/meta"),

  // Médecins
  doctors: (filters: DoctorFilters = {}) => request<DoctorListItem[]>("GET", `/doctors${qs({ ...filters })}`),
  doctor: (id: number) => request<DoctorDetail>("GET", `/doctors/${id}`),
  createDoctor: (data: DoctorInput) => request<Doctor>("POST", "/doctors", data),
  updateDoctor: (id: number, data: DoctorInput) => request<Doctor>("PUT", `/doctors/${id}`, data),

  // Visites
  visits: (filters: VisitFilters = {}) => request<Visit[]>("GET", `/visits${qs({ ...filters })}`),
  visit: (id: number) => request<Visit>("GET", `/visits/${id}`),
  planVisit: (doctor_id: number, planned_at: string, notes?: string) =>
    request<Visit>("POST", "/visits", { doctor_id, planned_at, notes }),
  rescheduleVisit: (id: number, planned_at: string) =>
    request<Visit>("PATCH", `/visits/${id}/reschedule`, { planned_at }),
  cancelVisit: (id: number, reason: string, postpone = false, new_planned_at?: string) =>
    request<Visit>("POST", `/visits/${id}/cancel`, { reason, postpone, new_planned_at }),
  submitReport: (id: number, data: VisitReportInput) => request<Visit>("PUT", `/visits/${id}/report`, data),

  // Produits, objectifs, alertes, statistiques
  products: () => request<Product[]>("GET", "/products"),
  product: (id: number) => request<ProductDetail>("GET", `/products/${id}`),
  objectives: (delegue_id?: number) => request<ObjectiveProgress[]>("GET", `/objectives${qs({ delegue_id })}`),
  alerts: (delegue_id?: number) => request<Alert[]>("GET", `/alerts${qs({ delegue_id })}`),
  updateAlert: (id: number, status: string) => request<Alert>("PATCH", `/alerts/${id}`, { status }),
  dashboard: (delegue_id?: number) => request<Dashboard>("GET", `/stats/dashboard${qs({ delegue_id })}`),
  teamStats: () => request<Team>("GET", "/stats/team"),
};
